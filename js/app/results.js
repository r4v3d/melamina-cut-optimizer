// Panel de resultados: métricas, cotización, piezas sin colocar y navegación de planchas

import { dom, costInputs, grooveInputs } from './dom.js';
import { state, currentGroup, currentSheet, optimizerForResults, optimizerForGroup, sheetTitle } from './state.js';
import { escapeHtml } from '../utils.js';
import { formatPrice, updateCurrencyLabels } from './currency.js';
import { readCosts, readGrooveSpec } from './settings.js';
import { saveStateToLocalStorage } from './persistence.js';
import { loadCutProgress, renderCutSequence, updateCutWizardUI } from './sequence.js';
import { toast, confirmDialog } from './ui-feedback.js';
import { computeQuote } from '../quote-calc.js';
import { materialsStore } from './store.js';
import { isPro } from './plan.js';
import { updateResultBadge } from './tabs.js';
import { CutOptimizer } from '../optimizer.js';

const UNPLACED_REASONS = {
    too_large: 'No cabe en la plancha (ni rotada)',
    invalid_size: 'Medida de corte inválida (revise tapacantos)',
    no_space: 'Sin espacio residual suficiente (kerf)',
    removed: 'Quitada manualmente del mapa',
    no_stock: 'No alcanzan las planchas disponibles (pestaña Planchas)'
};
const PLACEABLE_REASONS = new Set(['no_space', 'removed', 'no_stock']);

// Llamado por optimize.js cuando llega un resultado nuevo
export function onNewResults(results) {
    state.results = results;
    if (dom.resultsStaleBanner) dom.resultsStaleBanner.hidden = true;

    dom.selectMaterialGroup.innerHTML = '';
    const materialKeys = Object.keys(results.groups);
    materialKeys.forEach(key => {
        const optEl = document.createElement('option');
        optEl.value = key;
        optEl.textContent = key;
        dom.selectMaterialGroup.appendChild(optEl);
    });
    state.activeMaterialGroup = materialKeys[0] || 'Estándar 18mm';
    displayResults(false);
    updateResultBadge(results);
}

export function clearResults() {
    state.results = null;
    state.lastQuote = null;
    dom.selectMaterialGroup.innerHTML = '';
    if (dom.resultsStaleBanner) dom.resultsStaleBanner.hidden = true;
    dom.resultsSection.style.display = 'none';
    dom.unplacedContainer.style.display = 'none';
    updateResultBadge(null);
}

// Resumen en una sola tabla (como SketchCut): planchas, piezas, sobrantes, desperdicio, cortes, cantos, ranuras
function renderSummary() {
    const body = document.getElementById('summary-tbody');
    if (!body || !state.results) return;
    const m2 = mm2 => `${(mm2 / 1e6).toFixed(2)} m²`;
    let sheetsN = 0, sheetsArea = 0, remN = 0, remArea = 0, partsN = 0, partsArea = 0, leftN = 0, leftArea = 0;
    let dN = 0, gN = 0, grooveN = 0;
    for (const g of Object.values(state.results.groups)) {
        for (const s of g.sheets) {
            if (s.isRemnant) { remN++; remArea += s.w * s.h; } else { sheetsN++; sheetsArea += s.w * s.h; }
            for (const p of s.placedParts) {
                partsN++;
                partsArea += p.w * p.h;
                (p.cantos || []).forEach(c => { if (c === 1) dN++; if (c === 2) gN++; });
                (p.grooves || []).forEach(gr => { if (gr === 1) grooveN++; });
            }
            for (const r of s.freeRects) {
                if (CutOptimizer.isUsefulLeftover(r)) { leftN++; leftArea += r.w * r.h; }
            }
        }
    }
    const total = sheetsArea + remArea;
    const waste = Math.max(0, total - partsArea - leftArea);
    const m = state.results.metrics;
    const rowsHtml = [
        ['Planchas nuevas', sheetsN, m2(sheetsArea)],
        ...(remN ? [['Retazos usados', remN, m2(remArea)]] : []),
        ['Piezas', partsN, m2(partsArea)],
        ['Sobrantes útiles', leftN, m2(leftArea)],
        ['Desperdicio (aserrín, refilado, tiras)', '—', `${m2(waste)} · ${total ? Math.round(waste / total * 1000) / 10 : 0}%`],
        ['Cortes de sierra', m.totalCutsCount, `${m.totalCutsLength} m`],
        ['Tapacanto delgado (bordes)', dN, `${m.cantoDelgado} m`],
        ['Tapacanto grueso (bordes)', gN, `${m.cantoGrueso} m`],
        ['Ranuras', grooveN, `${m.totalGroovesLength} m`],
        ...(state.results.unplacedParts.length ? [['Piezas sin colocar', state.results.unplacedParts.length, '—']] : [])
    ];
    body.innerHTML = rowsHtml.map(([a, b, c]) =>
        `<tr><td>${escapeHtml(a)}</td><td>${escapeHtml(b)}</td><td>${escapeHtml(c)}</td></tr>`).join('');
}

