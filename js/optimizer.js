// Motor de Optimización de Corte 2D (Guillotine Bin Packing) para MelaminaCut

class CutOptimizer {
    constructor(config = {}) {
        this.planchaLargo = config.planchaLargo || 2440;
        this.planchaAncho = config.planchaAncho || 1830;
        this.espesorSierra = config.espesorSierra !== undefined ? config.espesorSierra : 4;
        this.refilado = config.refilado !== undefined ? config.refilado : 10;
        this.descontarCanto = config.descontarCanto !== undefined ? config.descontarCanto : true;
        this.tieneVetaGlobal = config.tieneVetaGlobal !== undefined ? config.tieneVetaGlobal : false;
        this.metodoCorte = config.metodoCorte || 'optimal'; // 'optimal', 'horizontal', 'vertical'
        
        // Espesores de tapacanto personalizados (en mm)
        this.cantoEspesor = {
            0: 0.0,  // Ninguno
            1: config.cantoDelgadoEspesor !== undefined ? parseFloat(config.cantoDelgadoEspesor) : 0.4,  // Delgado
            2: config.cantoGruesoEspesor !== undefined ? parseFloat(config.cantoGruesoEspesor) : 2.0    // Grueso
        };
    }

    // Procesa el despiece y calcula las dimensiones físicas de corte
    prepareParts(rawParts) {
        const prepared = [];
        
        for (const p of rawParts) {
            const cant = parseInt(p.cant) || 1;
            for (let i = 0; i < cant; i++) {
                let largoFisico = p.largo;
                let anchoFisico = p.ancho;
                
                // Si está activo el descuento de tapacantos
                if (this.descontarCanto && p.cantos) {
                    // Los tapacantos en el Ancho (A1, A2 - los bordes cortos) reducen el Largo físico
                    const cantoA1Val = this.cantoEspesor[p.cantos[2] || 0];
                    const cantoA2Val = this.cantoEspesor[p.cantos[3] || 0];
                    largoFisico -= (cantoA1Val + cantoA2Val);

                    // Los tapacantos en el Largo (L1, L2 - los bordes largos) reducen el Ancho físico
                    const cantoL1Val = this.cantoEspesor[p.cantos[0] || 0];
                    const cantoL2Val = this.cantoEspesor[p.cantos[1] || 0];
                    anchoFisico -= (cantoL1Val + cantoL2Val);
                }

                // Redondear a 1 decimal para precisión de corte
                largoFisico = Math.round(largoFisico * 10) / 10;
                anchoFisico = Math.round(anchoFisico * 10) / 10;

                prepared.push({
                    id: `${p.id || 'p'}_${i}`,
                    name: p.name || `Pieza ${prepared.length + 1}`,
                    largoNominal: p.largo,
                    anchoNominal: p.ancho,
                    largo: largoFisico,
                    ancho: anchoFisico,
                    veta: p.veta && this.tieneVetaGlobal,
                    cantos: p.cantos ? [...p.cantos] : [0, 0, 0, 0],
                    grooves: p.grooves ? [...p.grooves] : [0, 0, 0, 0],
                    material: p.material || "Estándar 18mm",
                    originalIndex: p.index
                });
            }
        }
        
        return prepared;
    }

    // Comprueba si una pieza cabe en un rectángulo libre
    fits(partW, partH, freeW, freeH, forceNoRotate = false) {
        const kerf = this.espesorSierra;
        
        // Caso 1: Orientación normal
        // Si el ancho de la pieza es igual al del espacio, no consume kerf a la derecha
        const reqW1 = (partW === freeW) ? partW : (partW + kerf);
        const reqH1 = (partH === freeH) ? partH : (partH + kerf);
        
        const fitsNormal = (partW <= freeW && partH <= freeH) && 
                           (reqW1 <= freeW || partW === freeW) && 
                           (reqH1 <= freeH || partH === freeH);
                           
        if (forceNoRotate) {
            return fitsNormal ? { fits: true, rotated: false } : { fits: false };
        }

        // Caso 2: Orientación rotada (si se permite)
        const reqW2 = (partH === freeW) ? partH : (partH + kerf);
        const reqH2 = (partW === freeH) ? partW : (partW + kerf);
        
        const fitsRotated = (partH <= freeW && partW <= freeH) && 
                            (reqW2 <= freeW || partH === freeW) && 
                            (reqH2 <= freeH || partW === freeH);

        if (fitsNormal && fitsRotated) {
            // Si cabe de ambas formas, preferimos la que mantenga el lado más largo 
            // alineado con el lado más largo del espacio libre (Best Fit Heuristic)
            const ratioNormal = Math.abs((freeW / freeH) - (partW / partH));
            const ratioRotated = Math.abs((freeW / freeH) - (partH / partW));
            
            if (ratioNormal <= ratioRotated) {
                return { fits: true, rotated: false };
            } else {
                return { fits: true, rotated: true };
            }
        } else if (fitsNormal) {
            return { fits: true, rotated: false };
        } else if (fitsRotated) {
            return { fits: true, rotated: true };
        }

        return { fits: false };
    }

