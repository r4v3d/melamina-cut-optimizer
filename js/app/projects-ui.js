// Proyectos: varios trabajos guardados, duplicar, exportar/importar como archivo .json

import { dom } from './dom.js';
import { escapeHtml } from '../utils.js';
import { openModal, downloadFile, safeFileName } from './modal.js';
import { projectsStore, newId } from './store.js';
import { applyProjectState, collectProjectState, optimizeIfParts, saveStateToLocalStorage } from './persistence.js';
import { addNewRow } from './parts-table.js';
import { clearResults } from './results.js';
import { toast, confirmDialog } from './ui-feedback.js';

const FILE_FORMAT = 'melaminacut-project';

function fmtDateTime(iso) {
    try {
        return new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
    } catch (e) {
        return '';
    }
}

// skipSave: el proyecto en pantalla se acaba de eliminar y no hay que volver a guardarlo
function openProject(id, { skipSave = false } = {}) {
    const project = projectsStore.get(id);
    if (!project) return;
    if (!skipSave) saveStateToLocalStorage(); // guarda el actual antes de cambiar
    projectsStore.setCurrent(id);
    clearResults();
    applyProjectState(project.state || {});
    saveStateToLocalStorage();
    optimizeIfParts();
    toast(`Proyecto abierto: ${project.name || 'Sin nombre'}`, { type: 'success' });
}

// Nuevo proyecto: conserva la configuración del taller (plancha, costos) y empieza sin piezas
function newProject({ skipSave = false } = {}) {
    if (!skipSave) saveStateToLocalStorage();
    const id = newId('prj');
    projectsStore.setCurrent(id);
    clearResults();
    dom.inputProjectName.value = '';
    dom.inputClientName.value = '';
    dom.inputClientPhone.value = '';
    dom.partsTbody.innerHTML = '';
    addNewRow();
    saveStateToLocalStorage();
    dom.inputProjectName.focus();
}

function duplicateProject(id) {
    const project = projectsStore.get(id);
    if (!project) return;
    const copy = JSON.parse(JSON.stringify(project));
    copy.id = newId('prj');
    copy.name = `${project.name || 'Sin nombre'} (copia)`;
    if (copy.state && copy.state.project) copy.state.project.name = copy.name;
    copy.createdAt = copy.updatedAt = new Date().toISOString();
    projectsStore.put(copy);
}

export function exportCurrentProject() {
    saveStateToLocalStorage();
    const id = projectsStore.currentId();
    const project = projectsStore.get(id) || { id, state: collectProjectState() };
    const payload = { format: FILE_FORMAT, version: 1, exportedAt: new Date().toISOString(), project };
    downloadFile(`${safeFileName(project.name, 'proyecto')}.melaminacut.json`, JSON.stringify(payload, null, 2), 'application/json');
}

function importProjectFile(file, onDone) {
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const payload = JSON.parse(reader.result);
            if (!payload || payload.format !== FILE_FORMAT || !payload.project || !payload.project.state) {
                throw new Error('formato');
            }
            const project = payload.project;
            project.id = newId('prj');
            project.updatedAt = new Date().toISOString();
            projectsStore.put(project);
            onDone();
            openProject(project.id);
        } catch (e) {
            toast('El archivo no es un proyecto de MelaminaCut válido.', { type: 'error' });
        }
    };
    reader.onerror = () => toast('No se pudo leer el archivo.', { type: 'error' });
    reader.readAsText(file);
}

export function openProjects() {
    saveStateToLocalStorage();
    const body = document.createElement('div');
    body.innerHTML = `
        <div class="modal-inline-actions">
            <button type="button" class="btn btn-primary btn-sm" data-act="new">+ Nuevo proyecto</button>
            <button type="button" class="btn btn-secondary btn-sm" data-act="export">Exportar actual (.json)</button>
            <label class="btn btn-secondary btn-sm import-file-label">Importar (.json)
                <input type="file" accept=".json,application/json" hidden data-act="import">
            </label>
        </div>
        <div class="table-responsive">
            <table class="modal-table">
                <thead><tr><th>Proyecto</th><th>Cliente</th><th>Piezas</th><th>Modificado</th><th></th></tr></thead>
                <tbody></tbody>
            </table>
        </div>
    `;
    const tbody = body.querySelector('tbody');
    const current = () => projectsStore.currentId();

    const render = () => {
        tbody.innerHTML = projectsStore.list().map(p => `
            <tr data-id="${escapeHtml(p.id)}" class="${p.id === current() ? 'is-current' : ''}">
                <td><strong>${escapeHtml(p.name || 'Sin nombre')}</strong>${p.id === current() ? ' <span class="badge-current">actual</span>' : ''}</td>
                <td>${escapeHtml((p.client && p.client.nombre) || '-')}</td>
                <td>${escapeHtml(p.pieces ?? '-')}</td>
                <td>${escapeHtml(fmtDateTime(p.updatedAt))}</td>
                <td class="nowrap">
                    <button type="button" class="btn btn-secondary btn-sm" data-act="open" ${p.id === current() ? 'disabled' : ''}>Abrir</button>
                    <button type="button" class="btn btn-secondary btn-sm" data-act="dup">Duplicar</button>
                    <button type="button" class="btn-icon delete" data-act="delete" aria-label="Eliminar proyecto" title="Eliminar">×</button>
                </td>
            </tr>`).join('');
    };
    render();

    const modal = openModal({ title: 'Proyectos', body, wide: true, actions: [{ label: 'Cerrar', variant: 'primary' }] });

    body.addEventListener('click', async (e) => {
        const act = e.target.dataset.act;
        const id = e.target.closest('tr')?.dataset.id;
        if (act === 'new') {
            newProject();
            modal.close();
        } else if (act === 'export') {
            exportCurrentProject();
        } else if (act === 'open' && id) {
            openProject(id);
            modal.close();
        } else if (act === 'dup' && id) {
            duplicateProject(id);
            render();
        } else if (act === 'delete' && id) {
            const p = projectsStore.get(id);
            const ok = await confirmDialog(`Se eliminará el proyecto "${p.name || 'Sin nombre'}".`, { title: 'Eliminar proyecto', okLabel: 'Eliminar', danger: true });
            if (!ok) return;
            const wasCurrent = id === current();
            projectsStore.remove(id);
            if (wasCurrent) {
                const next = projectsStore.list()[0];
                if (next) openProject(next.id, { skipSave: true });
                else newProject({ skipSave: true });
            }
            render();
        }
    });
    body.querySelector('input[data-act="import"]').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) importProjectFile(file, () => modal.close());
        e.target.value = '';
    });
}

export function initProjectsUi() {
    dom.btnProjects.addEventListener('click', openProjects);
    [dom.inputProjectName, dom.inputClientName, dom.inputClientPhone].forEach(input => {
        input.addEventListener('change', saveStateToLocalStorage);
    });
}
