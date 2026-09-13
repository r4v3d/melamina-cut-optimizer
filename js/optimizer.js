// Motor de Optimización de Corte 2D (Guillotine Bin Packing) para MelaminaCut
// Prueba múltiples heurísticas y elige el layout con menos planchas y más eficiencia.

const OPT_EPS = 0.2; // mm — tolerancia de sierra / error de punto flotante

class CutOptimizer {
    constructor(config = {}) {
        this.planchaLargo = config.planchaLargo || 2440;
        this.planchaAncho = config.planchaAncho || 1830;
        this.espesorSierra = config.espesorSierra !== undefined ? config.espesorSierra : 4;
        this.refilado = config.refilado !== undefined ? config.refilado : 10;
        this.descontarCanto = config.descontarCanto !== undefined ? config.descontarCanto : true;
        this.tieneVetaGlobal = config.tieneVetaGlobal !== undefined ? config.tieneVetaGlobal : false;
        this.metodoCorte = config.metodoCorte || 'optimal'; // 'optimal', 'horizontal', 'vertical', 'strips'
        this.preferFewerFenceChanges = config.preferFewerFenceChanges !== undefined
            ? !!config.preferFewerFenceChanges
            : (this.metodoCorte === 'strips');

        this.cantoEspesor = {
            0: 0.0,
            1: config.cantoDelgadoEspesor !== undefined ? parseFloat(config.cantoDelgadoEspesor) : 0.4,
            2: config.cantoGruesoEspesor !== undefined ? parseFloat(config.cantoGruesoEspesor) : 2.0
        };
    }

    static round1(n) {
        return Math.round(n * 10) / 10;
    }

    static approxEq(a, b, eps = OPT_EPS) {
        return Math.abs(a - b) <= eps;
    }

    static approxLte(a, b, eps = OPT_EPS) {
        return a <= b + eps;
    }

    // Procesa el despiece y calcula las dimensiones físicas de corte
    prepareParts(rawParts) {
        const prepared = [];

        for (const p of rawParts) {
            const cant = parseInt(p.cant, 10) || 1;
            for (let i = 0; i < cant; i++) {
                let largoFisico = Number(p.largo) || 0;
                let anchoFisico = Number(p.ancho) || 0;

                if (this.descontarCanto && p.cantos) {
                    const cantoA1Val = this.cantoEspesor[p.cantos[2] || 0] || 0;
                    const cantoA2Val = this.cantoEspesor[p.cantos[3] || 0] || 0;
                    largoFisico -= (cantoA1Val + cantoA2Val);

                    const cantoL1Val = this.cantoEspesor[p.cantos[0] || 0] || 0;
                    const cantoL2Val = this.cantoEspesor[p.cantos[1] || 0] || 0;
                    anchoFisico -= (cantoL1Val + cantoL2Val);
                }

                largoFisico = CutOptimizer.round1(largoFisico);
                anchoFisico = CutOptimizer.round1(anchoFisico);

                const invalid = largoFisico <= 0 || anchoFisico <= 0;

                prepared.push({
                    id: `${p.id || 'p'}_${i}`,
                    name: p.name || `Pieza ${prepared.length + 1}`,
                    largoNominal: p.largo,
                    anchoNominal: p.ancho,
                    largo: largoFisico,
                    ancho: anchoFisico,
                    veta: !!(p.veta && this.tieneVetaGlobal),
                    cantos: p.cantos ? [...p.cantos] : [0, 0, 0, 0],
                    grooves: p.grooves ? [...p.grooves] : [0, 0, 0, 0],
                    material: p.material || "Estándar 18mm",
                    color: p.color || "#06b6d4",
                    originalIndex: p.index,
                    invalid: invalid,
                    unplacedReason: invalid ? 'invalid_size' : null
                });
            }
        }

        return prepared;
    }

    /**
     * Una pieza cabe si:
     *  - cabe físicamente, y
     *  - en cada eje o bien llena el hueco (corte innecesario) o deja al menos el kerf para separar.
     * Si el sobrante es menor que el kerf, no se puede cortar a medida exacta.
     */
    canFit(partW, partH, freeW, freeH) {
        if (!CutOptimizer.approxLte(partW, freeW) || !CutOptimizer.approxLte(partH, freeH)) {
            return false;
        }
        const remW = freeW - partW;
        const remH = freeH - partH;
        const okW = remW <= OPT_EPS || remW + OPT_EPS >= this.espesorSierra;
        const okH = remH <= OPT_EPS || remH + OPT_EPS >= this.espesorSierra;
        return okW && okH;
    }

