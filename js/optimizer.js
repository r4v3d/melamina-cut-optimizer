// Motor de Optimización de Corte 2D (Guillotine Bin Packing) para MelaminaCut
// Prueba múltiples heurísticas y elige el layout con menos planchas y más eficiencia.

const OPT_EPS = 0.2; // mm — tolerancia de sierra / error de punto flotante
const MIN_RETAZO_AREA_MM2 = 100000; // 0.1 m² — sobrante que vale la pena guardar
const MIN_RETAZO_LADO_MM = 50;

const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// Generador pseudoaleatorio con semilla (resultados reproducibles)
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Número finito o valor por defecto (respeta el 0; '' / null / NaN → defecto)
function finiteOr(v, def) {
    if (v === '' || v === null || v === undefined) return def;
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
}

class CutOptimizer {
    constructor(config = {}) {
        this.planchaLargo = finiteOr(config.planchaLargo, 0) > 0 ? Number(config.planchaLargo) : 2440;
        this.planchaAncho = finiteOr(config.planchaAncho, 0) > 0 ? Number(config.planchaAncho) : 1830;
        this.espesorSierra = Math.max(0, finiteOr(config.espesorSierra, 4));
        this.refilado = Math.max(0, finiteOr(config.refilado, 10));
        this.descontarCanto = config.descontarCanto !== undefined ? config.descontarCanto : true;
        this.tieneVetaGlobal = config.tieneVetaGlobal !== undefined ? config.tieneVetaGlobal : false;
        this.metodoCorte = config.metodoCorte || 'optimal'; // 'optimal', 'horizontal', 'vertical', 'strips'
        this.preferFewerFenceChanges = config.preferFewerFenceChanges !== undefined
            ? !!config.preferFewerFenceChanges
            : (this.metodoCorte === 'strips');

        this.cantoEspesor = {
            0: 0.0,
            1: Math.max(0, finiteOr(config.cantoDelgadoEspesor, 0.4)),
            2: Math.max(0, finiteOr(config.cantoGruesoEspesor, 2.0))
        };
        // mm extra de tapacanto por lado enchapado (despunte en la enchapadora)
        this.cantoMargenMm = Math.max(0, finiteOr(config.cantoMargenMm, 0));
        // Búsqueda aleatoria adicional tras las heurísticas (0 = desactivada)
        this.searchTimeMs = Math.max(0, finiteOr(config.searchTimeMs, 0));
        this.seed = finiteOr(config.seed, 12345);
        this.config = { ...config };
    }

    static round1(n) {
        return Math.round(n * 10) / 10;
    }

