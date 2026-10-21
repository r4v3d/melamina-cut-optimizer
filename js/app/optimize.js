// Ejecución del optimizador en un Web Worker (con respaldo en el hilo principal)

import { dom } from './dom.js';
import { state } from './state.js';
import { CutOptimizer } from '../optimizer.js';
import { num } from '../utils.js';
import { readOptimizerConfig, validateWorkshopParams } from './settings.js';
import { readRawParts, applyRowWarnings } from './parts-table.js';
import { onNewResults } from './results.js';
import { toast, confirmDialog } from './ui-feedback.js';
import { materialsStore, retazosStore } from './store.js';
import { isPro } from './plan.js';

const optimizeBtnDefaultHtml = dom.btnOptimize.innerHTML;
let optimizeGeneration = 0;
let worker = null;
let cancelPending = null; // rechaza la promesa de la optimización en curso al reemplazarla
let workerUnavailable = false;

export function markResultsStale() {
    if (state.results && dom.resultsStaleBanner) dom.resultsStaleBanner.hidden = false;
}

async function confirmWorkshopParams() {
    const kerf = num(dom.inputSierra.value, 0);
    const refilado = num(dom.inputRefilado.value, 0);
    if (kerf > 8 && !await confirmDialog(`El corte de sierra (kerf) es ${kerf} mm, mayor a lo habitual (8 mm). ¿Continuar?`, { title: 'Revisar kerf', okLabel: 'Continuar' })) return false;
    if (refilado > 20 && !await confirmDialog(`El refilado es ${refilado} mm, mayor a lo habitual (20 mm). ¿Continuar?`, { title: 'Revisar refilado', okLabel: 'Continuar' })) return false;
    return true;
}

function runOnMainThread(config, rawParts, options) {
    return new CutOptimizer(config).optimize(rawParts, options);
}

// Plancha por material (catálogo) y retazos disponibles (si se pidió usarlos). Ambos son Pro.
function readOptimizeOptions() {
    const pro = isPro();
    return {
        materials: pro ? materialsStore.optimizerMap() : {},
        stock: pro && dom.checkUsarRetazos.checked ? retazosStore.stockMap() : {}
    };
}

// Resuelve con los resultados; rechaza con {cancelled:true} si otra optimización la reemplazó
function runInWorker(config, rawParts, options, onProgress) {
    return new Promise((resolve, reject) => {
        if (worker) {
            worker.terminate(); // cancela la optimización anterior
            worker = null;
        }
        if (cancelPending) cancelPending();
        cancelPending = () => reject(Object.assign(new Error('cancelada'), { cancelled: true }));
        let w;
        try {
            w = new Worker(new URL('../optimizer.worker.js', import.meta.url), { type: 'module' });
        } catch (e) {
            workerUnavailable = true;
            resolve(runOnMainThread(config, rawParts, options));
            return;
        }
        worker = w;
        let gotMessage = false;

        w.onmessage = (e) => {
            gotMessage = true;
            const msg = e.data;
            if (msg.type === 'progress') {
                onProgress(msg.value);
            } else if (msg.type === 'done') {
                w.terminate();
                if (worker === w) worker = null;
                resolve(msg.results);
            } else if (msg.type === 'error') {
                w.terminate();
                if (worker === w) worker = null;
                reject(new Error(msg.message));
            }
        };
        w.onerror = (e) => {
            w.terminate();
            if (worker === w) worker = null;
            if (!gotMessage) {
                // El worker no pudo cargar (navegador antiguo, CSP, etc.): calcular aquí
                workerUnavailable = true;
                try {
                    resolve(runOnMainThread(config, rawParts, options));
                } catch (err) {
                    reject(err);
                }
            } else {
                reject(new Error(e.message || 'Error en el worker de optimización'));
            }
        };
        w.postMessage({ config, rawParts, options });
    });
}

function setBusy(busy, progress = 0) {
    dom.btnOptimize.disabled = busy;
    dom.btnOptimize.classList.toggle('is-busy', busy);
    dom.btnOptimize.innerHTML = busy
        ? `<span>Optimizando… ${Math.round(progress * 100)}%</span>`
        : optimizeBtnDefaultHtml;
}

export async function runOptimization() {
    const rawParts = readRawParts();
    if (rawParts.length === 0) {
        toast('Ingrese al menos una pieza con largo, ancho y cantidad mayores a cero.', { type: 'warn' });
        return;
    }

    const invalid = validateWorkshopParams();
    if (invalid.length) {
        toast(`Revise antes de optimizar: ${invalid.map(i => i.label).join(', ')}.`, { type: 'error' });
        invalid[0].input.focus();
        return;
    }

    applyRowWarnings();
    if (!await confirmWorkshopParams()) return;

    const config = readOptimizerConfig();
    const options = readOptimizeOptions();
    const gen = ++optimizeGeneration;
    setBusy(true);

    try {
        const results = workerUnavailable
            ? runOnMainThread(config, rawParts, options)
            : await runInWorker(config, rawParts, options, (p) => {
                if (gen === optimizeGeneration) setBusy(true, p);
            });
        if (gen !== optimizeGeneration) return;
        // Configuración con la que se calculó (las ediciones posteriores no deben leer inputs cambiados)
        results.config = config;
        onNewResults(results);
    } catch (err) {
        if (gen === optimizeGeneration) {
            toast(`Error de optimización: ${err.message}`, { type: 'error' });
        }
    } finally {
        if (gen === optimizeGeneration) setBusy(false);
    }
}

export function initOptimize() {
    dom.btnOptimize.addEventListener('click', runOptimization);
}