    orientationsFor(part, freeW, freeH) {
        const out = [];
        if (this.canFit(part.largo, part.ancho, freeW, freeH)) {
            out.push({ rotated: false, w: part.largo, h: part.ancho });
        }
        if (!part.veta && !CutOptimizer.approxEq(part.largo, part.ancho)) {
            if (this.canFit(part.ancho, part.largo, freeW, freeH)) {
                out.push({ rotated: true, w: part.ancho, h: part.largo });
            }
        }
        return out;
    }

    scorePlacement(rect, w, h, fitRule) {
        const remW = Math.max(0, rect.w - w);
        const remH = Math.max(0, rect.h - h);
        const shortSide = Math.min(remW, remH);
        const longSide = Math.max(remW, remH);
        const area = remW * remH;

        switch (fitRule) {
            case 'bssf':
                return shortSide * 1e9 + longSide;
            case 'blsf':
                return longSide * 1e9 + shortSide;
            case 'bl':
                return rect.y * 1e9 + rect.x;
            case 'wf':
                return -(area);
            case 'baf':
            default:
                return area * 1e3 + shortSide;
        }
    }

    // Optimiza la distribución de las piezas
    optimize(rawParts) {
        const allParts = this.prepareParts(rawParts);

        const groups = {};
        for (const p of allParts) {
            const mat = p.material || "Estándar 18mm";
            if (!groups[mat]) groups[mat] = [];
            groups[mat].push(p);
        }

        const optimizedGroups = {};
        const globalMetrics = {
            globalEfficiency: 0,
            sheetsCount: 0,
            totalCutsLength: 0,
            totalCutsCount: 0,
            cantoDelgado: 0,
            cantoGrueso: 0,
            totalGroovesLength: 0,
            leftoverAreaM2: 0,
            wastePercent: 0,
            strategiesTried: 0,
            winningStrategy: '',
            uniqueFenceCount: 0
        };

        let totalUsableArea = 0;
        let totalPlacedArea = 0;
        let totalLeftover = 0;
        const winningNames = [];
        let strategiesTried = 0;

        for (const matName in groups) {
            const groupResult = this.optimizeGroup(groups[matName]);
            optimizedGroups[matName] = groupResult;

            globalMetrics.sheetsCount += groupResult.metrics.sheetsCount;
            globalMetrics.totalCutsLength += groupResult.metrics.totalCutsLength;
            globalMetrics.totalCutsCount += groupResult.metrics.totalCutsCount;
            globalMetrics.cantoDelgado += groupResult.metrics.cantoDelgado;
            globalMetrics.cantoGrueso += groupResult.metrics.cantoGrueso;
            globalMetrics.totalGroovesLength += groupResult.metrics.totalGroovesLength;
            totalLeftover += groupResult.metrics.leftoverAreaMm2 || 0;
            globalMetrics.uniqueFenceCount += groupResult.metrics.uniqueFenceCount || 0;
            strategiesTried = Math.max(strategiesTried, groupResult.metrics.strategiesTried || 0);
            if (groupResult.metrics.winningStrategy) {
                winningNames.push(groupResult.metrics.winningStrategy);
            }

            const usableAreaPerSheet = this.usableWidth() * this.usableHeight();
            totalUsableArea += groupResult.sheets.length * usableAreaPerSheet;

            for (const sheet of groupResult.sheets) {
                for (const p of sheet.placedParts) {
                    totalPlacedArea += p.w * p.h;
                }
            }
        }

        globalMetrics.globalEfficiency = totalUsableArea > 0
            ? Math.round((totalPlacedArea / totalUsableArea) * 1000) / 10
            : 0;
        globalMetrics.totalCutsLength = CutOptimizer.round1(globalMetrics.totalCutsLength);
        globalMetrics.cantoDelgado = CutOptimizer.round1(globalMetrics.cantoDelgado);
        globalMetrics.cantoGrueso = CutOptimizer.round1(globalMetrics.cantoGrueso);
        globalMetrics.totalGroovesLength = CutOptimizer.round1(globalMetrics.totalGroovesLength);
        globalMetrics.leftoverAreaM2 = Math.round((totalLeftover / 1e6) * 1000) / 1000;
        globalMetrics.wastePercent = totalUsableArea > 0
            ? Math.round((1 - totalPlacedArea / totalUsableArea) * 1000) / 10
            : 0;
        globalMetrics.strategiesTried = strategiesTried;
        globalMetrics.winningStrategy = winningNames[0] || '';

        const firstGroupName = Object.keys(optimizedGroups)[0] || "Estándar 18mm";
        const fallbackGroup = optimizedGroups[firstGroupName] || {
            sheets: [],
            unplacedParts: [],
            metrics: { ...globalMetrics, sheetsCount: 0 }
        };

        return {
            groups: optimizedGroups,
            metrics: globalMetrics,
            sheets: fallbackGroup.sheets,
            unplacedParts: Object.values(optimizedGroups).reduce((acc, g) => acc.concat(g.unplacedParts), [])
        };
    }

