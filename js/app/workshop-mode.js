// Modo Taller: pantalla completa, alto contraste, un paso de sierra por pantalla

import { state, currentGroup, currentSheet } from './state.js';
import { cutKindLabel, loadCutProgress, markCurrentCutDone, onWizardUpdate, stepNext, stepPrev, updateCutWizardUI } from './sequence.js';
import { goToSheet } from './results.js';
import { toast } from './ui-feedback.js';

let overlay = null;
let els = null;
let wakeLock = null;
let canvasHome = null; // { parent, next } para devolver el mapa a su lugar

function buildOverlay() {
    overlay = document.createElement('div');
    overlay.className = 'workshop-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Modo Taller');
    overlay.hidden = true;
    overlay.innerHTML = `
        <header class="workshop-top">
            <div class="workshop-where">
                <span class="workshop-material"></span>
                <span class="workshop-sheet"></span>
            </div>
            <div class="workshop-sheet-nav">
                <button type="button" class="workshop-btn-small" data-act="prev-sheet" aria-label="Plancha anterior">◀ Plancha</button>
                <button type="button" class="workshop-btn-small" data-act="next-sheet" aria-label="Plancha siguiente">Plancha ▶</button>
            </div>
            <button type="button" class="workshop-close" data-act="close" aria-label="Salir del Modo Taller">Salir ✕</button>
        </header>
        <div class="workshop-progress" aria-hidden="true"><div class="workshop-progress-bar"></div></div>
        <div class="workshop-stage"></div>
        <footer class="workshop-bottom">
            <div class="workshop-step-label" aria-live="polite"></div>
            <p class="workshop-instruction" aria-live="polite"></p>
            <div class="workshop-actions">
                <button type="button" class="workshop-btn" data-act="prev">◀ Anterior</button>
                <button type="button" class="workshop-btn workshop-btn-done" data-act="done">✓ Hecho</button>
                <button type="button" class="workshop-btn" data-act="next">Siguiente ▶</button>
            </div>
            <p class="workshop-hint">Teclado: Espacio / Enter = Hecho · ← → = pasos · Esc = salir</p>
        </footer>
    `;
    document.body.appendChild(overlay);
    els = {
        material: overlay.querySelector('.workshop-material'),
        sheet: overlay.querySelector('.workshop-sheet'),
        bar: overlay.querySelector('.workshop-progress-bar'),
        stage: overlay.querySelector('.workshop-stage'),
        stepLabel: overlay.querySelector('.workshop-step-label'),
        instruction: overlay.querySelector('.workshop-instruction'),
        prev: overlay.querySelector('[data-act="prev"]'),
        next: overlay.querySelector('[data-act="next"]'),
        done: overlay.querySelector('[data-act="done"]'),
        prevSheet: overlay.querySelector('[data-act="prev-sheet"]'),
        nextSheet: overlay.querySelector('[data-act="next-sheet"]')
    };

    overlay.addEventListener('click', (e) => {
        const act = e.target.closest('[data-act]')?.dataset.act;
        if (act === 'close') closeWorkshop();
        else if (act === 'prev') stepPrev();
        else if (act === 'next') stepNext();
        else if (act === 'done') markCurrentCutDone();
        else if (act === 'prev-sheet') changeSheet(-1);
        else if (act === 'next-sheet') changeSheet(1);
    });
}

function changeSheet(delta) {
    goToSheet(delta);
    if (state.activeCutStepIndex < 0) state.activeCutStepIndex = 0;
    updateCutWizardUI();
    requestAnimationFrame(() => state.canvas.fitToScreen());
}

function onKey(e) {
    if (!overlay || overlay.hidden) return;
    if (e.key === 'Escape') {
        e.preventDefault();
        closeWorkshop();
    } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        stepNext();
    } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        stepPrev();
    } else if ((e.key === ' ' || e.key === 'Enter') &&
        !(e.target instanceof Element && e.target.closest('button'))) {
        e.preventDefault();
        markCurrentCutDone();
    }
}

function render() {
    if (!overlay || overlay.hidden) return;
    const group = currentGroup();
    const sheet = currentSheet();
    const total = group ? group.sheets.length : 0;
    els.material.textContent = state.activeMaterialGroup || '';
    els.sheet.textContent = total ? `Plancha ${state.activeSheetIndex + 1} de ${total}` : 'Sin planchas';
    els.prevSheet.disabled = state.activeSheetIndex <= 0;
    els.nextSheet.disabled = state.activeSheetIndex >= total - 1;

    const cuts = (sheet && sheet.cuts) || [];
    if (!sheet || sheet.sequenceStale || cuts.length === 0) {
        els.stepLabel.textContent = sheet && sheet.sequenceStale ? 'Secuencia desactualizada' : 'Sin cortes';
        els.instruction.textContent = sheet && sheet.sequenceStale
            ? 'Reoptimice antes de cortar esta plancha.'
            : 'Esta plancha no necesita cortes.';
        els.bar.style.width = '0%';
        els.prev.disabled = els.next.disabled = els.done.disabled = true;
        return;
    }

    const idx = Math.max(0, state.activeCutStepIndex);
    const cut = cuts[idx];
    const doneIdx = loadCutProgress(state.activeMaterialGroup, sheet);
    const finished = doneIdx >= cuts.length - 1;

    els.stepLabel.textContent = `Paso ${idx + 1} de ${cuts.length} · ${cutKindLabel(cut)}${idx <= doneIdx ? ' · hecho ✓' : ''}`;
    els.instruction.textContent = finished && idx === cuts.length - 1
        ? `${cut.desc}  —  ¡Plancha terminada!`
        : cut.desc;
    els.bar.style.width = `${Math.round(((doneIdx + 1) / cuts.length) * 100)}%`;
    els.prev.disabled = idx <= 0;
    els.next.disabled = idx >= cuts.length - 1;
    els.done.disabled = false;
    els.done.textContent = idx <= doneIdx ? '✓ Hecho (repetir)' : '✓ Hecho';
}

async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
        }
    } catch (e) {
        wakeLock = null; // el navegador lo rechazó (batería baja, etc.)
    }
}

function onVisibility() {
    if (overlay && !overlay.hidden && document.visibilityState === 'visible') requestWakeLock();
}

export function openWorkshop() {
    if (!state.results || !currentSheet()) {
        toast('Optimice primero para usar el Modo Taller.', { type: 'warn' });
        return;
    }
    if (!overlay) buildOverlay();

    // Llevar el mapa al escenario del Modo Taller
    const container = document.querySelector('.canvas-container');
    canvasHome = { parent: container.parentElement, next: container.nextSibling };
    els.stage.appendChild(container);

    overlay.hidden = false;
    document.body.classList.add('workshop-active');
    if (state.activeCutStepIndex < 0) state.activeCutStepIndex = 0;
    updateCutWizardUI();
    requestAnimationFrame(() => state.canvas.fitToScreen());

    if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => { /* permitido fallar */ });
    }
    requestWakeLock();
    els.done.focus();
}

export function closeWorkshop() {
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
    document.body.classList.remove('workshop-active');
    const container = els.stage.querySelector('.canvas-container');
    if (container && canvasHome) canvasHome.parent.insertBefore(container, canvasHome.next);
    requestAnimationFrame(() => state.canvas.fitToScreen());
    if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
    }
    if (wakeLock) {
        wakeLock.release().catch(() => {});
        wakeLock = null;
    }
}

export function initWorkshopMode() {
    const btn = document.getElementById('btn-workshop-mode');
    if (btn) btn.addEventListener('click', openWorkshop);
    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVisibility);
    onWizardUpdate(render);
}
