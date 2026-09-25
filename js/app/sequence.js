// Secuencia de cortes: lista de pasos, asistente paso a paso y progreso guardado

import { dom } from './dom.js';
import { state, currentSheet } from './state.js';
import { escapeHtml } from '../utils.js';

const CUT_PROGRESS_KEY = 'melaminacut_cut_progress';
const CUT_PROGRESS_MAX_ENTRIES = 100;

const wizardListeners = [];

// Se llama tras cada cambio del paso activo (lo usa el Modo Taller)
export function onWizardUpdate(fn) {
    wizardListeners.push(fn);
}

export function cutKindLabel(cut) {
    if (cut.kind === 'refilado') return 'Refilado';
    if (cut.kind === 'raja') return 'Raja';
    if (cut.kind === 'traza') return 'Traza';
    return cut.level === 1 ? 'Raja' : 'Traza';
}

function sheetProgressKey(mat, sheet) {
    const fences = (sheet.cuts || []).map(c => Math.round(c.fenceMm || 0)).join('-');
    return `${mat}|${sheet.id}|${(sheet.cuts || []).length}|${fences}`;
}

export function loadCutProgress(mat, sheet) {
    try {
        const all = JSON.parse(localStorage.getItem(CUT_PROGRESS_KEY) || '{}');
        const v = all[sheetProgressKey(mat, sheet)];
        return typeof v === 'number' ? v : -1;
    } catch (e) {
        return -1;
    }
}

function saveCutProgress(mat, sheet, doneIdx) {
    try {
        const all = JSON.parse(localStorage.getItem(CUT_PROGRESS_KEY) || '{}');
        const key = sheetProgressKey(mat, sheet);
        delete all[key]; // reinsertar al final: las claves quedan de más antigua a más reciente
        all[key] = doneIdx;
        const keys = Object.keys(all);
        for (let i = 0; i < keys.length - CUT_PROGRESS_MAX_ENTRIES; i++) {
            delete all[keys[i]];
        }
        localStorage.setItem(CUT_PROGRESS_KEY, JSON.stringify(all));
    } catch (e) { /* cuota llena */ }
}

export function anySequenceStale() {
    if (!state.results) return false;
    for (const mat of Object.keys(state.results.groups || {})) {
        for (const sheet of state.results.groups[mat].sheets || []) {
            if (sheet.sequenceStale) return true;
        }
    }
    return false;
}

export function renderCutSequence(sheet) {
    const seqList = dom.sequenceList;
    seqList.innerHTML = '';
    const stale = !!(sheet && sheet.sequenceStale);
    if (dom.sequenceStaleBanner) dom.sequenceStaleBanner.hidden = !stale;

    if (!sheet || !sheet.cuts || sheet.cuts.length === 0) {
        seqList.innerHTML = stale
            ? '<li>Secuencia invalidada. Reoptimice para regenerar los cortes de sierra.</li>'
            : '<li>No se requieren cortes para esta plancha.</li>';
        return;
    }

    sheet.cuts.forEach((cut, idx) => {
        const li = document.createElement('li');
        li.style.cursor = 'pointer';
        li.style.transition = 'all 0.15s';
        if (cut.kind === 'refilado') li.classList.add('seq-refilado');
        li.innerHTML = `<strong>Paso ${cut.seq || idx + 1} (${cutKindLabel(cut)}):</strong> ${escapeHtml(cut.desc)}`;
        li.addEventListener('click', () => {
            state.activeCutStepIndex = idx;
            updateCutWizardUI();
        });
        seqList.appendChild(li);
    });
}

export function updateCutWizardUI() {
    if (!state.results || !state.activeMaterialGroup) return;
    const sheet = currentSheet();

    if (!sheet || !sheet.cuts || sheet.cuts.length === 0 || sheet.sequenceStale) {
        dom.btnSeqPrev.disabled = true;
        dom.btnSeqNext.disabled = true;
        if (dom.btnSeqDone) dom.btnSeqDone.disabled = true;
        dom.lblSeqStep.textContent = sheet && sheet.sequenceStale ? 'Reoptimizar' : 'Sin cortes';
        state.canvas.activeCutIndex = -1;
        state.canvas.render();
        if (dom.wizardOverlay) dom.wizardOverlay.hidden = true;
        wizardListeners.forEach(fn => fn());
        return;
    }

    const idx = state.activeCutStepIndex;
    dom.btnSeqPrev.disabled = idx <= -1;
    dom.btnSeqNext.disabled = idx >= sheet.cuts.length - 1;
    if (dom.btnSeqDone) dom.btnSeqDone.disabled = idx < 0;

    if (idx === -1) {
        dom.lblSeqStep.textContent = 'Apagado';
        if (dom.wizardOverlay) dom.wizardOverlay.hidden = true;
    } else {
        const cut = sheet.cuts[idx];
        dom.lblSeqStep.textContent = `Corte ${idx + 1} de ${sheet.cuts.length}`;
        if (dom.wizardOverlay) {
            dom.wizardOverlay.hidden = false;
            dom.wizardOverlayText.textContent = cut.desc || `Tope a ${cut.fenceMm} mm`;
        }
    }

    state.canvas.activeCutIndex = idx;
    state.canvas.render();

    dom.sequenceList.querySelectorAll('li').forEach((li, i) => {
        const active = i === idx;
        li.style.backgroundColor = active ? 'rgba(234, 179, 8, 0.15)' : '';
        li.style.borderLeft = active ? '3px solid #eab308' : '';
        li.style.paddingLeft = active ? '6px' : '';
    });
    wizardListeners.forEach(fn => fn());
}

export function markCurrentCutDone() {
    const sheet = currentSheet();
    if (!sheet || !sheet.cuts || sheet.sequenceStale) return;
    if (state.activeCutStepIndex < 0) state.activeCutStepIndex = 0;
    // Repetir un paso anterior no hace retroceder el progreso guardado
    const doneIdx = Math.max(loadCutProgress(state.activeMaterialGroup, sheet), state.activeCutStepIndex);
    saveCutProgress(state.activeMaterialGroup, sheet, doneIdx);
    state.canvas.completedCutIndex = doneIdx;
    if (state.activeCutStepIndex < sheet.cuts.length - 1) {
        state.activeCutStepIndex++;
    }
    updateCutWizardUI();
}

export function stepPrev() {
    if (state.activeCutStepIndex > -1) {
        state.activeCutStepIndex--;
        updateCutWizardUI();
    }
}

export function stepNext() {
    const sheet = currentSheet();
    if (sheet && state.activeCutStepIndex < sheet.cuts.length - 1) {
        state.activeCutStepIndex++;
        updateCutWizardUI();
    }
}

export function initSequence() {
    dom.btnSeqPrev.addEventListener('click', stepPrev);
    dom.btnSeqNext.addEventListener('click', stepNext);
    dom.btnSeqReset.addEventListener('click', () => {
        state.activeCutStepIndex = -1;
        updateCutWizardUI();
    });
    if (dom.btnSeqDone) dom.btnSeqDone.addEventListener('click', markCurrentCutDone);
    if (dom.btnOverlayPrev) dom.btnOverlayPrev.addEventListener('click', stepPrev);
    if (dom.btnOverlayNext) dom.btnOverlayNext.addEventListener('click', stepNext);
    if (dom.btnOverlayDone) dom.btnOverlayDone.addEventListener('click', markCurrentCutDone);
}