    usableWidth() {
        return Math.max(0, this.planchaLargo - 2 * this.refilado);
    }

    usableHeight() {
        return Math.max(0, this.planchaAncho - 2 * this.refilado);
    }

    cloneParts(parts) {
        return parts.map(p => ({ ...p, cantos: [...p.cantos], grooves: [...p.grooves] }));
    }

    sortParts(parts, sortRule) {
        const sorted = this.cloneParts(parts);
        const area = p => p.largo * p.ancho;
        const maxSide = p => Math.max(p.largo, p.ancho);
        const minSide = p => Math.min(p.largo, p.ancho);

        sorted.sort((a, b) => {
            let cmp = 0;
            switch (sortRule) {
                case 'maxside':
                    cmp = maxSide(b) - maxSide(a) || minSide(b) - minSide(a);
                    break;
                case 'height':
                    cmp = b.ancho - a.ancho || b.largo - a.largo;
                    break;
                case 'width':
                    cmp = b.largo - a.largo || b.ancho - a.ancho;
                    break;
                case 'perimeter':
                    cmp = (b.largo + b.ancho) - (a.largo + a.ancho) || area(b) - area(a);
                    break;
                case 'diff':
                    cmp = Math.abs(b.largo - b.ancho) - Math.abs(a.largo - a.ancho) || area(b) - area(a);
                    break;
                case 'area':
                default:
                    cmp = area(b) - area(a) || maxSide(b) - maxSide(a);
                    break;
            }
            if (Math.abs(cmp) > 0.01) return cmp;
            return String(a.name).localeCompare(String(b.name));
        });
        return sorted;
    }

    strategyCatalog() {
        if (this.metodoCorte === 'strips') {
            return [
                { sort: 'height', fit: 'bl', split: 'horizontal', pack: 'strips', axis: 'H' },
                { sort: 'width', fit: 'bl', split: 'vertical', pack: 'strips', axis: 'V' },
                { sort: 'height', fit: 'bssf', split: 'horizontal', pack: 'strips', axis: 'H' },
                { sort: 'width', fit: 'bssf', split: 'vertical', pack: 'strips', axis: 'V' },
                { sort: 'area', fit: 'bl', split: 'horizontal' },
                { sort: 'area', fit: 'bl', split: 'vertical' }
            ];
        }

        const splits = this.metodoCorte === 'horizontal'
            ? ['horizontal']
            : this.metodoCorte === 'vertical'
                ? ['vertical']
                : ['maxleftover', 'shorter', 'longer', 'horizontal', 'vertical'];

        const base = [
            { sort: 'area', fit: 'bssf' },
            { sort: 'area', fit: 'baf' },
            { sort: 'maxside', fit: 'bssf' },
            { sort: 'maxside', fit: 'baf' },
            { sort: 'height', fit: 'bssf' },
            { sort: 'width', fit: 'bssf' },
            { sort: 'perimeter', fit: 'blsf' },
            { sort: 'diff', fit: 'bssf' },
            { sort: 'area', fit: 'bl' },
            { sort: 'area', fit: 'wf' }
        ];

        const strategies = [];
        for (const b of base) {
            for (const split of splits) {
                strategies.push({ ...b, split });
            }
        }

        if (this.metodoCorte === 'optimal' || this.preferFewerFenceChanges) {
            strategies.push(
                { sort: 'height', fit: 'bl', split: 'horizontal', pack: 'strips', axis: 'H' },
                { sort: 'width', fit: 'bl', split: 'vertical', pack: 'strips', axis: 'V' }
            );
        }
        return strategies;
    }