    // Optimiza la distribución de las piezas
    optimize(rawParts) {
        // 1. Preparar y descontar tapacantos
        let allParts = this.prepareParts(rawParts);
        
        // 2. Agrupar piezas por material/espesor
        const groups = {};
        for (const p of allParts) {
            const mat = p.material || "Estándar 18mm";
            if (!groups[mat]) {
                groups[mat] = [];
            }
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
            totalGroovesLength: 0
        };
        
        let totalUsableArea = 0;
        let totalPlacedArea = 0;
        
        // 3. Optimizar cada grupo de material de manera independiente
        for (const matName in groups) {
            const groupParts = groups[matName];
            const groupResult = this.optimizeGroup(groupParts);
            optimizedGroups[matName] = groupResult;
            
            // Acumular métricas globales
            globalMetrics.sheetsCount += groupResult.metrics.sheetsCount;
            globalMetrics.totalCutsLength += groupResult.metrics.totalCutsLength;
            globalMetrics.totalCutsCount += groupResult.metrics.totalCutsCount;
            globalMetrics.cantoDelgado += groupResult.metrics.cantoDelgado;
            globalMetrics.cantoGrueso += groupResult.metrics.cantoGrueso;
            globalMetrics.totalGroovesLength += groupResult.metrics.totalGroovesLength;
            
            const margin = this.refilado;
            const usableAreaPerSheet = (this.planchaLargo - 2 * margin) * (this.planchaAncho - 2 * margin);
            totalUsableArea += groupResult.sheets.length * usableAreaPerSheet;
            
            for (const sheet of groupResult.sheets) {
                for (const p of sheet.placedParts) {
                    totalPlacedArea += p.w * p.h;
                }
            }
        }
        
        globalMetrics.globalEfficiency = totalUsableArea > 0 ? Math.round((totalPlacedArea / totalUsableArea) * 1000) / 10 : 0;
        globalMetrics.totalCutsLength = Math.round(globalMetrics.totalCutsLength * 10) / 10;
        globalMetrics.cantoDelgado = Math.round(globalMetrics.cantoDelgado * 10) / 10;
        globalMetrics.cantoGrueso = Math.round(globalMetrics.cantoGrueso * 10) / 10;
        globalMetrics.totalGroovesLength = Math.round(globalMetrics.totalGroovesLength * 10) / 10;
        
        // Por compatibilidad de la interfaz, si hay grupos devolvemos el primero como el listado principal
        const firstGroupName = Object.keys(optimizedGroups)[0] || "Estándar 18mm";
        const fallbackGroup = optimizedGroups[firstGroupName] || { sheets: [], unplacedParts: [], metrics: { globalEfficiency: 0, sheetsCount: 0, totalCutsLength: 0, totalCutsCount: 0, cantoDelgado: 0, cantoGrueso: 0, totalGroovesLength: 0 } };
        
        return {
            groups: optimizedGroups,
            metrics: globalMetrics,
            sheets: fallbackGroup.sheets,
            unplacedParts: Object.values(optimizedGroups).reduce((acc, g) => acc.concat(g.unplacedParts), [])
        };
    }

