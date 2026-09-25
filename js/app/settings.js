// Configuración de plancha, taller y costos: valores por defecto, validación y lectura

import { dom } from './dom.js';
import { num, withDefaults } from '../utils.js';
import { updateCurrencyLabels } from './currency.js';

// Única fuente de valores por defecto (HTML, Limpiar Todo y carga de estado)
export const DEFAULTS = {
    plancha: { largo: 2440, ancho: 1830, espesor: 18, material: 'Blanco Masisa', presetId: '' },
    parametros: {
        sierra: 4, refilado: 10, descontarCanto: true, tieneVeta: false,
        metodoCorte: 'optimal', preferFewerFenceChanges: false,
        cantoDelgadoEspesor: 0.4, cantoGruesoEspesor: 2.0,
        grooveOffset: 15, grooveWidth: 4, grooveDepth: 8,
        usarRetazos: false, busquedaExtra: true, cantoMargenMm: 0
    },
    costos: {
        plancha: 120, corte: 1.5, cantoDel: 2.0, cantoGru: 6.0, ranura: 3.0, moneda: 'PEN',
        manoObra: 0, herrajes: 0, margenGanancia: 0, impuesto: 0
    }
};

// Parámetros obligatorios del taller: [input, etiqueta, mínimo, ¿debe ser > mínimo?]
const requiredParams = [
    [dom.inputLargo, 'Largo de plancha', 0, true],
    [dom.inputAncho, 'Ancho de plancha', 0, true],
    [dom.inputSierra, 'Corte sierra (kerf)', 0, false],
    [dom.inputRefilado, 'Refilado', 0, false],
    [dom.inputCantoDelgadoVal, 'Grosor canto delgado', 0, false],
    [dom.inputCantoGruesoVal, 'Grosor canto grueso', 0, false],
    [dom.inputCantoMargen, 'Despunte de tapacanto', 0, false]
];

// Tiempo de búsqueda aleatoria extra cuando está activada
const SEARCH_TIME_MS = 400;

export function clearInvalidInputs() {
    requiredParams.forEach(([input]) => input.classList.remove('input-invalid'));
}

// Devuelve la lista de campos inválidos y los marca en rojo
export function validateWorkshopParams() {
    const invalid = [];
    requiredParams.forEach(([input, label, min, strict]) => {
        const n = num(input.value, NaN);
        const ok = Number.isFinite(n) && (strict ? n > min : n >= min);
        input.classList.toggle('input-invalid', !ok);
        if (!ok) invalid.push({ input, label });
    });
    return invalid;
}

// Configuración para CutOptimizer a partir de los inputs
export function readOptimizerConfig() {
    return {
        planchaLargo: num(dom.inputLargo.value, DEFAULTS.plancha.largo),
        planchaAncho: num(dom.inputAncho.value, DEFAULTS.plancha.ancho),
        espesorSierra: num(dom.inputSierra.value, DEFAULTS.parametros.sierra),
        refilado: num(dom.inputRefilado.value, DEFAULTS.parametros.refilado),
        descontarCanto: dom.checkDescontarCanto.checked,
        tieneVetaGlobal: dom.checkTieneVeta.checked,
        metodoCorte: dom.selectMetodoCorte.value,
        preferFewerFenceChanges: !!(dom.checkPreferFence && dom.checkPreferFence.checked),
        cantoDelgadoEspesor: num(dom.inputCantoDelgadoVal.value, DEFAULTS.parametros.cantoDelgadoEspesor),
        cantoGruesoEspesor: num(dom.inputCantoGruesoVal.value, DEFAULTS.parametros.cantoGruesoEspesor),
        cantoMargenMm: num(dom.inputCantoMargen.value, DEFAULTS.parametros.cantoMargenMm),
        searchTimeMs: dom.checkBusquedaExtra.checked ? SEARCH_TIME_MS : 0
    };
}

export function readGrooveSpec() {
    return {
        offset: num(dom.inputGrooveOffset.value, DEFAULTS.parametros.grooveOffset),
        width: num(dom.inputGrooveWidth.value, DEFAULTS.parametros.grooveWidth),
        depth: num(dom.inputGrooveDepth.value, DEFAULTS.parametros.grooveDepth)
    };
}

export function readCosts() {
    return {
        plancha: num(dom.inputCostoPlancha.value, 0),
        corte: num(dom.inputCostoCorte.value, 0),
        cantoDel: num(dom.inputCostoCantoDel.value, 0),
        cantoGru: num(dom.inputCostoCantoGru.value, 0),
        ranura: num(dom.inputCostoRanura.value, 0),
        manoObra: num(dom.inputCostoManoObra.value, 0),
        herrajes: num(dom.inputCostoHerrajes.value, 0),
        margenGanancia: num(dom.inputMargenGanancia.value, 0),
        impuesto: num(dom.inputImpuesto.value, 0),
        moneda: dom.selectMoneda.value
    };
}