    strategyLabel(s) {
        const sortNames = {
            area: 'área',
            maxside: 'lado mayor',
            height: 'ancho',
            width: 'largo',
            perimeter: 'perímetro',
            diff: 'alargadas'
        };
        const fitNames = {
            bssf: 'mejor lado corto',
            baf: 'mejor área',
            blsf: 'mejor lado largo',
            bl: 'abajo-izquierda',
            wf: 'peor área'
        };
        const splitNames = {
            maxleftover: 'máx. sobrante',
            shorter: 'eje corto',
            longer: 'eje largo',
            horizontal: 'tiras horizontales',
            vertical: 'tiras verticales'
        };
        const packNote = s.pack === 'strips' ? ' · pack tiras' : '';
        return `${sortNames[s.sort] || s.sort} · ${fitNames[s.fit] || s.fit} · ${splitNames[s.split] || s.split}${packNote}`;
    }

    isBetterResult(candidate, current) {
        if (!current) return true;

        const uA = candidate.unplacedParts.length;
        const uB = current.unplacedParts.length;
        if (uA !== uB) return uA < uB;

        const sA = candidate.sheets.length;
        const sB = current.sheets.length;
        if (sA !== sB) return sA < sB;

        const fA = candidate.metrics.uniqueFenceCount || 0;
        const fB = current.metrics.uniqueFenceCount || 0;
        const eA = candidate.metrics.globalEfficiency;
        const eB = current.metrics.globalEfficiency;

        if (this.preferFewerFenceChanges || this.metodoCorte === 'strips') {
            if (fA !== fB) return fA < fB;
            if (Math.abs(eA - eB) > 0.05) return eA > eB;
        } else {
            if (Math.abs(eA - eB) > 1.0) return eA > eB;
            if (fA !== fB) return fA < fB;
            if (Math.abs(eA - eB) > 0.05) return eA > eB;
        }

        const cA = candidate.metrics.totalCutsCount;
        const cB = current.metrics.totalCutsCount;
        if (cA !== cB) return cA < cB;

        return candidate.metrics.totalCutsLength < current.metrics.totalCutsLength;
    }

    optimizeGroup(parts) {
        const maxUsableLargo = this.usableWidth();
        const maxUsableAncho = this.usableHeight();

        const validParts = [];
        const unplacedParts = [];

        for (const p of parts) {
            if (p.invalid) {
                unplacedParts.push(p);
                continue;
            }

            const fitsAsIs = this.canFit(p.largo, p.ancho, maxUsableLargo, maxUsableAncho);
            const fitsRotated = !p.veta && this.canFit(p.ancho, p.largo, maxUsableLargo, maxUsableAncho);

            if (fitsAsIs || fitsRotated) {
                validParts.push(p);
            } else {
                unplacedParts.push({ ...p, unplacedReason: 'too_large' });
            }
        }

        if (validParts.length === 0) {
            return {
                sheets: [],
                unplacedParts,
                metrics: this.emptyMetrics()
            };
        }

        const strategies = this.strategyCatalog();
        let best = null;
        let winning = null;

        for (const strategy of strategies) {
            const packed = this.packWithStrategy(validParts, strategy);
            packed.unplacedParts = packed.unplacedParts.concat(unplacedParts.map(p => ({ ...p })));
            packed.metrics = this.computeMetrics(packed.sheets, packed.unplacedParts);
            packed.metrics.winningStrategy = this.strategyLabel(strategy);
            packed.metrics.strategiesTried = strategies.length;

            if (this.isBetterResult(packed, best)) {
                best = packed;
                winning = strategy;
            }
        }

        if (!best) {
            return { sheets: [], unplacedParts, metrics: this.emptyMetrics() };
        }

        best.metrics.winningStrategy = this.strategyLabel(winning);
        best.metrics.strategiesTried = strategies.length;
        return best;
    }

    emptyMetrics() {
        return {
            globalEfficiency: 0,
            sheetsCount: 0,
            totalCutsLength: 0,
            totalCutsCount: 0,
            cantoDelgado: 0,
            cantoGrueso: 0,
            totalGroovesLength: 0,
            leftoverAreaMm2: 0,
            leftoverAreaM2: 0,
            wastePercent: 0,
            strategiesTried: 0,
            winningStrategy: '',
            uniqueFenceCount: 0
        };
    }

    newStripId(sheet) {
        sheet.nextStripId = (sheet.nextStripId || 1) + 1;
        return `s${sheet.nextStripId - 1}`;
    }