    optimizeGroup(parts) {
        // Validar tamaño máximo antes de iniciar
        const maxUsableLargo = this.planchaLargo - 2 * this.refilado;
        const maxUsableAncho = this.planchaAncho - 2 * this.refilado;
        
        const validParts = [];
        const unplacedParts = [];
        
        for (const p of parts) {
            const fitsAsIs = p.largo <= maxUsableLargo && p.ancho <= maxUsableAncho;
            const fitsRotated = p.ancho <= maxUsableLargo && p.largo <= maxUsableAncho;
            
            if (fitsAsIs || (!p.veta && fitsRotated)) {
                validParts.push(p);
            } else {
                unplacedParts.push(p); // Demasiado grande para cualquier plancha
            }
        }

        // Ordenar las piezas por área descendente, y luego por lado mayor descendente
        validParts.sort((a, b) => {
            const areaA = a.largo * a.ancho;
            const areaB = b.largo * b.ancho;
            if (Math.abs(areaA - areaB) > 0.01) {
                return areaB - areaA; // Mayor área primero
            }
            return Math.max(b.largo, b.ancho) - Math.max(a.largo, a.ancho); // Mayor lado primero
        });

        const sheets = [];
        const kerf = this.espesorSierra;
        const margin = this.refilado;
        
        const createNewSheet = () => {
            const sheetId = sheets.length + 1;
            return {
                id: sheetId,
                w: this.planchaLargo,
                h: this.planchaAncho,
                placedParts: [],
                freeRects: [
                    {
                        x: margin,
                        y: margin,
                        w: this.planchaLargo - 2 * margin,
                        h: this.planchaAncho - 2 * margin
                    }
                ],
                cuts: [],
                efficiency: 0
            };
        };

        // Bucle principal para acomodar cada pieza
        for (const part of validParts) {
            let placed = false;
            
            for (const sheet of sheets) {
                const placement = this.findBestFreeRect(part, sheet.freeRects);
                if (placement) {
                    this.placePartOnSheet(part, placement.rect, placement.rotated, sheet);
                    placed = true;
                    break;
                }
            }
            
            if (!placed) {
                const newSheet = createNewSheet();
                const placement = this.findBestFreeRect(part, newSheet.freeRects);
                if (placement) {
                    this.placePartOnSheet(part, placement.rect, placement.rotated, newSheet);
                    sheets.push(newSheet);
                    placed = true;
                } else {
                    unplacedParts.push(part);
                }
            }
        }

        // Calcular métricas
        let totalPlacedArea = 0;
        let totalCorteMetros = 0;
        let totalCantoDelgado = 0;
        let totalCantoGrueso = 0;
        let totalGroovesLength = 0;
        let totalCutsCount = 0;

        for (const sheet of sheets) {
            const usableArea = (this.planchaLargo - 2 * margin) * (this.planchaAncho - 2 * margin);
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
            
            let sheetCutsLength = 0;
            for (const cut of sheet.cuts) {
                const dx = Math.abs(cut.x2 - cut.x1);
                const dy = Math.abs(cut.y2 - cut.y1);
                sheetCutsLength += (dx + dy) / 1000;
            }
            totalCorteMetros += sheetCutsLength;
            totalCutsCount += sheet.cuts.length;
        }

        const totalUsableArea = sheets.length * (this.planchaLargo - 2 * margin) * (this.planchaAncho - 2 * margin);
        const globalEfficiency = totalUsableArea > 0 ? (totalPlacedArea / totalUsableArea) * 100 : 0;

        return {
            sheets: sheets,
            unplacedParts: unplacedParts,
            metrics: {
                globalEfficiency: Math.round(globalEfficiency * 10) / 10,
                sheetsCount: sheets.length,
                totalCutsLength: Math.round(totalCorteMetros * 10) / 10,
                totalCutsCount: totalCutsCount,
                cantoDelgado: Math.round(totalCantoDelgado * 10) / 10,
                cantoGrueso: Math.round(totalCantoGrueso * 10) / 10,
                totalGroovesLength: Math.round(totalGroovesLength * 10) / 10
            }
        };
    }

    // Busca el mejor rectángulo libre usando la regla "Best Area Fit"
    findBestFreeRect(part, freeRects) {
        let bestRect = null;
        let bestIndex = -1;
        let bestArea = Infinity;
        let bestRotated = false;

        const pW = part.largo;
        const pH = part.ancho;

        for (let i = 0; i < freeRects.length; i++) {
            const r = freeRects[i];
            
            // Evaluar ajuste
            const check = this.fits(pW, pH, r.w, r.h, part.veta);
            if (check.fits) {
                const areaRestante = (r.w * r.h) - (pW * pH);
                if (areaRestante < bestArea) {
                    bestArea = areaRestante;
                    bestRect = r;
                    bestIndex = i;
                    bestRotated = check.rotated;
                }
            }
        }

        if (bestRect) {
            return { rect: bestRect, index: bestIndex, rotated: bestRotated };
        }
        return null;
    }

