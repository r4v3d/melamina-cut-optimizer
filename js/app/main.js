// Punto de entrada de MelaminaCut: crea el mapa y conecta los módulos de la interfaz

import { dom, costInputs, grooveInputs } from './dom.js';
import { state } from './state.js';
import { CutMapCanvas } from '../canvas.js';
import { PLANCHA_PRESETS } from '../presets.js';
import { applySettings, initSettings, readSettings, updateWorkshopChecklist } from './settings.js';
import { addNewRow, getRowData, highlightRow, initPartsTable } from './parts-table.js';
import { initOptimize, markResultsStale } from './optimize.js';
import { clearResults, initResults, onCanvasEdit, onNewResults } from './results.js';
import { toast } from './ui-feedback.js';
import { initSequence } from './sequence.js';
import { initPrintReport } from './print-report.js';
import { initExportPdf } from './export-pdf.js';
import { initImporter } from './importer.js';
import { initTheme } from './theme.js';
import { initWorkshopMode } from './workshop-mode.js';
import { initCatalogUi } from './catalog-ui.js';
import { initRetazosUi } from './retazos-ui.js';
import { initProjectsUi } from './projects-ui.js';
import { initFurnitureUi } from './furniture-ui.js';
import { initQuoteUi } from './quote-ui.js';
import { initExportsUi } from './exports-ui.js';
import { initPlan, onPlanChange } from './plan.js';
import { renderQuote } from './results.js';
import { loadStateFromLocalStorage, saveStateToLocalStorage } from './persistence.js';
import { isNativeApp, initNative } from './native.js';

state.canvas = new CutMapCanvas('cut-map-canvas', {
    onEdit: onCanvasEdit,
    onNotice: msg => toast(msg, { type: 'warn' }),
    onHoverPart: part => highlightRow(part ? part.rowId : null)
});

// Presets de plancha ("Personalizada" cuando las medidas se escriben a mano)
dom.selectPlanchaPreset.appendChild(new Option('Personalizada (medidas a mano)', ''));
PLANCHA_PRESETS.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    dom.selectPlanchaPreset.appendChild(opt);
});
dom.selectPlanchaPreset.addEventListener('change', (e) => {
    const selected = PLANCHA_PRESETS.find(p => p.id === e.target.value);
    if (!selected) return;
    dom.inputLargo.value = selected.largo;
    dom.inputAncho.value = selected.ancho;
    dom.selectEspesor.value = selected.espesor;
    dom.inputMaterial.value = selected.material;
    saveStateToLocalStorage();
});
[dom.inputLargo, dom.inputAncho].forEach(input => {
    input.addEventListener('input', () => { dom.selectPlanchaPreset.value = ''; });
});