    createNewSheet(sheetId) {
        const margin = this.refilado;
        return {
            id: sheetId,
            w: this.planchaLargo,
            h: this.planchaAncho,
            refilado: margin,
            usableW: this.usableWidth(),
            usableH: this.usableHeight(),
            nextStripId: 1,
            placedParts: [],
            freeRects: [
                {
                    x: margin,
                    y: margin,
                    w: this.usableWidth(),
                    h: this.usableHeight(),
                    stripId: 'sheet',
                    parentStripId: null,
                    role: 'sheet'
                }
            ],
            cuts: [],
            efficiency: 0,
            uniqueFenceCount: 0,
            sequenceValid: true
        };
    }

    packWithStrategy(parts, strategy) {
        const sorted = this.sortParts(parts, strategy.sort);
        const sheets = [];
        const unplacedParts = [];

        for (const part of sorted) {
            let placed = false;

            for (const sheet of sheets) {
                const placement = strategy.pack === 'strips'
                    ? this.findBestPlacementStrip(part, sheet.freeRects, strategy.axis || 'H')
                    : this.findBestPlacement(part, sheet.freeRects, strategy.fit);
                if (placement) {
                    this.placePartOnSheet(part, placement, sheet, strategy.split);
                    placed = true;
                    break;
                }
            }

            if (!placed) {
                const newSheet = this.createNewSheet(sheets.length + 1);
                const placement = strategy.pack === 'strips'
                    ? this.findBestPlacementStrip(part, newSheet.freeRects, strategy.axis || 'H')
                    : this.findBestPlacement(part, newSheet.freeRects, strategy.fit);
                if (placement) {
                    this.placePartOnSheet(part, placement, newSheet, strategy.split);
                    sheets.push(newSheet);
                } else {
                    unplacedParts.push({ ...part, unplacedReason: part.unplacedReason || 'no_space' });
                }
            }
        }

        for (const sheet of sheets) {
            this.finalizeSheetCuts(sheet);
        }

        return { sheets, unplacedParts, metrics: null };
    }

    findBestPlacementStrip(part, freeRects, axis) {
        let best = null;
        let bestScore = Infinity;

        for (let i = 0; i < freeRects.length; i++) {
            const r = freeRects[i];
            if (r.w <= OPT_EPS || r.h <= OPT_EPS) continue;

            const orients = this.orientationsFor(part, r.w, r.h);
            for (const o of orients) {
                const thick = axis === 'V' ? o.w : o.h;
                const rectThick = axis === 'V' ? r.w : r.h;
                const match = Math.abs(thick - rectThick) <= 1.0 ? 0 : 1;
                const bl = r.y * 1e6 + r.x;
                const score = match * 1e12 + bl + (rectThick - thick);
                if (score < bestScore) {
                    bestScore = score;
                    best = { rect: r, index: i, rotated: o.rotated, w: o.w, h: o.h };
                }
            }
        }

        return best;
    }

    findBestPlacement(part, freeRects, fitRule) {
        let best = null;
        let bestScore = Infinity;

        for (let i = 0; i < freeRects.length; i++) {
            const r = freeRects[i];
            if (r.w <= OPT_EPS || r.h <= OPT_EPS) continue;

            const orients = this.orientationsFor(part, r.w, r.h);
            for (const o of orients) {
                const score = this.scorePlacement(r, o.w, o.h, fitRule);
                if (score < bestScore) {
                    bestScore = score;
                    best = { rect: r, index: i, rotated: o.rotated, w: o.w, h: o.h };
                }
            }
        }

        return best;
    }

    chooseSplit(freeRect, pW, pH, splitRule) {
        const kerf = this.espesorSierra;
        const remW = freeRect.w - pW;
        const remH = freeRect.h - pH;
        const hasRight = remW > kerf + OPT_EPS;
        const hasBottom = remH > kerf + OPT_EPS;

        if (hasRight && !hasBottom) return false; // vertical (solo derecha)
        if (hasBottom && !hasRight) return true;  // horizontal (solo abajo)
        if (!hasRight && !hasBottom) return null; // llenó el hueco

        if (splitRule === 'horizontal') return true;
        if (splitRule === 'vertical') return false;

        const rightOfPiece = (remW - kerf) * pH;
        const belowFull = freeRect.w * (remH - kerf);
        const belowPiece = pW * (remH - kerf);
        const rightFull = (remW - kerf) * freeRect.h;

        const maxH = Math.max(rightOfPiece, belowFull);
        const maxV = Math.max(belowPiece, rightFull);
        const minH = Math.min(rightOfPiece, belowFull);
        const minV = Math.min(belowPiece, rightFull);

        if (splitRule === 'shorter') {
            return remH <= remW;
        }
        if (splitRule === 'longer') {
            return remH > remW;
        }
        if (splitRule === 'minleftover') {
            return minH >= minV ? true : false;
        }
        // maxleftover (default): conserva el hueco utilizable más grande
        if (Math.abs(maxH - maxV) > 1) {
            return maxH >= maxV;
        }
        return remH <= remW;
    }