// Precio de plancha nueva: el del catálogo (Pro) o, si no, el "Costo Plancha" del sidebar
export function priceForMaterial(name, costs = readCosts()) {
    const m = isPro() ? materialsStore.byName(name) : null;
    return m && Number(m.precio) >= 0 ? Number(m.precio) : costs.plancha;
}

export function currentQuote() {
    if (!state.results) return null;
    const costs = readCosts();
    return computeQuote(state.results, costs, name => priceForMaterial(name, costs));
}

export function renderQuote() {
    if (!state.results) return;
    const q = currentQuote();
    state.lastQuote = q;
    dom.valCostoTotal.textContent = formatPrice(q.total, q.moneda);
    dom.valSubPlanchas.textContent = formatPrice(q.planchas, q.moneda);
    dom.valSubServicios.textContent = formatPrice(q.servicios, q.moneda);
    if (dom.valSubExtras) dom.valSubExtras.textContent = formatPrice(q.extras, q.moneda);
    if (dom.valSubMargen) dom.valSubMargen.textContent = formatPrice(q.margenImpuesto, q.moneda);
}

function renderMetrics(metrics) {
    dom.valEficiencia.textContent = `${metrics.globalEfficiency}%`;
    // Planchas que hay que comprar; los retazos del inventario van aparte
    dom.valPlanchas.textContent = metrics.newSheetsCount ?? metrics.sheetsCount;
    dom.valCantoDelgado.textContent = `${metrics.cantoDelgado} m`;
    dom.valCantoGrueso.textContent = `${metrics.cantoGrueso} m`;
    dom.valMetrosCorte.textContent = `${metrics.totalCutsLength} m`;
    dom.valNumCortes.textContent = metrics.totalCutsCount;
    dom.valMetrosRanura.textContent = `${metrics.totalGroovesLength} m`;
    if (dom.valSobrante) dom.valSobrante.textContent = `${metrics.leftoverAreaM2 || 0} m²`;
    if (dom.valMerma) dom.valMerma.textContent = `${metrics.wastePercent || 0}%`;
    if (dom.strategyNote) {
        const tried = metrics.strategiesTried || 0;
        const winner = metrics.winningStrategy;
        const remnants = metrics.remnantsUsed ? ` · +${metrics.remnantsUsed} retazo${metrics.remnantsUsed > 1 ? 's' : ''}` : '';
        dom.strategyNote.textContent = (tried > 1 && winner ? `Mejor de ${tried} layouts` : '') + remnants;
        dom.strategyNote.title = winner || '';
    }

    // Anillo de eficiencia
    const circle = dom.circleEficiencia;
    const circumference = 2 * Math.PI * circle.r.baseVal.value;
    circle.style.strokeDasharray = `${circumference}`;
    circle.style.strokeDashoffset = circumference - (metrics.globalEfficiency / 100) * circumference;
}

function renderUnplaced() {
    dom.unplacedListEl.innerHTML = '';
    const entries = [];
    for (const matName in state.results.groups) {
        for (const p of state.results.groups[matName].unplacedParts) {
            entries.push({ part: p, matName });
        }
    }
    if (entries.length === 0) {
        dom.unplacedContainer.style.display = 'none';
        return;
    }

    dom.unplacedContainer.style.display = 'block';
    dom.unplacedCount.textContent = entries.length;
    entries.forEach(({ part, matName }) => {
        const reason = UNPLACED_REASONS[part.unplacedReason] || 'No se pudo colocar';
        const card = document.createElement('div');
        card.className = 'unplaced-item';
        card.innerHTML = `
            <div class="unplaced-item-info">
                <span class="unplaced-item-name">${escapeHtml(part.name)}</span>
                <span class="unplaced-item-size">${escapeHtml(part.largoNominal)} x ${escapeHtml(part.anchoNominal)} mm (${escapeHtml(part.material)})</span>
                <span class="unplaced-item-size">${escapeHtml(reason)}</span>
            </div>
        `;
        if (PLACEABLE_REASONS.has(part.unplacedReason)) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn btn-secondary btn-sm unplaced-place-btn';
            btn.textContent = 'Colocar';
            btn.title = 'Buscar un hueco para esta pieza en las planchas actuales';
            btn.addEventListener('click', () => placeUnplacedPart(part, matName));
            card.appendChild(btn);
        }
        dom.unplacedListEl.appendChild(card);
    });
}

