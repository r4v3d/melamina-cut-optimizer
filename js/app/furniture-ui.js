// Mueble por medidas: elige una plantilla, ingresa ancho/alto/profundidad y agrega el despiece

import { dom } from './dom.js';
import { escapeHtml, num, cantosText } from '../utils.js';
import { FURNITURE_TEMPLATES, buildFurniture } from '../furniture-templates.js';
import { openModal } from './modal.js';
import { materialsStore } from './store.js';
import { addNewRow, defaultMaterial, isTableEmpty } from './parts-table.js';
import { saveStateToLocalStorage } from './persistence.js';
import { runOptimization } from './optimize.js';
import { toast } from './ui-feedback.js';

function materialOptions(selected) {
    const names = new Set([defaultMaterial(), ...materialsStore.list().map(m => m.name)]);
    if (selected) names.add(selected);
    return [...names].map(n => `<option value="${escapeHtml(n)}" ${n === selected ? 'selected' : ''}>${escapeHtml(n)}</option>`).join('');
}

export function openFurnitureBuilder() {
    const fondoDefault = materialsStore.list().find(m => /fondo|3 ?mm/i.test(m.name))?.name || 'MDF Fondo 3mm';
    const body = document.createElement('div');
    body.innerHTML = `
        <div class="furniture-form">
            <div class="form-group">
                <label for="fb-template">Tipo de mueble</label>
                <select id="fb-template" class="form-select">
                    ${FURNITURE_TEMPLATES.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label for="fb-prefix">Nombre (se agrega a cada pieza)</label>
                <input id="fb-prefix" class="form-input" placeholder="Ej. Módulo lavadero">
            </div>
            <div class="furniture-params"></div>
            <div class="form-row">
                <div class="form-group col-4">
                    <label for="fb-espesor">Espesor (mm)</label>
                    <input id="fb-espesor" class="form-input" type="number" min="3" value="${escapeHtml(num(dom.selectEspesor.value, 18))}">
                </div>
                <div class="form-group col-4">
                    <label for="fb-material">Material del cuerpo</label>
                    <select id="fb-material" class="form-select">${materialOptions(defaultMaterial())}</select>
                </div>
                <div class="form-group col-4">
                    <label for="fb-fondo">Material del fondo</label>
                    <select id="fb-fondo" class="form-select">${materialOptions(fondoDefault)}</select>
                </div>
            </div>
        </div>
        <div class="furniture-errors" role="alert"></div>
        <div class="table-responsive">
            <table class="modal-table">
                <thead><tr><th>Pieza</th><th>Largo × Ancho</th><th>Cant.</th><th>Material</th><th>Cantos</th></tr></thead>
                <tbody class="furniture-preview"></tbody>
            </table>
        </div>
        <p class="furniture-herrajes muted"></p>
    `;
    const $ = sel => body.querySelector(sel);
    let lastBuild = null;

    const renderParams = () => {
        const tpl = FURNITURE_TEMPLATES.find(t => t.id === $('#fb-template').value);
        $('.furniture-params').innerHTML = `<div class="form-row">${tpl.params.map(p => `
            <div class="form-group col-4">
                <label for="fb-p-${p.key}">${escapeHtml(p.label)}</label>
                <input id="fb-p-${p.key}" data-key="${p.key}" class="form-input" type="number" min="${p.min}" ${p.max !== undefined ? `max="${p.max}"` : ''} value="${p.value}">
            </div>`).join('')}</div>`;
        $('#fb-prefix').placeholder = tpl.name;
    };

    const preview = () => {
        const tplId = $('#fb-template').value;
        const tpl = FURNITURE_TEMPLATES.find(t => t.id === tplId);
        const values = {};
        body.querySelectorAll('.furniture-params [data-key]').forEach(inp => { values[inp.dataset.key] = inp.value; });
        lastBuild = buildFurniture(tplId, values, {
            espesor: num($('#fb-espesor').value, 18),
            material: $('#fb-material').value,
            materialFondo: $('#fb-fondo').value,
            prefix: $('#fb-prefix').value.trim() || tpl.name
        });
        $('.furniture-errors').textContent = lastBuild.errors.join(' · ');
        $('.furniture-preview').innerHTML = lastBuild.parts.map(p => `
            <tr><td>${escapeHtml(p.name)}</td><td>${p.largo} × ${p.ancho}</td><td>${p.cant}</td>
            <td>${escapeHtml(p.material)}</td><td>${escapeHtml(cantosText(p.cantos, false))}</td></tr>`).join('');
        $('.furniture-herrajes').textContent = lastBuild.herrajes.length
            ? 'Herrajes sugeridos: ' + lastBuild.herrajes.map(h => `${h.cant} ${h.name}`).join(', ')
            : '';
    };

    renderParams();
    preview();
    $('#fb-template').addEventListener('change', () => { renderParams(); preview(); });
    body.addEventListener('input', preview);

    const addParts = (replace) => {
        if (!lastBuild || lastBuild.errors.length || !lastBuild.parts.length) {
            toast('Revise las medidas del mueble.', { type: 'error' });
            return false;
        }
        if (replace || isTableEmpty()) dom.partsTbody.innerHTML = '';
        lastBuild.parts.forEach(p => addNewRow(p));
        saveStateToLocalStorage();
        runOptimization();
        const herrajes = lastBuild.herrajes.map(h => `${h.cant} ${h.name}`).join(', ');
        toast(`Se agregaron ${lastBuild.parts.length} tipos de pieza.${herrajes ? ' Herrajes: ' + herrajes + '.' : ''}`, { type: 'success', duration: 9000 });
        return true;
    };

    openModal({
        title: 'Mueble por medidas',
        body,
        wide: true,
        actions: [
            { label: 'Cancelar' },
            { label: 'Reemplazar lista', onClick: () => addParts(true) },
            { label: 'Agregar a la lista', variant: 'primary', onClick: () => addParts(false) }
        ]
    });
}

export function initFurnitureUi() {
    dom.btnFurnitureBuilder.addEventListener('click', openFurnitureBuilder);
}