    placePartOnSheet(part, placement, sheet, splitRule) {
        const freeRect = placement.rect;
        const pW = placement.w;
        const pH = placement.h;
        const rotated = placement.rotated;
        const kerf = this.espesorSierra;
        const parentId = freeRect.stripId || 'sheet';
        const isSheet = freeRect.role === 'sheet' || parentId === 'sheet';

        sheet.freeRects = sheet.freeRects.filter(r => r !== freeRect);

        sheet.placedParts.push({
            ...part,
            x: CutOptimizer.round1(freeRect.x),
            y: CutOptimizer.round1(freeRect.y),
            w: CutOptimizer.round1(pW),
            h: CutOptimizer.round1(pH),
            rotated: rotated
        });

        const remW = freeRect.w - pW;
        const remH = freeRect.h - pH;
        const horizontalSplit = this.chooseSplit(freeRect, pW, pH, splitRule);
        const keepLabel = `${part.name} (${CutOptimizer.round1(pW)}×${CutOptimizer.round1(pH)} mm)`;

        if (horizontalSplit === null) {
            return;
        }

        if (horizontalSplit) {
            const cutY = freeRect.y + pH;
            const stripId = this.newStripId(sheet);
            const leftoverId = this.newStripId(sheet);
            const leftoverH = remH - kerf;
            const leftoverW = remW - kerf;

            if (remH > OPT_EPS) {
                this.pushCut(sheet, {
                    x1: freeRect.x,
                    y1: cutY,
                    x2: freeRect.x + freeRect.w,
                    y2: cutY,
                    axis: 'H',
                    fenceMm: CutOptimizer.round1(pH),
                    fromEdge: 'ancho',
                    kind: isSheet ? 'raja' : 'traza',
                    level: 1,
                    parentStripId: parentId,
                    stripId,
                    leftoverStripId: remH > kerf + OPT_EPS ? leftoverId : null,
                    produces: {
                        keep: isSheet
                            ? `tira ${Math.round(freeRect.w)} × ${Math.round(pH)} mm`
                            : keepLabel,
                        leftover: leftoverH > OPT_EPS
                            ? `sobrante ${Math.round(freeRect.w)} × ${Math.round(Math.max(leftoverH, 0))} mm`
                            : 'sin sobrante útil'
                    },
                    partName: part.name,
                    partId: part.id,
                    region: { x: freeRect.x, y: freeRect.y, w: freeRect.w, h: freeRect.h }
                });
            }

            if (remW > kerf + OPT_EPS) {
                const cutX = freeRect.x + pW;
                const childId = this.newStripId(sheet);
                this.pushCut(sheet, {
                    x1: cutX,
                    y1: freeRect.y,
                    x2: cutX,
                    y2: cutY,
                    axis: 'V',
                    fenceMm: CutOptimizer.round1(pW),
                    fromEdge: 'largo',
                    kind: 'traza',
                    level: 2,
                    parentStripId: stripId,
                    stripId: childId,
                    leftoverStripId: null,
                    produces: {
                        keep: keepLabel,
                        leftover: `sobrante ${Math.round(leftoverW)} × ${Math.round(pH)} mm`
                    },
                    partName: part.name,
                    partId: part.id,
                    region: { x: freeRect.x, y: freeRect.y, w: freeRect.w, h: pH }
                });

                this.pushFreeRect(sheet, {
                    x: freeRect.x + pW + kerf,
                    y: freeRect.y,
                    w: remW - kerf,
                    h: pH
                }, { stripId: childId, parentStripId: stripId, role: 'strip' });
            }

            if (remH > kerf + OPT_EPS) {
                this.pushFreeRect(sheet, {
                    x: freeRect.x,
                    y: cutY + kerf,
                    w: freeRect.w,
                    h: remH - kerf
                }, { stripId: leftoverId, parentStripId: parentId, role: isSheet ? 'sheet' : 'strip' });
            }
        } else {
            const cutX = freeRect.x + pW;
            const stripId = this.newStripId(sheet);
            const leftoverId = this.newStripId(sheet);
            const leftoverH = remH - kerf;
            const leftoverW = remW - kerf;

            if (remW > OPT_EPS) {
                this.pushCut(sheet, {
                    x1: cutX,
                    y1: freeRect.y,
                    x2: cutX,
                    y2: freeRect.y + freeRect.h,
                    axis: 'V',
                    fenceMm: CutOptimizer.round1(pW),
                    fromEdge: 'largo',
                    kind: isSheet ? 'raja' : 'traza',
                    level: 1,
                    parentStripId: parentId,
                    stripId,
                    leftoverStripId: remW > kerf + OPT_EPS ? leftoverId : null,
                    produces: {
                        keep: isSheet
                            ? `tira ${Math.round(pW)} × ${Math.round(freeRect.h)} mm`
                            : keepLabel,
                        leftover: leftoverW > OPT_EPS
                            ? `sobrante ${Math.round(Math.max(leftoverW, 0))} × ${Math.round(freeRect.h)} mm`
                            : 'sin sobrante útil'
                    },
                    partName: part.name,
                    partId: part.id,
                    region: { x: freeRect.x, y: freeRect.y, w: freeRect.w, h: freeRect.h }
                });
            }

            if (remH > kerf + OPT_EPS) {
                const cutY = freeRect.y + pH;
                const childId = this.newStripId(sheet);
                this.pushCut(sheet, {
                    x1: freeRect.x,
                    y1: cutY,
                    x2: cutX,
                    y2: cutY,
                    axis: 'H',
                    fenceMm: CutOptimizer.round1(pH),
                    fromEdge: 'ancho',
                    kind: 'traza',
                    level: 2,
                    parentStripId: stripId,
                    stripId: childId,
                    leftoverStripId: null,
                    produces: {
                        keep: keepLabel,
                        leftover: `sobrante ${Math.round(pW)} × ${Math.round(leftoverH)} mm`
                    },
                    partName: part.name,
                    partId: part.id,
                    region: { x: freeRect.x, y: freeRect.y, w: pW, h: freeRect.h }
                });

                this.pushFreeRect(sheet, {
                    x: freeRect.x,
                    y: cutY + kerf,
                    w: pW,
                    h: remH - kerf
                }, { stripId: childId, parentStripId: stripId, role: 'strip' });
            }

            if (remW > kerf + OPT_EPS) {
                this.pushFreeRect(sheet, {
                    x: cutX + kerf,
                    y: freeRect.y,
                    w: remW - kerf,
                    h: freeRect.h
                }, { stripId: leftoverId, parentStripId: parentId, role: isSheet ? 'sheet' : 'strip' });
            }
        }
    }

