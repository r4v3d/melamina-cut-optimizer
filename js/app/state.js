// Estado compartido de la aplicación

import { CutOptimizer } from '../optimizer.js';

export const state = {
    results: null,            // último resultado de optimización (incluye results.config)
    activeMaterialGroup: '',  // grupo de material mostrado en el mapa
    activeSheetIndex: 0,
    activeCutStepIndex: -1,   // corte resaltado (-1 = ninguno)
    printReportDirty: true,
    lastQuote: null,          // desglose del último presupuesto
    canvas: null              // instancia de CutMapCanvas
};

export function currentGroup() {
    if (!state.results) return null;
    return state.results.groups[state.activeMaterialGroup] || null;
}

export function currentSheet() {
    const group = currentGroup();
    return group ? group.sheets[state.activeSheetIndex] || null : null;
}

// Optimizador con la configuración con la que se calcularon los resultados actuales
export function optimizerForResults() {
    return new CutOptimizer((state.results && state.results.config) || {});
}

// Optimizador con la plancha propia del grupo de material (catálogo)
export function optimizerForGroup(group) {
    return new CutOptimizer((group && group.config) || (state.results && state.results.config) || {});
}

// "Plancha 2" o "Retazo 1100×400" para títulos y etiquetas
export function sheetTitle(sheet, index) {
    return sheet.isRemnant ? `Retazo ${Math.round(sheet.w)}×${Math.round(sheet.h)}` : `Plancha ${index + 1}`;
}