    // Coloca la pieza en el rectángulo libre, remueve el rectángulo libre y genera los nuevos
    placePartOnSheet(part, freeRect, rotated, sheet) {
        const pW = rotated ? part.ancho : part.largo;
        const pH = rotated ? part.largo : part.ancho;
        const kerf = this.espesorSierra;

        // Quitar el rectángulo libre seleccionado
        sheet.freeRects = sheet.freeRects.filter(r => r !== freeRect);

        // Guardar la pieza colocada con sus coordenadas
        sheet.placedParts.push({
            ...part,
            x: freeRect.x,
            y: freeRect.y,
            w: pW,
            h: pH,
            rotated: rotated
        });

        // Calcular los dos nuevos rectángulos resultantes del corte de guillotina
        // Elegimos la dirección del corte basado en qué eje es más corto para mantener los cortes limpios
        // y dejar áreas libres más utilizables.
        
        const wRemanente = freeRect.w - pW;
        const hRemanente = freeRect.h - pH;
        
        let horizontalSplit = true;

        if (wRemanente > 0 && hRemanente > 0) {
            // Heurística de guillotina
            if (this.metodoCorte === 'horizontal') {
                horizontalSplit = true; // Forzar horizontal
            } else if (this.metodoCorte === 'vertical') {
                horizontalSplit = false; // Forzar vertical
            } else {
                // optimal
                if (pW > pH) {
                    horizontalSplit = false; // Corte vertical primario
                } else {
                    horizontalSplit = true;  // Corte horizontal primario
                }
            }
        } else if (wRemanente > 0) {
            horizontalSplit = false; // Solo queda remanente a la derecha
        } else if (hRemanente > 0) {
            horizontalSplit = true;  // Solo queda remanente abajo
        }

        if (horizontalSplit) {
            // CORTE HORIZONTAL PRIMARIO
            // Cortar horizontalmente a lo largo de todo el ancho del rectángulo libre
            const cutY = freeRect.y + pH;
            
            // Registrar línea de corte primario (todo el ancho del bloque libre)
            sheet.cuts.push({
                x1: freeRect.x,
                y1: cutY,
                x2: freeRect.x + freeRect.w,
                y2: cutY,
                level: 1,
                desc: `Corte horizontal a ${Math.round(cutY)}mm`
            });

            // Si queda espacio a la derecha de la pieza (antes del corte horizontal), hacemos un corte vertical secundario
            if (wRemanente > kerf) {
                const cutX = freeRect.x + pW;
                sheet.cuts.push({
                    x1: cutX,
                    y1: freeRect.y,
                    x2: cutX,
                    y2: cutY,
                    level: 2,
                    desc: `Corte vertical a ${Math.round(cutX)}mm para liberar pieza`
                });

                sheet.freeRects.push({
                    x: freeRect.x + pW + kerf,
                    y: freeRect.y,
                    w: wRemanente - kerf,
                    h: pH
                });
            }

            // Rectángulo libre inferior completo
            if (hRemanente > kerf) {
                sheet.freeRects.push({
                    x: freeRect.x,
                    y: cutY + kerf,
                    w: freeRect.w,
                    h: hRemanente - kerf
                });
            }
        } else {
            // CORTE VERTICAL PRIMARIO
            // Cortar verticalmente a lo largo de todo el alto del rectángulo libre
            const cutX = freeRect.x + pW;
            
            // Registrar línea de corte primario
            sheet.cuts.push({
                x1: cutX,
                y1: freeRect.y,
                x2: cutX,
                y2: freeRect.y + freeRect.h,
                level: 1,
                desc: `Corte vertical a ${Math.round(cutX)}mm`
            });

            // Si queda espacio abajo de la pieza (antes del corte vertical), hacemos un corte horizontal secundario
            if (hRemanente > kerf) {
                const cutY = freeRect.y + pH;
                sheet.cuts.push({
                    x1: freeRect.x,
                    y1: cutY,
                    x2: cutX,
                    y2: cutY,
                    level: 2,
                    desc: `Corte horizontal a ${Math.round(cutY)}mm para liberar pieza`
                });

                sheet.freeRects.push({
                    x: freeRect.x,
                    y: cutY + kerf,
                    w: pW,
                    h: hRemanente - kerf
                });
            }

            // Rectángulo libre a la derecha completo
            if (wRemanente > kerf) {
                sheet.freeRects.push({
                    x: cutX + kerf,
                    y: freeRect.y,
                    w: wRemanente - kerf,
                    h: freeRect.h
                });
            }
        }
    }
}