    pushCut(sheet, cut) {
        sheet.cuts.push(cut);
    }

    buildCutDesc(cut, sheet) {
        const fence = Math.round((cut.fenceMm || 0) * 10) / 10;
        const keep = (cut.produces && cut.produces.keep) || cut.partName || 'pieza';
        const leftover = (cut.produces && cut.produces.leftover) || '';
        const leftoverTxt = leftover ? ` ${leftover.charAt(0).toUpperCase()}${leftover.slice(1)}.` : '';

        if (cut.kind === 'raja') {
            const sideMm = cut.axis === 'H'
                ? Math.round(sheet.usableH || sheet.h)
                : Math.round(sheet.usableW || sheet.w);
            const sideName = cut.axis === 'H' ? 'ancho' : 'largo';
            return `Raja: tope a ${fence} mm en el ${sideName} (${sideMm} mm). Sale ${keep}.${leftoverTxt}`;
        }
        return `Sobre la tira: traza, tope a ${fence} mm. Sale ${keep}.${leftoverTxt}`;
    }

    finalizeSheetCuts(sheet) {
        if (!sheet.cuts || sheet.cuts.length === 0) {
            sheet.uniqueFenceCount = 0;
            sheet.sequenceValid = true;
            return;
        }

        const childrenOf = {};
        for (const c of sheet.cuts) {
            const p = c.parentStripId || 'sheet';
            if (!childrenOf[p]) childrenOf[p] = [];
            childrenOf[p].push(c);
        }

        const ordered = [];
        const visited = new Set();
        const visit = (stripId) => {
            const kids = childrenOf[stripId] || [];
            for (const c of kids) {
                if (visited.has(c)) continue;
                visited.add(c);
                ordered.push(c);
                if (c.stripId) visit(c.stripId);
                if (c.leftoverStripId) visit(c.leftoverStripId);
            }
        };
        visit('sheet');
        for (const c of sheet.cuts) {
            if (!visited.has(c)) ordered.push(c);
        }

        ordered.forEach((c, idx) => {
            c.seq = idx + 1;
            c.desc = this.buildCutDesc(c, sheet);
        });
        sheet.cuts = ordered;
        sheet.sequenceValid = true;

        const fences = new Set();
        for (const c of sheet.cuts) {
            if (c.kind === 'raja' && c.fenceMm) {
                fences.add(Math.round(c.fenceMm));
            }
        }
        if (fences.size === 0) {
            for (const c of sheet.cuts) {
                if (c.fenceMm) fences.add(Math.round(c.fenceMm));
            }
        }
        sheet.uniqueFenceCount = fences.size;
    }

