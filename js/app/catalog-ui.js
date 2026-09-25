// Catálogo de materiales: plancha, espesor, precio y veta propios por material

import { dom } from './dom.js';
import { escapeHtml, num } from '../utils.js';
import { openModal } from './modal.js';
import { materialsStore, newId } from './store.js';
import { getCurrencySymbol } from './currency.js';
import { refreshMaterialOptions } from './parts-table.js';
import { markResultsStale } from './optimize.js';
import { renderQuote } from './results.js';
import { saveStateToLocalStorage } from './persistence.js';
import { toast } from './ui-feedback.js';

function rowHtml(m, i) {
    return `
        <tr data-i="${i}">
            <td><input class="form-input" data-field="name" value="${escapeHtml(m.name)}" aria-label="Nombre del material" placeholder="Ej. Blanco 18mm"></td>
            <td><input class="form-input" type="number" min="100" data-field="largo" value="${escapeHtml(m.largo)}" aria-label="Largo de plancha (mm)"></td>
            <td><input class="form-input" type="number" min="100" data-field="ancho" value="${escapeHtml(m.ancho)}" aria-label="Ancho de plancha (mm)"></td>
            <td><input class="form-input" type="number" min="1" step="0.5" data-field="espesor" value="${escapeHtml(m.espesor)}" aria-label="Espesor (mm)"></td>
            <td><input class="form-input" type="number" min="0" step="0.1" data-field="precio" value="${escapeHtml(m.precio)}" aria-label="Precio por plancha"></td>
            <td class="center"><input type="checkbox" data-field="veta" ${m.veta ? 'checked' : ''} aria-label="La plancha tiene veta"></td>
            <td><button type="button" class="btn-icon delete" data-act="delete" aria-label="Eliminar material" title="Eliminar">×</button></td>
        </tr>`;
}

export function openCatalog() {
    const original = new Map(materialsStore.list().map(m => [m.id, m.name]));
    const list = materialsStore.list().map(m => ({ ...m }));
    const symbol = getCurrencySymbol(dom.selectMoneda.value);

    const body = document.createElement('div');
    body.innerHTML = `
        <p class="modal-help">Cada material usa su propio tamaño de plancha, precio y veta al optimizar y cotizar.
        Las piezas con un material que no está en el catálogo usan la plancha y el "Costo Plancha" del panel lateral.</p>
        <div class="table-responsive">
            <table class="modal-table">
                <thead><tr><th>Nombre</th><th>Largo (mm)</th><th>Ancho (mm)</th><th>Espesor</th><th>Precio (${escapeHtml(symbol)})</th><th>Veta</th><th></th></tr></thead>
                <tbody></tbody>
            </table>
        </div>
        <div class="modal-inline-actions">
            <button type="button" class="btn btn-secondary btn-sm" data-act="add">+ Agregar material</button>
            <button type="button" class="btn btn-secondary btn-sm" data-act="add-current">+ Agregar el material de la plancha actual</button>
        </div>
    `;
    const tbody = body.querySelector('tbody');
    const render = () => {
        tbody.innerHTML = list.map(rowHtml).join('') ||
            '<tr><td colspan="7" class="center muted">Sin materiales. Agregue uno.</td></tr>';
    };
    render();

    tbody.addEventListener('input', (e) => {
        const field = e.target.dataset.field;
        const i = Number(e.target.closest('tr')?.dataset.i);
        if (!field || !list[i]) return;
        list[i][field] = field === 'veta' ? e.target.checked : (field === 'name' ? e.target.value : e.target.value);
    });
    tbody.addEventListener('change', (e) => {
        if (e.target.dataset.field === 'veta') {
            const i = Number(e.target.closest('tr').dataset.i);
            list[i].veta = e.target.checked;
        }
    });
    body.addEventListener('click', (e) => {
        const act = e.target.dataset.act;
        if (act === 'delete') {
            list.splice(Number(e.target.closest('tr').dataset.i), 1);
            render();
        } else if (act === 'add' || act === 'add-current') {
            const current = act === 'add-current';
            list.push({
                id: newId('mat'),
                name: current ? (dom.inputMaterial.value || '').trim() : '',
                largo: current ? num(dom.inputLargo.value, 2440) : 2440,
                ancho: current ? num(dom.inputAncho.value, 1830) : 1830,
                espesor: current ? num(dom.selectEspesor.value, 18) : 18,
                precio: current ? num(dom.inputCostoPlancha.value, 0) : 0,
                veta: current ? dom.checkTieneVeta.checked : false
            });
            render();
            tbody.querySelector('tr:last-child input')?.focus();
        }
    });

    openModal({
        title: 'Catálogo de materiales',
        body,
        wide: true,
        actions: [
            { label: 'Cancelar' },
            {
                label: 'Guardar catálogo',
                variant: 'primary',
                onClick: () => {
                    const clean = [];
                    const names = new Set();
                    for (const m of list) {
                        const name = String(m.name || '').trim();
                        const largo = num(m.largo, NaN);
                        const ancho = num(m.ancho, NaN);
                        if (!name) { toast('Hay un material sin nombre.', { type: 'error' }); return false; }
                        if (names.has(name.toLowerCase())) { toast(`El material "${name}" está repetido.`, { type: 'error' }); return false; }
                        if (!(largo >= 100 && ancho >= 100)) { toast(`Revise el tamaño de plancha de "${name}".`, { type: 'error' }); return false; }
                        names.add(name.toLowerCase());
                        clean.push({
                            id: m.id || newId('mat'),
                            name,
                            largo,
                            ancho,
                            espesor: num(m.espesor, 18),
                            precio: Math.max(0, num(m.precio, 0)),
                            veta: !!m.veta
                        });
                    }
                    if (!materialsStore.save(clean)) {
                        toast('No se pudo guardar el catálogo (almacenamiento lleno).', { type: 'error' });
                        return false;
                    }
                    // Si se renombró un material, las filas que lo usaban siguen apuntando a él
                    for (const m of clean) {
                        const oldName = original.get(m.id);
                        if (oldName && oldName !== m.name) {
                            dom.partsTbody.querySelectorAll('.part-material').forEach(sel => {
                                if (sel.value === oldName) {
                                    sel.add(new Option(m.name, m.name));
                                    sel.value = m.name;
                                }
                            });
                        }
                    }
                    refreshMaterialOptions();
                    saveStateToLocalStorage();
                    renderQuote();
                    markResultsStale();
                    toast('Catálogo guardado. Reoptimice para aplicar los tamaños de plancha.', { type: 'success' });
                    return true;
                }
            }
        ]
    });
}

export function initCatalogUi() {
    dom.btnCatalog.addEventListener('click', openCatalog);
}
