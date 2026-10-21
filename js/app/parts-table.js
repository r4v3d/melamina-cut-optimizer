// Tabla de piezas: filas, lectura de datos, avisos y presets de muebles

import { dom } from './dom.js';
import { state } from './state.js';
import { escapeHtml, num, cantosText, groovesText } from '../utils.js';
import { DEFAULTS, updateWorkshopChecklist } from './settings.js';
import { MUEBLE_PRESETS } from '../presets.js';
import { saveStateToLocalStorage } from './persistence.js';
import { markResultsStale, runOptimization } from './optimize.js';
import { toast } from './ui-feedback.js';
import { materialsStore } from './store.js';

const COLOR_PALETTE = ['#06b6d4', '#3b82f6', '#f97316', '#8b5cf6', '#10b981', '#ec4899', '#f59e0b'];
const EDGE_TITLES = ['Largo Superior (L1)', 'Largo Inferior (L2)', 'Ancho Izquierdo (A1)', 'Ancho Derecho (A2)'];

let rowIdSeq = 0; // id estable por fila (no cambia al borrar/duplicar)

export function defaultMaterial() {
    return (dom.inputMaterial.value || '').trim() || 'Estándar 18mm';
}

// Material de la plancha del sidebar + catálogo + los que ya usan las filas
function getMaterialOptions(selected) {
    const options = new Set();
    const sheetMat = (dom.inputMaterial.value || '').trim();
    if (sheetMat) options.add(sheetMat);
    materialsStore.list().forEach(m => options.add(m.name));
    if (selected) options.add(selected);
    dom.partsTbody.querySelectorAll('.part-material').forEach(sel => {
        if (sel.value) options.add(sel.value);
    });
    return Array.from(options);
}

function applyCantoState(button, cantoState) {
    button.setAttribute('data-state', cantoState);
    button.classList.remove('delgado', 'grueso');
    let title = EDGE_TITLES[button.getAttribute('data-edge')] || button.textContent;
    if (cantoState === 1) {
        button.classList.add('delgado');
        title += ' [Delgado]';
    } else if (cantoState === 2) {
        button.classList.add('grueso');
        title += ' [Grueso]';
    }
    button.title = title;
}

function updatePrintLabels(rowEl) {
    const data = getRowData(rowEl);
    const cantoLabelEl = rowEl.querySelector('.canto-print-label');
    if (cantoLabelEl) cantoLabelEl.textContent = cantosText(data.cantos);
    const grooveLabelEl = rowEl.querySelector('.groove-print-label');
    if (grooveLabelEl) grooveLabelEl.textContent = groovesText(data.grooves);
}

// Aplica un color a todas las piezas colocadas/sin colocar que vienen de la fila
function recolorResultParts(rowId, color) {
    if (!state.results) return;
    for (const matName in state.results.groups) {
        const group = state.results.groups[matName];
        for (const sheet of group.sheets) {
            for (const p of sheet.placedParts) {
                if (p.rowId === rowId) p.color = color;
            }
        }
        for (const p of group.unplacedParts) {
            if (p.rowId === rowId) p.color = color;
        }
    }
    if (state.canvas) state.canvas.render();
}

