// Guardado y carga del proyecto en localStorage.
// La "copia de trabajo" (STATE_KEY) se sincroniza con el proyecto actual de la lista de proyectos.

import { dom } from './dom.js';
import { MUEBLE_PRESETS } from '../presets.js';
import { applySettings, readSettings } from './settings.js';
import { addNewRow, getRowData, loadFurniturePreset, readRawParts } from './parts-table.js';
import { runOptimization } from './optimize.js';
import { projectsStore, newId } from './store.js';
import { applyStockState, getStockState } from './stock-ui.js';

const STATE_KEY = 'melaminacut_project_state_pro';
const LEGACY_STATE_KEY = 'melaminacut_project_state';
const SCHEMA_VERSION = 3;

// Estado completo del proyecto que está en pantalla
export function collectProjectState() {
    const parts = [];
    dom.partsTbody.querySelectorAll('.part-row').forEach(row => {
        const data = getRowData(row);
        if (data.name || data.largo > 0 || data.ancho > 0) parts.push(data);
    });
    return {
        schemaVersion: SCHEMA_VERSION,
        ...readSettings(),
        project: {
            name: dom.inputProjectName.value.trim(),
            client: { nombre: dom.inputClientName.value.trim(), telefono: dom.inputClientPhone.value.trim() },
            fechaPedido: dom.inputOrderDate ? dom.inputOrderDate.value : '',
            fechaEntrega: dom.inputDeliveryDate ? dom.inputDeliveryDate.value : ''
        },
        stock: getStockState(),
        parts
    };
}

// Migra formatos anteriores al esquema actual
function migrate(saved) {
    if (!saved.schemaVersion) saved.schemaVersion = 1; // v1: mismo formato sin versión
    if (saved.schemaVersion < 3) {
        saved.project = saved.project || { name: '', client: { nombre: '', telefono: '' } };
        saved.schemaVersion = 3;
    }
    return saved;
}

// Vuelca un estado guardado en la pantalla (no optimiza)
export function applyProjectState(saved) {
    const s = migrate(saved || {});
    applySettings(s);
    dom.inputProjectName.value = (s.project && s.project.name) || '';
    dom.inputClientName.value = (s.project && s.project.client && s.project.client.nombre) || '';
    dom.inputClientPhone.value = (s.project && s.project.client && s.project.client.telefono) || '';
    if (dom.inputOrderDate) dom.inputOrderDate.value = (s.project && s.project.fechaPedido) || '';
    if (dom.inputDeliveryDate) dom.inputDeliveryDate.value = (s.project && s.project.fechaEntrega) || '';
    applyStockState(s.stock);
    dom.partsTbody.innerHTML = '';
    if (s.parts && s.parts.length) s.parts.forEach(p => addNewRow(p));
    else addNewRow();
}

function syncCurrentProject(stateObj) {
    let id = projectsStore.currentId();
    if (!id) {
        id = newId('prj');
        projectsStore.setCurrent(id);
    }
    const existing = projectsStore.get(id) || { id, createdAt: new Date().toISOString() };
    projectsStore.put({
        ...existing,
        id,
        name: stateObj.project.name,
        client: stateObj.project.client,
        pieces: stateObj.parts.reduce((s, p) => s + (p.cant || 0), 0),
        updatedAt: new Date().toISOString(),
        state: stateObj
    });
}

export function saveStateToLocalStorage() {
    const stateObj = collectProjectState();
    try {
        localStorage.setItem(STATE_KEY, JSON.stringify(stateObj));
    } catch (e) { /* cuota llena o almacenamiento bloqueado */ }
    syncCurrentProject(stateObj);
}

// Optimiza solo si hay piezas con medidas (evita el aviso en proyectos vacíos)
export function optimizeIfParts() {
    if (readRawParts().length) runOptimization();
}

function loadDefaultProject() {
    const defaultPreset = MUEBLE_PRESETS.find(m => m.id === 'velador') || MUEBLE_PRESETS[0];
    applySettings({});
    loadFurniturePreset(defaultPreset);
}

export function loadStateFromLocalStorage() {
    const serialized = localStorage.getItem(STATE_KEY);
    if (!serialized) {
        const classic = localStorage.getItem(LEGACY_STATE_KEY);
        if (classic) {
            try {
                const parsed = JSON.parse(classic);
                applyProjectState({ plancha: parsed.plancha, parts: parsed.parts });
                saveStateToLocalStorage();
                optimizeIfParts();
                return;
            } catch (e) { /* formato antiguo ilegible: cargar ejemplo */ }
        }
        loadDefaultProject();
        return;
    }

    try {
        applyProjectState(JSON.parse(serialized));
        saveStateToLocalStorage(); // asegura que exista el proyecto actual en la lista
        optimizeIfParts();
    } catch (e) {
        console.error('Error al cargar estado de localStorage:', e);
        loadDefaultProject();
    }
}