    pushFreeRect(sheet, rect, meta = {}) {
        const w = CutOptimizer.round1(rect.w);
        const h = CutOptimizer.round1(rect.h);
        if (w > OPT_EPS && h > OPT_EPS) {
            sheet.freeRects.push({
                x: CutOptimizer.round1(rect.x),
                y: CutOptimizer.round1(rect.y),
                w,
                h,
                stripId: meta.stripId || this.newStripId(sheet),
                parentStripId: meta.parentStripId || null,
                role: meta.role || 'strip'
            });
        }
    }

    computeMetrics(sheets, unplacedParts) {
        const margin = this.refilado;
        const usableArea = this.usableWidth() * this.usableHeight();
        let totalPlacedArea = 0;
        let totalCorteMetros = 0;
        let totalCantoDelgado = 0;
        let totalCantoGrueso = 0;
        let totalGroovesLength = 0;
        let totalCutsCount = 0;
        let leftoverArea = 0;

        for (const sheet of sheets) {
            let placedArea = 0;

            for (const p of sheet.placedParts) {
                placedArea += p.w * p.h;

                const largoM = p.largoNominal / 1000;
                const anchoM = p.anchoNominal / 1000;

                [p.cantos[0], p.cantos[1]].forEach(c => {
                    if (c === 1) totalCantoDelgado += largoM;
                    if (c === 2) totalCantoGrueso += largoM;
                });

                [p.cantos[2], p.cantos[3]].forEach(c => {
                    if (c === 1) totalCantoDelgado += anchoM;
                    if (c === 2) totalCantoGrueso += anchoM;
                });

                if (p.grooves) {
                    [p.grooves[0], p.grooves[1]].forEach(g => {
                        if (g === 1) totalGroovesLength += largoM;
                    });
                    [p.grooves[2], p.grooves[3]].forEach(g => {
                        if (g === 1) totalGroovesLength += anchoM;
                    });
                }
            }

            sheet.efficiency = usableArea > 0 ? (placedArea / usableArea) * 100 : 0;
            totalPlacedArea += placedArea;

            for (const r of sheet.freeRects) {
                leftoverArea += r.w * r.h;
            }

            let sheetCutsLength = 0;
            for (const cut of sheet.cuts) {
                sheetCutsLength += (Math.abs(cut.x2 - cut.x1) + Math.abs(cut.y2 - cut.y1)) / 1000;
            }
            totalCorteMetros += sheetCutsLength;
            totalCutsCount += sheet.cuts.length;
        }

        const totalUsableArea = sheets.length * usableArea;
        const globalEfficiency = totalUsableArea > 0 ? (totalPlacedArea / totalUsableArea) * 100 : 0;

        return {
            globalEfficiency: Math.round(globalEfficiency * 10) / 10,
            sheetsCount: sheets.length,
            totalCutsLength: CutOptimizer.round1(totalCorteMetros),
            totalCutsCount,
            cantoDelgado: CutOptimizer.round1(totalCantoDelgado),
            cantoGrueso: CutOptimizer.round1(totalCantoGrueso),
            totalGroovesLength: CutOptimizer.round1(totalGroovesLength),
            leftoverAreaMm2: leftoverArea,
            leftoverAreaM2: Math.round((leftoverArea / 1e6) * 1000) / 1000,
            wastePercent: totalUsableArea > 0
                ? Math.round((1 - totalPlacedArea / totalUsableArea) * 1000) / 10
                : 0,
            unplacedCount: (unplacedParts || []).length,
            uniqueFenceCount: sheets.reduce((sum, s) => sum + (s.uniqueFenceCount || 0), 0)
        };
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CutOptimizer };
}