function createRowDOM(partData = {}) {
    const tr = document.createElement('tr');
    tr.className = 'part-row';
    tr.dataset.rowId = String(++rowIdSeq);

    const name = partData.name || '';
    const numRows = dom.partsTbody.querySelectorAll('.part-row').length;
    const color = partData.color || COLOR_PALETTE[numRows % COLOR_PALETTE.length];
    const material = partData.material || defaultMaterial();
    const largo = partData.largo || '';
    const ancho = partData.ancho || '';
    const cant = partData.cant || 1;
    const veta = partData.veta !== undefined ? partData.veta : false;
    // cantos: [L1, L2, A1, A2] -> 0: Ninguno, 1: Delgado, 2: Grueso
    const cantos = partData.cantos ? [...partData.cantos] : [0, 0, 0, 0];
    // grooves: [L1, L2, A1, A2] -> 0: No, 1: Sí
    const grooves = partData.grooves ? [...partData.grooves] : [0, 0, 0, 0];

    const materialOptionsHtml = getMaterialOptions(material).map(mat =>
        `<option value="${escapeHtml(mat)}" ${mat === material ? 'selected' : ''}>${escapeHtml(mat)}</option>`
    ).join('');

    tr.innerHTML = `
        <td class="row-num" data-label="#"></td>
        <td data-label="Nombre">
            <input type="text" class="table-input part-name" placeholder="Ej. Lateral" value="${escapeHtml(name)}" aria-label="Nombre de la pieza">
            <input type="text" class="table-input part-note" placeholder="Nota: lijar, refilar…" value="${escapeHtml(partData.nota || '')}" aria-label="Nota de proceso">
        </td>
        <td data-label="Color"><input type="color" class="table-input part-color" value="${escapeHtml(color)}" title="Elegir Color de la pieza" aria-label="Color de la pieza"></td>
        <td data-label="Material">
            <select class="table-input part-material" style="font-weight: 500;" aria-label="Material">
                ${materialOptionsHtml}
            </select>
        </td>
        <td data-label="Largo"><input type="number" class="table-input part-largo" placeholder="0" value="${escapeHtml(largo)}" min="10" aria-label="Largo en mm"></td>
        <td data-label="Ancho"><input type="number" class="table-input part-ancho" placeholder="0" value="${escapeHtml(ancho)}" min="10" aria-label="Ancho en mm"></td>
        <td data-label="Cant."><input type="number" class="table-input part-cant" placeholder="1" value="${escapeHtml(cant)}" min="1" aria-label="Cantidad"></td>
        <td data-label="Veta"><input type="checkbox" class="part-veta" ${veta ? 'checked' : ''} aria-label="Respetar veta"></td>
        <td data-label="Tapacantos">
            <div class="canto-config-grid">
                <button class="canto-btn" data-edge="0" title="Largo Superior (L1)">L1</button>
                <button class="canto-btn" data-edge="1" title="Largo Inferior (L2)">L2</button>
                <button class="canto-btn" data-edge="2" title="Ancho Izquierdo (A1)">A1</button>
                <button class="canto-btn" data-edge="3" title="Ancho Derecho (A2)">A2</button>
            </div>
            <div class="canto-print-label print-only"></div>
        </td>
        <td data-label="Surcos">
            <div class="canto-config-grid">
                <button class="groove-btn" data-edge="0" title="Surco Superior (L1)">L1</button>
                <button class="groove-btn" data-edge="1" title="Surco Inferior (L2)">L2</button>
                <button class="groove-btn" data-edge="2" title="Surco Izquierdo (A1)">A1</button>
                <button class="groove-btn" data-edge="3" title="Surco Derecho (A2)">A2</button>
            </div>
            <div class="groove-print-label print-only"></div>
        </td>
        <td class="row-actions-cell">
            <div class="row-actions">
                <button class="btn-icon duplicate" title="Duplicar pieza" aria-label="Duplicar pieza">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                </button>
                <button class="btn-icon delete" title="Eliminar fila" aria-label="Eliminar fila">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
            </div>
        </td>
    `;

    // Navegación por teclado entre filas (flechas / Enter)
    tr.querySelectorAll('.table-input').forEach(input => {
        input.addEventListener('keydown', (e) => {
            const fieldClass = Array.from(input.classList).find(c => c.startsWith('part-'));
            const focusIn = row => {
                const target = row && row.querySelector('.' + fieldClass);
                if (target) target.focus();
            };
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                focusIn(tr.nextElementSibling);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                focusIn(tr.previousElementSibling);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (tr.nextElementSibling) {
                    focusIn(tr.nextElementSibling);
                } else {
                    addNewRow();
                    focusIn(dom.partsTbody.lastElementChild);
                }
            }
        });
    });

    // Tapacantos: ciclo 0 -> 1 -> 2 -> 0
    tr.querySelectorAll('.canto-btn').forEach((btn, idx) => {
        applyCantoState(btn, cantos[idx]);
        btn.addEventListener('click', () => {
            const current = parseInt(btn.getAttribute('data-state'), 10) || 0;
            applyCantoState(btn, (current + 1) % 3);
            updatePrintLabels(tr);
            saveStateToLocalStorage();
            markResultsStale();
        });
    });

    // Surcos: activado / desactivado
    tr.querySelectorAll('.groove-btn').forEach((btn, idx) => {
        if (grooves[idx] === 1) btn.classList.add('active');
        btn.addEventListener('click', () => {
            btn.classList.toggle('active');
            updatePrintLabels(tr);
            saveStateToLocalStorage();
            markResultsStale();
        });
    });

    tr.querySelector('.btn-icon.duplicate').addEventListener('click', () => {
        tr.after(createRowDOM(getRowData(tr)));
        updateRowNumbers();
        saveStateToLocalStorage();
        markResultsStale();
    });

    tr.querySelector('.btn-icon.delete').addEventListener('click', () => {
        const nextRow = tr.nextElementSibling;
        const data = getRowData(tr);
        tr.remove();
        updateRowNumbers();
        const placeholder = dom.partsTbody.children.length === 0 ? addNewRow() : null;
        saveStateToLocalStorage();
        markResultsStale();

        toast(`Se eliminó "${data.name || 'pieza sin nombre'}".`, {
            action: {
                label: 'Deshacer',
                onClick: () => {
                    if (placeholder && placeholder.isConnected && isTableEmpty()) placeholder.remove();
                    const restored = createRowDOM(data);
                    if (nextRow && nextRow.isConnected) {
                        nextRow.before(restored);
                    } else {
                        dom.partsTbody.appendChild(restored);
                    }
                    updateRowNumbers();
                    saveStateToLocalStorage();
                }
            }
        });
    });

    // Cambiar color en tiempo real sin re-optimizar
    const colorInput = tr.querySelector('.part-color');
    colorInput.addEventListener('input', () => {
        recolorResultParts(tr.dataset.rowId, colorInput.value);
        saveStateToLocalStorage();
    });

    // Guardado automático ante cualquier cambio de valor
    tr.querySelectorAll('.table-input, input[type="checkbox"]').forEach(el => {
        el.addEventListener('change', () => {
            saveStateToLocalStorage();
            applyRowWarnings();
            if (!el.classList.contains('part-color')) markResultsStale();
        });
    });

    // Resaltar en el mapa las piezas de esta fila
    tr.addEventListener('mouseenter', () => setMapHighlight(tr.dataset.rowId));
    tr.addEventListener('mouseleave', () => setMapHighlight(null));

    updatePrintLabels(tr);
    return tr;
}