    // Sobrante que conviene guardar como retazo (mismo criterio en métricas y mapa)
    static isUsefulLeftover(r) {
        return r.w * r.h >= MIN_RETAZO_AREA_MM2 && Math.min(r.w, r.h) >= MIN_RETAZO_LADO_MM;
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
                    rowId: p.rowId,
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

    // Optimizador con la plancha propia de un material del catálogo (o este mismo si no hay)
    forMaterial(material) {
        if (!material) return this;
        const override = {};
        if (finiteOr(material.planchaLargo, 0) > 0) override.planchaLargo = material.planchaLargo;
        if (finiteOr(material.planchaAncho, 0) > 0) override.planchaAncho = material.planchaAncho;
        if (typeof material.tieneVetaGlobal === 'boolean') override.tieneVetaGlobal = material.tieneVetaGlobal;
        return new CutOptimizer({ ...this.config, ...override });
    }

    // Configuración efectiva (se guarda en cada grupo para ediciones y métricas posteriores)
    configSnapshot() {
        return {
            ...this.config,
            planchaLargo: this.planchaLargo,
            planchaAncho: this.planchaAncho,
            espesorSierra: this.espesorSierra,
            refilado: this.refilado,
            tieneVetaGlobal: this.tieneVetaGlobal
        };
    }

    /**
     * Optimiza la distribución de las piezas.
     * options.onProgress(fraccion 0..1): avance
     * options.materials: { [material]: { planchaLargo, planchaAncho, tieneVetaGlobal } } plancha por material
     * options.stock: { [material]: [{ id, largo, ancho }] } retazos del inventario a usar primero
     */
    optimize(rawParts, options = {}) {
        const materials = options.materials || {};
        const stock = options.stock || {};

        const rawGroups = {};
        for (const p of rawParts) {
            const mat = p.material || "Estándar 18mm";
            if (!rawGroups[mat]) rawGroups[mat] = [];
            rawGroups[mat].push(p);
        }
        const matNames = Object.keys(rawGroups);
        const groupOpt = {};
        for (const mat of matNames) groupOpt[mat] = this.forMaterial(materials[mat]);

        const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
        const searching = this.searchTimeMs > 0;
        const detWeight = searching ? 0.8 : 1;
        const totalSteps = matNames.reduce((s, mat) => s + groupOpt[mat].strategyCatalog().length, 0) || 1;
        let doneSteps = 0;
        const onStep = onProgress ? () => onProgress(Math.min(1, detWeight * (++doneSteps / totalSteps))) : null;

        const optimizedGroups = {};
        matNames.forEach((mat, gi) => {
            const opt = groupOpt[mat];
            if (searching) opt.searchTimeMs = this.searchTimeMs / matNames.length;
            const onSearch = onProgress && searching
                ? f => onProgress(detWeight + (1 - detWeight) * ((gi + f) / matNames.length))
                : null;
            const result = opt.optimizeGroup(opt.prepareParts(rawGroups[mat]), onStep, stock[mat] || [], onSearch);
            result.config = opt.configSnapshot();
            optimizedGroups[mat] = result;
        });
        if (onProgress) onProgress(1);

        const globalMetrics = this.aggregateMetrics(optimizedGroups);
        const firstGroupName = Object.keys(optimizedGroups)[0] || "Estándar 18mm";
        const fallbackGroup = optimizedGroups[firstGroupName] || { sheets: [] };

        return {
            groups: optimizedGroups,
            metrics: globalMetrics,
            sheets: fallbackGroup.sheets,
            unplacedParts: Object.values(optimizedGroups).reduce((acc, g) => acc.concat(g.unplacedParts), [])
        };
    }

    // Suma las métricas de todos los grupos de material (cada grupo ya tiene group.metrics)
    aggregateMetrics(groups) {
        const global = this.emptyMetrics();
        delete global.leftoverAreaMm2;

        let totalUsableArea = 0;
        let totalPlacedArea = 0;
        let totalLeftover = 0;
        const winningNames = [];

        for (const matName in groups) {
            const group = groups[matName];
            const m = group.metrics || this.emptyMetrics();

            global.sheetsCount += group.sheets.length;
            global.newSheetsCount += group.sheets.filter(s => !s.isRemnant).length;
            global.remnantsUsed += group.sheets.filter(s => s.isRemnant).length;
            global.totalCutsLength += m.totalCutsLength;
            global.totalCutsCount += m.totalCutsCount;
            global.cantoDelgado += m.cantoDelgado;
            global.cantoGrueso += m.cantoGrueso;
            global.totalGroovesLength += m.totalGroovesLength;
            global.uniqueFenceCount += m.uniqueFenceCount || 0;
            totalLeftover += m.leftoverAreaMm2 || 0;
            global.strategiesTried = Math.max(global.strategiesTried, m.strategiesTried || 0);
            if (m.winningStrategy) winningNames.push(m.winningStrategy);

            for (const sheet of group.sheets) {
                totalUsableArea += CutOptimizer.sheetUsableArea(sheet);
                for (const p of sheet.placedParts) {
                    totalPlacedArea += p.w * p.h;
                }
            }
        }

        global.globalEfficiency = totalUsableArea > 0
            ? Math.round((totalPlacedArea / totalUsableArea) * 1000) / 10
            : 0;
        global.totalCutsLength = CutOptimizer.round1(global.totalCutsLength);
        global.cantoDelgado = CutOptimizer.round1(global.cantoDelgado);
        global.cantoGrueso = CutOptimizer.round1(global.cantoGrueso);
        global.totalGroovesLength = CutOptimizer.round1(global.totalGroovesLength);
        global.leftoverAreaM2 = Math.round((totalLeftover / 1e6) * 1000) / 1000;
        global.wastePercent = totalUsableArea > 0
            ? Math.round((1 - totalPlacedArea / totalUsableArea) * 1000) / 10
            : 0;
        global.winningStrategy = winningNames[0] || '';
        return global;
    }

    static sheetUsableArea(sheet) {
        return Math.max(0, sheet.usableW) * Math.max(0, sheet.usableH);
    }

    // Recalcula las métricas tras una edición manual, conservando la info de estrategia
    recomputeMetrics(results) {
        for (const matName in results.groups) {
            const group = results.groups[matName];
            const prev = group.metrics || {};
            const opt = group.config ? new CutOptimizer(group.config) : this;
            group.metrics = opt.computeMetrics(group.sheets, group.unplacedParts);
            group.metrics.winningStrategy = prev.winningStrategy || '';
            group.metrics.strategiesTried = prev.strategiesTried || 0;
        }
        results.metrics = this.aggregateMetrics(results.groups);
        results.unplacedParts = Object.values(results.groups).reduce((acc, g) => acc.concat(g.unplacedParts), []);
        return results;
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

        // Primero: menos planchas nuevas (las que se compran); luego menos planchas en total
        const nA = candidate.sheets.filter(s => !s.isRemnant).length;
        const nB = current.sheets.filter(s => !s.isRemnant).length;
        if (nA !== nB) return nA < nB;

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

    // remnants: retazos del inventario [{ id, largo, ancho }] que se llenan antes de abrir planchas nuevas
    optimizeGroup(parts, onStep = null, remnants = [], onSearch = null) {
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

        const stock = [...remnants]
            .filter(r => finiteOr(r.largo, 0) > 0 && finiteOr(r.ancho, 0) > 0)
            .sort((a, b) => b.largo * b.ancho - a.largo * a.ancho);
        const strategies = this.strategyCatalog();
        let best = null;
        let winningLabel = '';
        let tried = 0;

        const evaluate = (packed, label) => {
            tried++;
            packed.unplacedParts = packed.unplacedParts.concat(unplacedParts.map(p => ({ ...p })));
            packed.metrics = this.computeMetrics(packed.sheets, packed.unplacedParts);
            if (this.isBetterResult(packed, best)) {
                best = packed;
                winningLabel = label;
            }
        };

        for (const strategy of strategies) {
            evaluate(this.packWithStrategy(validParts, strategy, stock), this.strategyLabel(strategy));
            if (onStep) onStep();
        }

        // Búsqueda aleatoria: perturba el orden de las piezas y reempaca mientras quede tiempo
        if (this.searchTimeMs > 0 && validParts.length > 1) {
            const rng = mulberry32(this.seed);
            const start = nowMs();
            const bases = strategies.filter(s => s.pack !== 'strips');
            while (nowMs() - start < this.searchTimeMs) {
                const base = bases[Math.floor(rng() * bases.length)];
                const order = this.sortParts(validParts, base.sort);
                const swaps = Math.max(1, Math.floor(order.length / 3));
                for (let k = 0; k < swaps; k++) {
                    const i = Math.floor(rng() * (order.length - 1));
                    [order[i], order[i + 1]] = [order[i + 1], order[i]];
                }
                evaluate(
                    this.packWithStrategy(order, { ...base, presorted: true }, stock),
                    this.strategyLabel(base) + ' · búsqueda aleatoria'
                );
                if (onSearch) onSearch(Math.min(1, (nowMs() - start) / this.searchTimeMs));
            }
        }

        if (!best) {
            return { sheets: [], unplacedParts, metrics: this.emptyMetrics() };
        }

        best.metrics.winningStrategy = winningLabel;
        best.metrics.strategiesTried = tried;
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
            uniqueFenceCount: 0,
            newSheetsCount: 0,
            remnantsUsed: 0
        };
    }

    newStripId(sheet) {
        sheet.nextStripId = (sheet.nextStripId || 1) + 1;
        return `s${sheet.nextStripId - 1}`;
    }

    // spec opcional para retazos: { w, h, refilado, remnantId }
    createNewSheet(sheetId, spec = null) {
        const w = spec ? spec.w : this.planchaLargo;
        const h = spec ? spec.h : this.planchaAncho;
        const margin = spec && spec.refilado != null ? spec.refilado : this.refilado;
        const usableW = Math.max(0, w - 2 * margin);
        const usableH = Math.max(0, h - 2 * margin);
        return {
            id: sheetId,
            w,
            h,
            refilado: margin,
            kerf: this.espesorSierra,
            usableW,
            usableH,
            isRemnant: !!(spec && spec.remnantId),
            remnantId: spec ? spec.remnantId || null : null,
            nextStripId: 1,
            placedParts: [],
            freeRects: [
                {
                    x: margin,
                    y: margin,
                    w: usableW,
                    h: usableH,
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

    // remnants: retazos (canto ya limpio, sin refilado) que se llenan antes de abrir planchas nuevas
    packWithStrategy(parts, strategy, remnants = []) {
        const sorted = strategy.presorted ? this.cloneParts(parts) : this.sortParts(parts, strategy.sort);
        const sheets = remnants.map((r, i) =>
            this.createNewSheet('R' + (i + 1), { w: r.largo, h: r.ancho, refilado: 0, remnantId: r.id }));
        let newSheets = 0;
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
                const newSheet = this.createNewSheet(++newSheets);
                const placement = strategy.pack === 'strips'
                    ? this.findBestPlacementStrip(part, newSheet.freeRects, strategy.axis || 'H')
                    : this.findBestPlacement(part, newSheet.freeRects, strategy.fit);
                if (placement) {
                    this.placePartOnSheet(part, placement, newSheet, strategy.split);
                    sheets.push(newSheet);
                } else {
                    newSheets--;
                    unplacedParts.push({ ...part, unplacedReason: part.unplacedReason || 'no_space' });
                }
            }
        }

        // Los retazos que no se usaron no forman parte del resultado
        const used = sheets.filter(s => !s.isRemnant || s.placedParts.length > 0);
        for (const sheet of used) {
            this.finalizeSheetCuts(sheet);
        }

        return { sheets: used, unplacedParts, metrics: null };
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
        // Hay que cortar si queda material, aunque sea solo el ancho del kerf
        const needRight = remW > OPT_EPS;
        const needBottom = remH > OPT_EPS;
        // Queda sobrante reutilizable después del kerf
        const hasRight = remW > kerf + OPT_EPS;
        const hasBottom = remH > kerf + OPT_EPS;

        if (!needRight && !needBottom) return null; // llenó el hueco
        if (!needBottom) return false; // solo corte vertical
        if (!needRight) return true;   // solo corte horizontal
        if (hasRight && !hasBottom) return false; // el sobrante útil queda a la derecha
        if (hasBottom && !hasRight) return true;  // el sobrante útil queda abajo
        if (!hasRight && !hasBottom) return true; // ambos restos son solo kerf

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

            if (remW > OPT_EPS) {
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
                        leftover: leftoverW > OPT_EPS
                            ? `sobrante ${Math.round(leftoverW)} × ${Math.round(pH)} mm`
                            : 'sin sobrante útil'
                    },
                    partName: part.name,
                    partId: part.id,
                    region: { x: freeRect.x, y: freeRect.y, w: freeRect.w, h: pH }
                });

                if (remW > kerf + OPT_EPS) {
                    this.pushFreeRect(sheet, {
                        x: freeRect.x + pW + kerf,
                        y: freeRect.y,
                        w: remW - kerf,
                        h: pH
                    }, { stripId: childId, parentStripId: stripId, role: 'strip' });
                }
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

            if (remH > OPT_EPS) {
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
                        leftover: leftoverH > OPT_EPS
                            ? `sobrante ${Math.round(pW)} × ${Math.round(leftoverH)} mm`
                            : 'sin sobrante útil'
                    },
                    partName: part.name,
                    partId: part.id,
                    region: { x: freeRect.x, y: freeRect.y, w: pW, h: freeRect.h }
                });

