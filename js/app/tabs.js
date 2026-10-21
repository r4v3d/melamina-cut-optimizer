// Navegación por pestañas (como SketchCut): Piezas · Planchas · Resultado · Cortar · Costos

import { state } from './state.js';

const TAB_KEY = 'melaminacut_tab';
const TABS = ['piezas', 'planchas', 'resultado', 'corte', 'costos'];
let current = 'piezas';

export function currentTab() {
    return current;
}

export function setTab(tab, { scroll = true } = {}) {
    if (!TABS.includes(tab)) tab = 'piezas';
    current = tab;
    document.body.dataset.tab = tab;
    document.querySelectorAll('.app-tab').forEach(btn => {
        const active = btn.dataset.tab === tab;
        btn.setAttribute('aria-selected', String(active));
        btn.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll('[data-panel]').forEach(el => {
        el.classList.toggle('panel-active', el.dataset.panel.split(' ').includes(tab));
    });
    try { localStorage.setItem(TAB_KEY, tab); } catch (e) { /* sin almacenamiento */ }
    if (scroll) window.scrollTo({ top: 0 });
    // El mapa estaba oculto (ancho 0): reajustarlo al mostrarse
    if ((tab === 'resultado') && state.canvas) {
        requestAnimationFrame(() => state.canvas.fitToScreen());
    }
}

// Número de planchas en la pestaña Resultado
export function updateResultBadge(results) {
    const badge = document.getElementById('tab-badge-resultado');
    if (!badge) return;
    const n = results ? (results.metrics.newSheetsCount ?? results.metrics.sheetsCount) + (results.metrics.remnantsUsed || 0) : 0;
    badge.hidden = !n;
    badge.textContent = n ? String(n) : '';
    const empty = document.getElementById('empty-results');
    if (empty) empty.hidden = !!results;
}

export function initTabs() {
    document.querySelectorAll('.app-tab').forEach(btn => {
        btn.setAttribute('aria-selected', 'false');
        btn.addEventListener('click', () => setTab(btn.dataset.tab));
        // Flechas izquierda/derecha entre pestañas (accesibilidad)
        btn.addEventListener('keydown', (e) => {
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
            const i = TABS.indexOf(btn.dataset.tab);
            const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
            setTab(next);
            document.querySelector(`.app-tab[data-tab="${next}"]`)?.focus();
        });
    });

    document.addEventListener('click', (e) => {
        const go = e.target.closest('[data-goto-tab]');
        if (go) setTab(go.dataset.gotoTab);
        // Botones que repiten una acción de otra pestaña (p. ej. cotización en Costos)
        const proxy = e.target.closest('[data-proxy-click]');
        if (proxy) document.getElementById(proxy.dataset.proxyClick)?.click();
    });

    let saved = 'piezas';
    try { saved = localStorage.getItem(TAB_KEY) || 'piezas'; } catch (e) { /* sin almacenamiento */ }
    setTab(saved, { scroll: false });
    updateResultBadge(null);
}