function setMapHighlight(rowId) {
    if (!state.canvas || state.canvas.highlightRowId === rowId) return;
    state.canvas.highlightRowId = rowId;
    state.canvas.render();
}

// Marca la fila de la pieza sobre la que está el mouse en el mapa
export function highlightRow(rowId) {
    dom.partsTbody.querySelectorAll('.part-row.row-highlight').forEach(r => r.classList.remove('row-highlight'));
    if (!rowId) return;
    const row = dom.partsTbody.querySelector(`.part-row[data-row-id="${CSS.escape(rowId)}"]`);
    if (row) row.classList.add('row-highlight');
}

// Fila de totales: piezas, área y metros de tapacanto nominales
export function updateTotals() {
    const totalsCant = document.getElementById('parts-totals-cant');
    const totalsDetail = document.getElementById('parts-totals-detail');
    if (!totalsCant || !totalsDetail) return;
    let piezas = 0;
    let areaMm2 = 0;
    let cantoD = 0;
    let cantoG = 0;
    dom.partsTbody.querySelectorAll('.part-row').forEach(row => {
        const d = getRowData(row);
        if (!(d.largo > 0 && d.ancho > 0)) return;
        piezas += d.cant;
        areaMm2 += d.largo * d.ancho * d.cant;
        d.cantos.forEach((c, i) => {
            const len = (i < 2 ? d.largo : d.ancho) * d.cant / 1000;
            if (c === 1) cantoD += len;
            if (c === 2) cantoG += len;
        });
    });
    totalsCant.textContent = piezas;
    totalsDetail.textContent = `${(areaMm2 / 1e6).toFixed(2)} m² de piezas · canto D ${cantoD.toFixed(1)} m · canto G ${cantoG.toFixed(1)} m`;
}