// Guía "Cómo empezar": se muestra la primera vez y con el botón "¿Cómo se usa?"
const WELCOME_KEY = 'melaminacut_welcome_seen';
const welcomeCard = document.getElementById('welcome-card');
function showWelcome(show) {
    if (!welcomeCard) return;
    welcomeCard.hidden = !show;
    if (show) welcomeCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function dismissWelcome() {
    showWelcome(false);
    try { localStorage.setItem(WELCOME_KEY, '1'); } catch (e) { /* sin almacenamiento */ }
}
document.getElementById('btn-help')?.addEventListener('click', () => showWelcome(true));
document.getElementById('btn-welcome-close')?.addEventListener('click', dismissWelcome);
document.getElementById('btn-welcome-example')?.addEventListener('click', () => {
    dismissWelcome();
    dom.btnLoadPresetMueble.click();
    document.querySelector('.parts-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
try {
    if (!localStorage.getItem(WELCOME_KEY) && welcomeCard) welcomeCard.hidden = false;
} catch (e) { /* sin almacenamiento */ }

// Menú "Más": se cierra al elegir una opción o al hacer clic fuera
document.querySelectorAll('.actions-menu').forEach(menu => {
    menu.addEventListener('click', (e) => {
        if (e.target.closest('.actions-menu-item')) menu.open = false;
    });
    document.addEventListener('click', (e) => {
        if (menu.open && !menu.contains(e.target)) menu.open = false;
    });
});

// Limpiar Todo se aplica al instante y se puede deshacer desde el aviso
dom.btnClearAll.addEventListener('click', () => {
    const snapshot = {
        settings: readSettings(),
        parts: [...dom.partsTbody.querySelectorAll('.part-row')].map(getRowData),
        results: state.results,
        stale: dom.resultsStaleBanner && !dom.resultsStaleBanner.hidden
    };

    dom.partsTbody.innerHTML = '';
    addNewRow();
    applySettings({});
    dom.selectPlanchaPreset.selectedIndex = 0;
    dom.selectMueblePreset.selectedIndex = 0;
    clearResults();
    saveStateToLocalStorage();

    toast('Se limpió el proyecto.', {
        action: {
            label: 'Deshacer',
            onClick: () => {
                applySettings(snapshot.settings);
                dom.partsTbody.innerHTML = '';
                snapshot.parts.forEach(p => addNewRow(p));
                if (snapshot.results) {
                    onNewResults(snapshot.results);
                    if (snapshot.stale) markResultsStale();
                }
                saveStateToLocalStorage();
            }
        }
    });
});

// Cualquier cambio del sidebar se guarda; los que cambian el layout piden reoptimizar
document.querySelectorAll('.sidebar-config input, .sidebar-config select').forEach(el => {
    el.addEventListener('change', () => {
        saveStateToLocalStorage();
        updateWorkshopChecklist();
        if (!costInputs.includes(el) && !grooveInputs.includes(el)) markResultsStale();
    });
});

// Tarjetas del sidebar plegables (el estado abierto/cerrado se recuerda)
const COLLAPSE_KEY = 'melaminacut_sidebar_sections';
function initCollapsibleCards() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '{}'); } catch (e) { saved = {}; }

    document.querySelectorAll('.sidebar-config .glass-card').forEach((card, i) => {
        const title = card.querySelector(':scope > .card-title');
        if (!title) return;
        const key = `s${i}`;

        const body = document.createElement('div');
        body.className = 'card-body';
        body.id = `sidebar-card-body-${i}`;
        while (title.nextSibling) body.appendChild(title.nextSibling);
        card.appendChild(body);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'card-toggle';
        btn.setAttribute('aria-controls', body.id);
        while (title.firstChild) btn.appendChild(title.firstChild);
        const chevron = document.createElement('span');
        chevron.className = 'card-toggle-chevron';
        chevron.setAttribute('aria-hidden', 'true');
        chevron.textContent = '▾';
        btn.appendChild(chevron);
        title.appendChild(btn);

        const setOpen = (open) => {
            btn.setAttribute('aria-expanded', String(open));
            body.hidden = !open;
            card.classList.toggle('is-collapsed', !open);
        };
        // Abierta salvo que el usuario la cierre (o la tarjeta venga plegada por defecto)
        setOpen(key in saved ? saved[key] !== false : !card.hasAttribute('data-collapsed-default'));
        btn.addEventListener('click', () => {
            const open = btn.getAttribute('aria-expanded') !== 'true';
            setOpen(open);
            saved[key] = open;
            try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(saved)); } catch (e) { /* sin almacenamiento */ }
        });
    });
}

initTheme();
initCollapsibleCards();
initSettings();
initPartsTable();
initOptimize();
initResults();
initSequence();
initPrintReport();
initExportPdf();
initImporter();
initWorkshopMode();
initCatalogUi();
initRetazosUi();
initProjectsUi();
initFurnitureUi();
initQuoteUi();
initExportsUi();

// La licencia se verifica antes de la primera optimización (el catálogo y los retazos son Pro)
initNative();
await initPlan();
onPlanChange(() => {
    renderQuote();
    markResultsStale();
});

loadStateFromLocalStorage();

// PWA: instalable y usable sin conexión (solo en http/https)
// (en la app Android los archivos ya vienen dentro del APK: no hace falta)
if (!isNativeApp && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(err => {
            console.warn('No se pudo registrar el service worker:', err);
        });
    });
}
