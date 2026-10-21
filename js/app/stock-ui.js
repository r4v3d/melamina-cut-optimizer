// Planchas del proyecto (pestaña Planchas): medidas y retazos disponibles, con cantidad

import { dom } from './dom.js';
import { escapeHtml, num } from '../utils.js';
import { materialsStore, newId } from './store.js';

const ALL = '*';
let rows = [];

const tbody = () => document.getElementById('stock-tbody');
const allowNewInput = () => document.getElementById('check-stock-allow-new');

let onChange = () => {};

// Materiales para elegir: los de la plancha, el catálogo y los que usan las piezas
function materialNames() {
    const names = new Set();
    const sheetMat = (dom.inputMaterial.value || '').trim();
    if (sheetMat) names.add(sheetMat);
    materialsStore.list().forEach(m => names.add(m.name));
    dom.partsTbody.querySelectorAll('.part-material').forEach(sel => { if (sel.value) names.add(sel.value); });
    rows.forEach(r => { if (r.material && r.material !== ALL) names.add(r.material); });
    return [...names];
}

function render() {
    const body = tbody();
    if (!body) return;
    if (!rows.length) {
        body.innerHTML = '<tr><td colspan="6" class="muted center">Sin planchas propias: se usa la plancha de arriba sin límite.</td></tr>';
        return;
    }
    const mats = materialNames();
    body.innerHTML = rows.map((r, i) => `
        <tr data-i="${i}">
            <td><select class="form-input" data-field="material" aria-label="Material">
                <option value="${ALL}" ${r.material === ALL ? 'selected' : ''}>Todos</option>
                ${mats.map(m => `<option value="${escapeHtml(m)}" ${m === r.material ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('')}
            </select></td>
            <td><select class="form-input" data-field="tipo" aria-label="Tipo">
                <option value="plancha" ${r.tipo === 'plancha' ? 'selected' : ''}>Plancha</option>
                <option value="retazo" ${r.tipo === 'retazo' ? 'selected' : ''}>Retazo</option>
            </select></td>
            <td><input class="form-input" type="number" min="50" data-field="largo" value="${escapeHtml(r.largo)}" aria-label="Largo (mm)"></td>
            <td><input class="form-input" type="number" min="50" data-field="ancho" value="${escapeHtml(r.ancho)}" aria-label="Ancho (mm)"></td>
            <td><input class="form-input" type="number" min="1" data-field="cant" value="${escapeHtml(r.cant)}" placeholder="∞" aria-label="Cantidad (vacío = ilimitada)"></td>
            <td><button type="button" class="btn-icon delete" data-act="delete" aria-label="Quitar plancha" title="Quitar">×</button></td>
        </tr>`).join('');
}

function addRow(tipo) {
    const retazo = tipo === 'retazo';
    rows.push({
        id: newId('st'),
        material: ALL,
        tipo,
        largo: retazo ? '' : num(dom.inputLargo.value, 2440),
        ancho: retazo ? '' : num(dom.inputAncho.value, 1830),
        cant: retazo ? 1 : ''
    });
    render();
    tbody().querySelector('tr:last-child input[data-field="largo"]')?.focus();
    onChange();
}

export function getStockState() {
    return { rows: rows.map(r => ({ ...r })), allowNew: allowNewInput() ? allowNewInput().checked : true };
}

export function applyStockState(saved) {
    rows = Array.isArray(saved && saved.rows) ? saved.rows.map(r => ({ ...r })) : [];
    if (allowNewInput()) allowNewInput().checked = !saved || saved.allowNew !== false;
    render();
}

/**
 * Planes de planchas por material para el optimizador (solo materiales con filas aplicables):
 * { [material]: { finite: [{ largo, ancho, isRemnant }], unlimited: { largo, ancho } | null, allowNew } }
 */
export function buildSheetPlans(materials) {
    const valid = rows.filter(r => num(r.largo, 0) >= 50 && num(r.ancho, 0) >= 50);
    if (!valid.length) return {};
    const allowNew = allowNewInput() ? allowNewInput().checked : true;
    const plans = {};
    for (const mat of materials) {
        const mine = valid.filter(r => r.material === ALL || r.material === mat);
        if (!mine.length) continue;
        const finite = [];
        let unlimited = null;
        for (const r of mine) {
            const largo = num(r.largo, 0);
            const ancho = num(r.ancho, 0);
            const cant = Math.round(num(r.cant, 0));
            if (cant > 0) {
                for (let k = 0; k < Math.min(cant, 200); k++) finite.push({ largo, ancho, isRemnant: r.tipo === 'retazo' });
            } else if (r.tipo !== 'retazo' && !unlimited) {
                unlimited = { largo, ancho };
            }
        }
        plans[mat] = { finite, unlimited, allowNew };
    }
    return plans;
}

export function refreshStockMaterials() {
    render();
}

export function initStockUi(changeHandler) {
    onChange = changeHandler || onChange;
    document.getElementById('btn-stock-add')?.addEventListener('click', () => addRow('plancha'));
    document.getElementById('btn-stock-add-remnant')?.addEventListener('click', () => addRow('retazo'));
    allowNewInput()?.addEventListener('change', () => onChange());

    const body = tbody();
    if (!body) return;
    body.addEventListener('change', (e) => {
        const field = e.target.dataset.field;
        const i = Number(e.target.closest('tr')?.dataset.i);
        if (!field || !rows[i]) return;
        rows[i][field] = e.target.value;
        onChange();
    });
    body.addEventListener('click', (e) => {
        if (e.target.dataset.act !== 'delete') return;
        rows.splice(Number(e.target.closest('tr').dataset.i), 1);
        render();
        onChange();
    });
    render();
}