// Rehace las opciones de material de todas las filas (tras editar el catálogo) conservando la selección
export function refreshMaterialOptions() {
    dom.partsTbody.querySelectorAll('.part-material').forEach(sel => {
        const current = sel.value;
        sel.innerHTML = getMaterialOptions(current).map(mat =>
            `<option value="${escapeHtml(mat)}" ${mat === current ? 'selected' : ''}>${escapeHtml(mat)}</option>`
        ).join('');
    });
}

export function getRowData(rowEl) {
    const cantos = [];
    rowEl.querySelectorAll('.canto-btn').forEach(btn => {
        cantos.push(parseInt(btn.getAttribute('data-state'), 10) || 0);
    });
    const grooves = [];
    rowEl.querySelectorAll('.groove-btn').forEach(btn => {
        grooves.push(btn.classList.contains('active') ? 1 : 0);
    });
    return {
        name: rowEl.querySelector('.part-name').value.trim(),
        nota: (rowEl.querySelector('.part-note')?.value || '').trim(),
        color: rowEl.querySelector('.part-color').value,
        material: rowEl.querySelector('.part-material').value,
        largo: parseFloat(rowEl.querySelector('.part-largo').value) || 0,
        ancho: parseFloat(rowEl.querySelector('.part-ancho').value) || 0,
        cant: parseInt(rowEl.querySelector('.part-cant').value, 10) || 1,
        veta: rowEl.querySelector('.part-veta').checked,
        cantos,
        grooves
    };
}

// Piezas válidas para el optimizador (índice = número de fila, rowId = id estable)
export function readRawParts() {
    const rawParts = [];
    dom.partsTbody.querySelectorAll('.part-row').forEach((row, rowIdx) => {
        const data = getRowData(row);
        if (data.largo > 0 && data.ancho > 0 && data.cant > 0) {
            rawParts.push({ ...data, id: `p${rowIdx}`, index: rowIdx, rowId: row.dataset.rowId });
        }
    });
    return rawParts;
}

function physicalCutSize(data) {
    let { largo, ancho } = data;
    if (dom.checkDescontarCanto.checked) {
        const d = num(dom.inputCantoDelgadoVal.value, DEFAULTS.parametros.cantoDelgadoEspesor);
        const g = num(dom.inputCantoGruesoVal.value, DEFAULTS.parametros.cantoGruesoEspesor);
        const esp = [0, d, g];
        largo -= (esp[data.cantos[2] || 0] + esp[data.cantos[3] || 0]);
        ancho -= (esp[data.cantos[0] || 0] + esp[data.cantos[1] || 0]);
    }
    return { largo, ancho };
}