// Vuelve a colocar una pieza sin ubicar: primero en la plancha visible, luego en las demás, o en una nueva
async function placeUnplacedPart(part, matName) {
    const group = state.results.groups[matName];
    if (!group) return;
    const opt = optimizerForGroup(group);

    const order = group.sheets.map((_, i) => i);
    if (matName === state.activeMaterialGroup && state.activeSheetIndex < order.length) {
        order.splice(state.activeSheetIndex, 1);
        order.unshift(state.activeSheetIndex);
    }

    let sheetIdx = -1;
    for (const idx of order) {
        if (opt.placeOnSheet(part, group.sheets[idx])) {
            sheetIdx = idx;
            break;
        }
    }

    if (sheetIdx < 0) {
        const ok = await confirmDialog(`No hay espacio para "${part.name}" en las planchas actuales. ¿Agregar una plancha nueva?`, { title: 'Sin espacio', okLabel: 'Agregar plancha' });
        if (!ok) return;
        const newSheet = opt.createNewSheet(group.sheets.length + 1);
        if (!opt.placeOnSheet(part, newSheet)) {
            toast('La pieza no cabe ni en una plancha vacía. Revise sus medidas.', { type: 'error' });
            return;
        }
        group.sheets.push(newSheet);
        sheetIdx = group.sheets.length - 1;
    }

    group.unplacedParts = group.unplacedParts.filter(p => p !== part);
    state.activeMaterialGroup = matName;
    dom.selectMaterialGroup.value = matName;
    state.activeSheetIndex = sheetIdx;
    state.activeCutStepIndex = -1;
    recalculateStatsAndDisplay();
}

// Edición manual desde el mapa (girar / quitar pieza)
// Destinos del menú "Mover a…": las otras planchas del material y una nueva
export function moveTargets() {
    const group = currentGroup();
    if (!group) return [];
    const list = group.sheets
        .map((s, i) => ({ index: i, label: `Mover a ${sheetTitle(s, i)}` }))
        .filter(t => t.index !== state.activeSheetIndex);
    list.push({ index: 'new', label: 'Mover a una plancha nueva' });
    return list;
}

function moveToSheet(group, sheet, part, target) {
    const opt = optimizerForGroup(group);
    let targetSheet;
    let targetIndex;
    if (target === 'new') {
        targetSheet = opt.createNewSheet(group.sheets.filter(s => !s.isRemnant).length + 1);
    } else {
        targetSheet = group.sheets[target];
        targetIndex = target;
    }
    if (!targetSheet) return;
    const placed = opt.placeOnSheet({ ...part }, targetSheet);
    if (!placed) {
        toast(`No hay espacio para "${part.name}" en esa plancha.`, { type: 'warn' });
        return;
    }
    if (target === 'new') {
        group.sheets.push(targetSheet);
        targetIndex = group.sheets.length - 1;
    }
    sheet.placedParts = sheet.placedParts.filter(p => p !== part);
    const sourceIndex = group.sheets.indexOf(sheet);
    if (sheet.placedParts.length === 0) {
        group.sheets.splice(sourceIndex, 1);
        if (sourceIndex < targetIndex) targetIndex--;
        group.sheets.forEach((s, i) => { if (!s.isStock) s.id = i + 1; });
    } else {
        opt.rebuildSheet(sheet);
    }
    state.activeSheetIndex = targetIndex;
    state.activeCutStepIndex = -1;
    toast(`"${part.name}" se movió a ${sheetTitle(targetSheet, targetIndex)}.`, { type: 'success' });
    recalculateStatsAndDisplay();
}