// Estado serializable del sidebar
export function readSettings() {
    return {
        plancha: {
            largo: dom.inputLargo.value,
            ancho: dom.inputAncho.value,
            espesor: dom.selectEspesor.value,
            material: dom.inputMaterial.value,
            presetId: dom.selectPlanchaPreset.value
        },
        parametros: {
            sierra: dom.inputSierra.value,
            refilado: dom.inputRefilado.value,
            descontarCanto: dom.checkDescontarCanto.checked,
            tieneVeta: dom.checkTieneVeta.checked,
            metodoCorte: dom.selectMetodoCorte.value,
            preferFewerFenceChanges: !!(dom.checkPreferFence && dom.checkPreferFence.checked),
            cantoDelgadoEspesor: dom.inputCantoDelgadoVal.value,
            cantoGruesoEspesor: dom.inputCantoGruesoVal.value,
            grooveOffset: dom.inputGrooveOffset.value,
            grooveWidth: dom.inputGrooveWidth.value,
            grooveDepth: dom.inputGrooveDepth.value,
            usarRetazos: dom.checkUsarRetazos.checked,
            busquedaExtra: dom.checkBusquedaExtra.checked,
            cantoMargenMm: dom.inputCantoMargen.value
        },
        costos: {
            plancha: dom.inputCostoPlancha.value,
            corte: dom.inputCostoCorte.value,
            cantoDel: dom.inputCostoCantoDel.value,
            cantoGru: dom.inputCostoCantoGru.value,
            ranura: dom.inputCostoRanura.value,
            moneda: dom.selectMoneda.value,
            manoObra: dom.inputCostoManoObra.value,
            herrajes: dom.inputCostoHerrajes.value,
            margenGanancia: dom.inputMargenGanancia.value,
            impuesto: dom.inputImpuesto.value
        }
    };
}

// Vuelca configuración (guardada o por defecto) en los inputs del sidebar
export function applySettings(saved = {}) {
    const pl = withDefaults(DEFAULTS.plancha, saved.plancha);
    const pa = withDefaults(DEFAULTS.parametros, saved.parametros);
    const co = withDefaults(DEFAULTS.costos, saved.costos);

    dom.inputLargo.value = pl.largo;
    dom.inputAncho.value = pl.ancho;
    dom.selectEspesor.value = pl.espesor;
    dom.inputMaterial.value = pl.material;
    dom.selectPlanchaPreset.value = pl.presetId;

    dom.inputSierra.value = pa.sierra;
    dom.inputRefilado.value = pa.refilado;
    dom.checkDescontarCanto.checked = !!pa.descontarCanto;
    dom.checkTieneVeta.checked = !!pa.tieneVeta;
    dom.selectMetodoCorte.value = pa.metodoCorte;
    if (dom.checkPreferFence) dom.checkPreferFence.checked = !!pa.preferFewerFenceChanges;
    dom.inputCantoDelgadoVal.value = pa.cantoDelgadoEspesor;
    dom.inputCantoGruesoVal.value = pa.cantoGruesoEspesor;
    dom.inputGrooveOffset.value = pa.grooveOffset;
    dom.inputGrooveWidth.value = pa.grooveWidth;
    dom.inputGrooveDepth.value = pa.grooveDepth;
    dom.checkUsarRetazos.checked = !!pa.usarRetazos;
    dom.checkBusquedaExtra.checked = !!pa.busquedaExtra;
    dom.inputCantoMargen.value = pa.cantoMargenMm;

    dom.inputCostoPlancha.value = co.plancha;
    dom.inputCostoCorte.value = co.corte;
    dom.inputCostoCantoDel.value = co.cantoDel;
    dom.inputCostoCantoGru.value = co.cantoGru;
    dom.inputCostoRanura.value = co.ranura;
    dom.selectMoneda.value = co.moneda;
    dom.inputCostoManoObra.value = co.manoObra;
    dom.inputCostoHerrajes.value = co.herrajes;
    dom.inputMargenGanancia.value = co.margenGanancia;
    dom.inputImpuesto.value = co.impuesto;

    updateCurrencyLabels();
    clearInvalidInputs();
    updateWorkshopChecklist();
}

export function updateWorkshopChecklist() {
    const vetaEl = document.getElementById('chk-veta-state');
    const cantoEl = document.getElementById('chk-canto-state');
    if (vetaEl) {
        vetaEl.textContent = `Veta global: ${dom.checkTieneVeta.checked ? 'ON' : 'OFF'}`;
        vetaEl.classList.toggle('is-on', dom.checkTieneVeta.checked);
    }
    if (cantoEl) {
        cantoEl.textContent = `Descontar canto: ${dom.checkDescontarCanto.checked ? 'ON' : 'OFF'}`;
        cantoEl.classList.toggle('is-on', dom.checkDescontarCanto.checked);
    }
}

export function initSettings() {
    requiredParams.forEach(([input]) => {
        input.addEventListener('input', () => input.classList.remove('input-invalid'));
    });
}