export function applyRowWarnings() {
    const refilado = num(dom.inputRefilado.value, 0);
    const usableW = num(dom.inputLargo.value, 0) - 2 * refilado;
    const usableH = num(dom.inputAncho.value, 0) - 2 * refilado;
    const vetaOn = dom.checkTieneVeta.checked;

    dom.partsTbody.querySelectorAll('.part-row').forEach((row) => {
        row.classList.remove('row-warn', 'row-error');
        const existing = row.querySelector('.row-warning');
        if (existing) existing.remove();
        const data = getRowData(row);
        if (!(data.largo > 0 && data.ancho > 0 && data.cant > 0)) return;

        const phys = physicalCutSize(data);
        const msgs = [];
        let error = false;
        if (phys.largo <= 0 || phys.ancho <= 0) {
            msgs.push('Corte ≤ 0 mm tras tapacanto');
            error = true;
        }
        const fitsAsIs = phys.largo <= usableW + 0.2 && phys.ancho <= usableH + 0.2;
        const fitsRot = phys.ancho <= usableW + 0.2 && phys.largo <= usableH + 0.2;
        if (!error && !fitsAsIs && !fitsRot) {
            msgs.push('Mayor que el útil de plancha');
            error = true;
        } else if (!error && !fitsAsIs && fitsRot) {
            msgs.push(vetaOn && data.veta
                ? 'No cabe con veta: desactive veta o rote la pieza'
                : 'Cabe si se rota');
        }
        if (data.cant > 200) msgs.push('Cantidad alta (>200)');

        if (msgs.length) {
            row.classList.add(error ? 'row-error' : 'row-warn');
            const nameCell = row.querySelector('.part-name')?.closest('td') || row.cells[1];
            const warn = document.createElement('span');
            warn.className = 'row-warning';
            warn.textContent = msgs.join(' · ');
            nameCell.appendChild(warn);
        }
    });
}

export function addNewRow(partData = {}) {
    const row = createRowDOM(partData);
    dom.partsTbody.appendChild(row);
    updateRowNumbers();
    return row;
}

function updateRowNumbers() {
    dom.partsTbody.querySelectorAll('.part-row').forEach((row, idx) => {
        row.querySelector('.row-num').textContent = idx + 1;
    });
    updateTotals();
}

// Tabla con una sola fila vacía (para decidir si el importador reemplaza o agrega)
export function isTableEmpty() {
    const rows = dom.partsTbody.querySelectorAll('.part-row');
    if (rows.length !== 1) return rows.length === 0;
    const data = getRowData(rows[0]);
    return !data.name && !data.largo && !data.ancho;
}

export function loadFurniturePreset(preset) {
    dom.partsTbody.innerHTML = '';
    dom.inputMaterial.value = preset.material;
    if (preset.plancha) {
        dom.inputLargo.value = preset.plancha.largo || DEFAULTS.plancha.largo;
        dom.inputAncho.value = preset.plancha.ancho || DEFAULTS.plancha.ancho;
        dom.checkTieneVeta.checked = preset.plancha.veta || false;
    }
    preset.parts.forEach(p => addNewRow(p));
    updateWorkshopChecklist();
    saveStateToLocalStorage();
    runOptimization();
}

export function initPartsTable() {
    MUEBLE_PRESETS.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.name;
        dom.selectMueblePreset.appendChild(opt);
    });

    dom.selectMueblePreset.addEventListener('change', (e) => {
        const selected = MUEBLE_PRESETS.find(m => m.id === e.target.value);
        if (selected) loadFurniturePreset(selected);
    });

    dom.btnLoadPresetMueble.addEventListener('click', () => {
        const defaultPreset = MUEBLE_PRESETS.find(m => m.id === 'velador') || MUEBLE_PRESETS[0];
        loadFurniturePreset(defaultPreset);
        dom.selectMueblePreset.value = defaultPreset.id;
    });

    // Totales al día con cualquier edición de la tabla
    dom.partsTbody.addEventListener('input', updateTotals);
    dom.partsTbody.addEventListener('click', (e) => {
        if (e.target.closest('.canto-btn')) updateTotals();
    });

    dom.btnAddRow.addEventListener('click', () => {
        addNewRow();
        saveStateToLocalStorage();
    });
}