                if (remH > kerf + OPT_EPS) {
                    this.pushFreeRect(sheet, {
                        x: freeRect.x,
                        y: cutY + kerf,
                        w: pW,
                        h: remH - kerf
                    }, { stripId: childId, parentStripId: stripId, role: 'strip' });
                }
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
        const pieceCuts = (sheet.cuts || []).filter(c => c.kind !== 'refilado');
        if (pieceCuts.length === 0) {
            this.setSheetCuts(sheet, []);
            return;
        }
        sheet.cuts = pieceCuts;

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

        this.setSheetCuts(sheet, ordered);
    }

    // Guarda la secuencia final de la plancha: refilado primero, luego los cortes de piezas
    setSheetCuts(sheet, pieceCuts) {
        const cuts = this.buildTrimCuts(sheet).concat(pieceCuts);
        cuts.forEach((c, idx) => {
            c.seq = idx + 1;
            if (c.kind !== 'refilado') c.desc = this.buildCutDesc(c, sheet);
        });
        sheet.cuts = cuts;
        sheet.sequenceValid = true;
        sheet.sequenceStale = false;
        sheet.uniqueFenceCount = this.countFences(pieceCuts);
    }

    countFences(cuts) {
        const fences = new Set();
        for (const c of cuts) {
            if (c.kind === 'raja' && c.fenceMm) {
                fences.add(Math.round(c.fenceMm));
            }
        }
        if (fences.size === 0) {
            for (const c of cuts) {
                if (c.fenceMm) fences.add(Math.round(c.fenceMm));
            }
        }
        return fences.size;
    }

    // Pasadas de refilado (antes de cualquier raja). No se cobran como metros de corte.
    buildTrimCuts(sheet) {
        const r = sheet.refilado != null ? sheet.refilado : this.refilado;
        if (!(r > OPT_EPS)) return [];
        const W = sheet.w;
        const H = sheet.h;
        const uW = CutOptimizer.round1(sheet.usableW);
        const uH = CutOptimizer.round1(sheet.usableH);
        const base = {
            kind: 'refilado', level: 0, parentStripId: 'sheet',
            stripId: null, leftoverStripId: null, region: null, produces: null
        };
        return [
            {
                ...base, axis: 'H', x1: 0, y1: r, x2: W, y2: r, fenceMm: null, fromEdge: 'ancho',
                desc: `Refilado: recorta ~${r} mm de un borde largo para limpiar el canto de fábrica.`
            },
            {
                ...base, axis: 'V', x1: r, y1: r, x2: r, y2: H, fenceMm: null, fromEdge: 'largo',
                desc: `Refilado: recorta ~${r} mm de un borde corto, a escuadra con el borde ya limpio.`
            },
            {
                ...base, axis: 'H', x1: r, y1: H - r, x2: W, y2: H - r, fenceMm: uH, fromEdge: 'ancho',
                desc: `Refilado: tope a ${uH} mm desde el borde largo limpio. Queda el ancho útil.`
            },
            {
                ...base, axis: 'V', x1: W - r, y1: r, x2: W - r, y2: H - r, fenceMm: uW, fromEdge: 'largo',
                desc: `Refilado: tope a ${uW} mm desde el borde corto limpio. Queda el largo útil de ${uW} × ${uH} mm.`
            }
        ];
    }

    /**
     * Reconstruye la secuencia de guillotina a partir de las posiciones actuales de las piezas
     * (tras girar, quitar o colocar a mano). Devuelve { cuts, freeRects } o null si la
     * distribución no se puede separar solo con cortes de lado a lado.
     */
    deriveGuillotine(sheet) {
        const kerf = sheet.kerf != null ? sheet.kerf : this.espesorSierra;
        const r = sheet.refilado != null ? sheet.refilado : this.refilado;
        const root = { x: r, y: r, w: sheet.usableW, h: sheet.usableH };
        const parts = sheet.placedParts;
        const E = OPT_EPS;

        const inside = (p, reg) => p.x >= reg.x - E && p.y >= reg.y - E &&
            p.x + p.w <= reg.x + reg.w + E && p.y + p.h <= reg.y + reg.h + E;
        if (!parts.every(p => inside(p, root))) return null;

        const lo = (p, axis) => axis === 'V' ? p.x : p.y;
        const hi = (p, axis) => axis === 'V' ? p.x + p.w : p.y + p.h;
        const fills = (p, reg) => CutOptimizer.approxEq(p.x, reg.x) && CutOptimizer.approxEq(p.y, reg.y) &&
            CutOptimizer.approxEq(p.w, reg.w) && CutOptimizer.approxEq(p.h, reg.h);

        // Primera línea de lado a lado (la más cercana al inicio) que no atraviesa ninguna pieza
        const findCut = (reg, ps, axis) => {
            const start = axis === 'V' ? reg.x : reg.y;
            const end = axis === 'V' ? reg.x + reg.w : reg.y + reg.h;
            const cands = [];
            for (const p of ps) {
                cands.push(hi(p, axis), lo(p, axis) - kerf);
            }
            cands.sort((a, b) => a - b);
            for (const c of cands) {
                if (c <= start + E || c >= end - E) continue;
                const kEnd = Math.min(c + kerf, end);
                const crosses = ps.some(p => lo(p, axis) < kEnd - E && hi(p, axis) > c + E);
                if (!crosses) return c;
            }
            return null;
        };

        const dims = reg => `${Math.round(reg.w)} × ${Math.round(reg.h)} mm`;
        const describe = (reg, ps) => {
            if (ps.length === 1 && fills(ps[0], reg)) {
                return `${ps[0].name} (${CutOptimizer.round1(reg.w)}×${CutOptimizer.round1(reg.h)} mm)`;
            }
            return ps.length === 0 ? `sobrante ${dims(reg)}` : `tira ${dims(reg)}`;
        };

        const cuts = [];
        const freeRects = [];
        let idSeq = 0;
        const nextId = () => `d${++idSeq}`;

        const visit = (reg, ps, preferAxis, parentId, depth) => {
            if (ps.length === 0) {
                if (reg.w > E && reg.h > E) {
                    freeRects.push({
                        x: CutOptimizer.round1(reg.x), y: CutOptimizer.round1(reg.y),
                        w: CutOptimizer.round1(reg.w), h: CutOptimizer.round1(reg.h),
                        stripId: parentId, parentStripId: null, role: depth === 0 ? 'sheet' : 'strip'
                    });
                }
                return true;
            }
            if (ps.length === 1 && fills(ps[0], reg)) return true;

            const axes = preferAxis === 'H' ? ['H', 'V'] : ['V', 'H'];
            for (const axis of axes) {
                const c = findCut(reg, ps, axis);
                if (c === null) continue;

                const cutsBefore = cuts.length;
                const freeBefore = freeRects.length;
                let a;
                let b;
                if (axis === 'V') {
                    a = { x: reg.x, y: reg.y, w: c - reg.x, h: reg.h };
                    b = { x: c + kerf, y: reg.y, w: reg.x + reg.w - c - kerf, h: reg.h };
                } else {
                    a = { x: reg.x, y: reg.y, w: reg.w, h: c - reg.y };
                    b = { x: reg.x, y: c + kerf, w: reg.w, h: reg.y + reg.h - c - kerf };
                }
                const hasB = (axis === 'V' ? b.w : b.h) > E;
                const psA = ps.filter(p => hi(p, axis) <= c + E);
                const psB = ps.filter(p => hi(p, axis) > c + E);
                const fullSpan = axis === 'H' ? reg.w >= root.w - E : reg.h >= root.h - E;
                const stripId = nextId();
                const leftoverId = hasB ? nextId() : null;

                cuts.push({
                    x1: axis === 'V' ? c : reg.x,
                    y1: axis === 'V' ? reg.y : c,
                    x2: axis === 'V' ? c : reg.x + reg.w,
                    y2: axis === 'V' ? reg.y + reg.h : c,
                    axis,
                    fenceMm: CutOptimizer.round1(c - (axis === 'V' ? reg.x : reg.y)),
                    fromEdge: axis === 'H' ? 'ancho' : 'largo',
                    kind: fullSpan ? 'raja' : 'traza',
                    level: depth + 1,
                    parentStripId: parentId,
                    stripId,
                    leftoverStripId: leftoverId,
                    produces: {
                        keep: describe(a, psA),
                        leftover: hasB ? (psB.length ? `resto ${dims(b)}` : `sobrante ${dims(b)}`) : 'sin sobrante útil'
                    },
                    partName: psA[0] ? psA[0].name : '',
                    partId: psA[0] ? psA[0].id : null,
                    region: { x: reg.x, y: reg.y, w: reg.w, h: reg.h }
                });

                const other = axis === 'H' ? 'V' : 'H';
                const ok = visit(a, psA, other, stripId, depth + 1) &&
                    (!hasB || visit(b, psB, axis, leftoverId, depth));
                if (ok) return true;
                cuts.length = cutsBefore;
                freeRects.length = freeBefore;
            }
            return false;
        };

        const sheetAxis = root.w >= root.h ? 'H' : 'V';
        if (!visit(root, parts, sheetAxis, 'sheet', 0)) return null;
        return { cuts, freeRects };
    }

    // Espacio libre (sin kerf alrededor de las piezas) como rectángulos sin solape.
    // Se usa cuando la distribución manual no es guillotinable.
    freeSpaceRects(sheet) {
        const kerf = sheet.kerf != null ? sheet.kerf : this.espesorSierra;
        const r = sheet.refilado != null ? sheet.refilado : this.refilado;
        const X1 = r;
        const Y1 = r;
        const X2 = r + sheet.usableW;
        const Y2 = r + sheet.usableH;
        const E = OPT_EPS;
        const blocks = sheet.placedParts.map(p => ({
            x1: Math.max(X1, p.x - kerf), y1: Math.max(Y1, p.y - kerf),
            x2: Math.min(X2, p.x + p.w + kerf), y2: Math.min(Y2, p.y + p.h + kerf)
        }));
        const ys = [...new Set([Y1, Y2, ...blocks.flatMap(b => [b.y1, b.y2])])]
            .filter(y => y >= Y1 - E && y <= Y2 + E)
            .sort((a, b) => a - b);

        const rects = [];
        let open = new Map();
        for (let i = 0; i < ys.length - 1; i++) {
            const ya = ys[i];
            const yb = ys[i + 1];
            if (yb - ya <= E) continue;
            let intervals = [[X1, X2]];
            for (const b of blocks) {
                if (b.y1 >= yb - E || b.y2 <= ya + E) continue;
                const next = [];
                for (const [s, e] of intervals) {
                    if (b.x2 <= s || b.x1 >= e) { next.push([s, e]); continue; }
                    if (b.x1 > s + E) next.push([s, b.x1]);
                    if (b.x2 < e - E) next.push([b.x2, e]);
                }
                intervals = next;
            }
            const nextOpen = new Map();
            for (const [s, e] of intervals) {
                if (e - s <= E) continue;
                const key = `${CutOptimizer.round1(s)}|${CutOptimizer.round1(e)}`;
                let rect = open.get(key);
                if (rect && CutOptimizer.approxEq(rect.y + rect.h, ya)) {
                    rect.h = yb - rect.y;
                } else {
                    rect = { x: s, y: ya, w: e - s, h: yb - ya, role: 'strip' };
                    rects.push(rect);
                }
                nextOpen.set(key, rect);
            }
            open = nextOpen;
        }
        return rects
            .map(rc => ({
                x: CutOptimizer.round1(rc.x), y: CutOptimizer.round1(rc.y),
                w: CutOptimizer.round1(rc.w), h: CutOptimizer.round1(rc.h),
                stripId: null, parentStripId: null, role: 'strip'
            }))
            .filter(rc => rc.w > E && rc.h > E);
    }

    // Tras una edición manual: regenera cortes y sobrantes; si no es guillotinable, marca la secuencia como vencida
    rebuildSheet(sheet) {
        const derived = this.deriveGuillotine(sheet);
        if (derived) {
            sheet.freeRects = derived.freeRects;
            this.setSheetCuts(sheet, derived.cuts);
            return true;
        }
        sheet.freeRects = this.freeSpaceRects(sheet);
        sheet.cuts = [];
        sheet.sequenceValid = false;
        sheet.sequenceStale = true;
        sheet.uniqueFenceCount = 0;
        return false;
    }

    // Coloca a mano una pieza sin ubicar en el mejor hueco de la plancha. Devuelve la pieza colocada o null.
    placeOnSheet(part, sheet) {
        const placement = this.findBestPlacement(part, sheet.freeRects, 'bssf');
        if (!placement) return null;
        const placed = {
            ...part,
            x: CutOptimizer.round1(placement.rect.x),
            y: CutOptimizer.round1(placement.rect.y),
            w: CutOptimizer.round1(placement.w),
            h: CutOptimizer.round1(placement.h),
            rotated: placement.rotated,
            unplacedReason: null
        };
        sheet.placedParts.push(placed);
        this.rebuildSheet(sheet);
        return placed;
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
        let totalUsableArea = 0;
        let totalPlacedArea = 0;
        let totalCorteMetros = 0;
        let totalCantoDelgado = 0;
        let totalCantoGrueso = 0;
        let totalGroovesLength = 0;
        let totalCutsCount = 0;
        let leftoverArea = 0;
        const margenM = this.cantoMargenMm / 1000;

        for (const sheet of sheets) {
            let placedArea = 0;
            const usableArea = CutOptimizer.sheetUsableArea(sheet);
            totalUsableArea += usableArea;

            for (const p of sheet.placedParts) {
                placedArea += p.w * p.h;

                // Cada lado enchapado suma su largo + el despunte configurado
                const largoM = p.largoNominal / 1000 + margenM;
                const anchoM = p.anchoNominal / 1000 + margenM;

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
                        if (g === 1) totalGroovesLength += p.largoNominal / 1000;
                    });
                    [p.grooves[2], p.grooves[3]].forEach(g => {
                        if (g === 1) totalGroovesLength += p.anchoNominal / 1000;
                    });
                }
            }

            sheet.efficiency = usableArea > 0 ? (placedArea / usableArea) * 100 : 0;
            totalPlacedArea += placedArea;

            for (const r of sheet.freeRects) {
                if (CutOptimizer.isUsefulLeftover(r)) leftoverArea += r.w * r.h;
            }

            // El refilado se muestra en la secuencia pero no se cobra como corte de piezas
            let sheetCutsLength = 0;
            let sheetCutsCount = 0;
            for (const cut of sheet.cuts) {
                if (cut.kind === 'refilado') continue;
                sheetCutsLength += (Math.abs(cut.x2 - cut.x1) + Math.abs(cut.y2 - cut.y1)) / 1000;
                sheetCutsCount++;
            }
            totalCorteMetros += sheetCutsLength;
            totalCutsCount += sheetCutsCount;
        }

        const globalEfficiency = totalUsableArea > 0 ? (totalPlacedArea / totalUsableArea) * 100 : 0;

        return {
            globalEfficiency: Math.round(globalEfficiency * 10) / 10,
            sheetsCount: sheets.length,
            newSheetsCount: sheets.filter(s => !s.isRemnant).length,
            remnantsUsed: sheets.filter(s => s.isRemnant).length,
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

export { CutOptimizer, OPT_EPS };