export function onCanvasEdit({ type, part, target }) {
    const group = currentGroup();
    const sheet = currentSheet();
    if (!group || !sheet) return;

    if (type === 'remove') {
        sheet.placedParts = sheet.placedParts.filter(p => p !== part);
        group.unplacedParts.push({ ...part, unplacedReason: 'removed' });
    }

    if (type === 'moveTo') {
        moveToSheet(group, sheet, part, target);
        return;
    }

    if (sheet.placedParts.length === 0) {
        // Plancha vacía: se elimina para no cobrarla
        group.sheets.splice(state.activeSheetIndex, 1);
        group.sheets.forEach((s, i) => { s.id = i + 1; });
    } else {
        optimizerForGroup(group).rebuildSheet(sheet);
    }
    state.activeCutStepIndex = -1;
    recalculateStatsAndDisplay();
}

export function recalculateStatsAndDisplay() {
    if (!state.results) return;
    optimizerForResults().recomputeMetrics(state.results);
    displayResults(true);
}

export function displayResults(preserveActiveSheet = false) {
    const results = state.results;
    if (!results) return;
    dom.resultsSection.style.display = ''; // el CSS lo muestra en columna (flex)

    const cfg = results.config || {};
    dom.txtCantoDelLegend.textContent = cfg.cantoDelgadoEspesor ?? dom.inputCantoDelgadoVal.value;
    dom.txtCantoGruLegend.textContent = cfg.cantoGruesoEspesor ?? dom.inputCantoGruesoVal.value;
    if (state.canvas) state.canvas.grooveSpec = readGrooveSpec();

    renderMetrics(results.metrics);
    renderSummary();
    renderQuote();
    renderUnplaced();

    if (!preserveActiveSheet) {
        state.activeSheetIndex = 0;
        state.activeCutStepIndex = -1;
    } else {
        const group = currentGroup();
        const totalSheets = group ? group.sheets.length : 0;
        if (state.activeSheetIndex >= totalSheets) {
            state.activeSheetIndex = Math.max(0, totalSheets - 1);
        }
    }
    renderThumbnails();
    updateSheetNavigation();
    updateCutWizardUI();
    state.printReportDirty = true;
}

// Tira de miniaturas de todas las planchas del material (solo si hay más de una)
function renderThumbnails() {
    const wrap = document.getElementById('sheet-thumbnails');
    if (!wrap) return;
    wrap.innerHTML = '';
    const group = currentGroup();
    if (!group || group.sheets.length < 2) {
        wrap.hidden = true;
        return;
    }
    wrap.hidden = false;
    const pending = [];
    group.sheets.forEach((sheet, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sheet-thumb';
        btn.setAttribute('role', 'listitem');
        btn.dataset.index = String(i);
        const eff = Math.round(sheet.efficiency || 0);
        btn.setAttribute('aria-label', `Plancha ${i + 1}: ${sheet.placedParts.length} piezas, ${eff}% de aprovechamiento`);
        // Lienzo liviano dibujado en diferido: no traba la pantalla tras cada recálculo
        const img = document.createElement('canvas');
        img.className = 'sheet-thumb-canvas';
        img.setAttribute('aria-hidden', 'true');
        pending.push(() => state.canvas.drawThumbnail(img, sheet, 110));
        const cap = document.createElement('span');
        cap.className = 'sheet-thumb-caption';
        cap.textContent = `${sheet.isRemnant ? 'Retazo' : i + 1} · ${eff}%${sheet.sequenceStale ? ' · ⚠' : ''}`;
        btn.append(img, cap);
        btn.addEventListener('click', () => {
            state.activeSheetIndex = i;
            state.activeCutStepIndex = -1;
            updateSheetNavigation();
            updateCutWizardUI();
        });
        wrap.appendChild(btn);
    });
    const idle = window.requestIdleCallback || (cb => setTimeout(cb, 16));
    const drawNext = () => {
        const job = pending.shift();
        if (!job) return;
        job();
        idle(drawNext);
    };
    idle(drawNext);
}

function markActiveThumb() {
    document.querySelectorAll('#sheet-thumbnails .sheet-thumb').forEach(btn => {
        const active = Number(btn.dataset.index) === state.activeSheetIndex;
        btn.classList.toggle('active', active);
        if (active) btn.setAttribute('aria-current', 'true');
        else btn.removeAttribute('aria-current');
    });
}

export function updateSheetNavigation() {
    if (!state.results || !state.activeMaterialGroup) return;
    const group = currentGroup();
    if (!group || !group.sheets || group.sheets.length === 0) {
        dom.sheetNavLabel.textContent = 'Plancha 0 de 0';
        dom.btnPrevSheet.disabled = true;
        dom.btnNextSheet.disabled = true;
        state.canvas.setSheet(null);
        renderCutSequence(null);
        return;
    }

    const totalSheets = group.sheets.length;
    const current = group.sheets[state.activeSheetIndex];
    dom.sheetNavLabel.textContent = current.isRemnant
        ? `${sheetTitle(current, state.activeSheetIndex)} (${state.activeSheetIndex + 1} de ${totalSheets})`
        : `Plancha ${state.activeSheetIndex + 1} de ${totalSheets}`;
    dom.btnPrevSheet.disabled = state.activeSheetIndex === 0;
    dom.btnNextSheet.disabled = state.activeSheetIndex === totalSheets - 1;

    const sheet = group.sheets[state.activeSheetIndex];
    state.canvas.setSheet(sheet);
    markActiveThumb();
    state.canvas.canvas.setAttribute('aria-label',
        `Plancha ${state.activeSheetIndex + 1} de ${totalSheets}, ${state.activeMaterialGroup}: ` +
        `${sheet.placedParts.length} piezas, ${Math.round(sheet.efficiency || 0)}% de aprovechamiento, ${(sheet.cuts || []).length} pasos de sierra`);
    if (sheet && !sheet.sequenceStale) {
        const cutsLen = (sheet.cuts || []).length;
        const done = loadCutProgress(state.activeMaterialGroup, sheet);
        state.canvas.completedCutIndex = done;
        if (state.activeCutStepIndex < 0 && done >= 0 && done < cutsLen - 1) {
            state.activeCutStepIndex = done + 1;
        } else if (state.activeCutStepIndex < 0 && done >= cutsLen - 1 && cutsLen) {
            state.activeCutStepIndex = cutsLen - 1;
        }
    }
    renderCutSequence(sheet);
}

export function goToSheet(delta) {
    const group = currentGroup();
    if (!group) return;
    const next = state.activeSheetIndex + delta;
    if (next < 0 || next >= group.sheets.length) return;
    state.activeSheetIndex = next;
    state.activeCutStepIndex = -1;
    updateSheetNavigation();
    updateCutWizardUI();
}

export function initResults() {
    dom.btnPrevSheet.addEventListener('click', () => goToSheet(-1));
    dom.btnNextSheet.addEventListener('click', () => goToSheet(1));

    dom.selectMaterialGroup.addEventListener('change', (e) => {
        state.activeMaterialGroup = e.target.value;
        state.activeSheetIndex = 0;
        state.activeCutStepIndex = -1;
        renderThumbnails();
        updateSheetNavigation();
        updateCutWizardUI();
    });

    // Recalcular presupuesto al instante al cambiar costos o moneda
    costInputs.forEach(input => {
        const handler = () => {
            if (input === dom.selectMoneda) updateCurrencyLabels();
            renderQuote();
            saveStateToLocalStorage();
        };
        input.addEventListener('input', handler);
        input.addEventListener('change', handler);
    });

    // Los surcos solo cambian el dibujo
    grooveInputs.forEach(input => {
        input.addEventListener('input', () => {
            if (!state.canvas) return;
            state.canvas.grooveSpec = readGrooveSpec();
            state.canvas.render();
            state.printReportDirty = true;
        });
    });

    dom.btnDownloadImg.addEventListener('click', () => state.canvas.downloadImage());
    dom.btnZoomIn.addEventListener('click', () => state.canvas.zoom('in'));
    dom.btnZoomOut.addEventListener('click', () => state.canvas.zoom('out'));
    dom.btnZoomReset.addEventListener('click', () => state.canvas.zoom('reset'));

    if (dom.btnFullscreenToggle) {
        dom.btnFullscreenToggle.addEventListener('click', () => {
            const container = document.querySelector('.canvas-container');
            if (!container) return;
            const isFullscreen = container.classList.toggle('fullscreen-map');
            if (isFullscreen) {
                // Guardar la posición original para restaurarla al salir
                container._originalParent = container.parentElement;
                container._originalNextSibling = container.nextSibling;
                document.body.appendChild(container);
            } else if (container._originalParent) {
                container._originalParent.insertBefore(container, container._originalNextSibling);
            }
            setTimeout(() => state.canvas.fitToScreen(), 80);
        });
    }
}
