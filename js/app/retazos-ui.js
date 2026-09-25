// Inventario de retazos: ver, agregar a mano, y registrar lo que deja cada corte

import { dom } from './dom.js';
import { state } from './state.js';
import { escapeHtml, num } from '../utils.js';
import { CutOptimizer } from '../optimizer.js';
import { openModal } from './modal.js';
import { materialsStore, retazosStore } from './store.js';
import { toast, confirmDialog } from './ui-feedback.js';

function knownMaterials() {
    const names = new Set(materialsStore.list().map(m => m.name));
    const sheetMat = (dom.inputMaterial.value || '').trim();
    if (sheetMat) names.add(sheetMat);
    retazosStore.list().forEach(r => names.add(r.material));
    return [...names];
}

function fmtDate(iso) {
    try {
        return new Date(iso).toLocaleDateString();
    } catch (e) {
        return '';
    }
}

export function openRetazos() {
    const body = document.createElement('div');
    body.innerHTML = `
        <p class="modal-help">Los retazos se usan antes que las planchas nuevas si activas
        <strong>"Usar retazos del inventario primero"</strong> en Parámetros de Taller. No se cobran en la cotización.</p>
        <form class="retazo-add-form">
            <div class="form-group"><label>Material</label>
                <input class="form-input" name="material" list="retazo-materiales" required></div>
            <div class="form-group"><label>Largo (mm)</label><input class="form-input" type="number" name="largo" min="50" required></div>
            <div class="form-group"><label>Ancho (mm)</label><input class="form-input" type="number" name="ancho" min="50" required></div>
            <div class="form-group"><label>Cant.</label><input class="form-input" type="number" name="cant" min="1" value="1"></div>
            <button type="submit" class="btn btn-primary btn-sm">Agregar</button>
            <datalist id="retazo-materiales"></datalist>
        </form>
        <div class="retazo-summary muted"></div>
        <div class="table-responsive">
            <table class="modal-table">
                <thead><tr><th>Material</th><th>Largo × Ancho</th><th>Área</th><th>Origen</th><th>Fecha</th><th></th></tr></thead>
                <tbody></tbody>
            </table>
        </div>
    `;
    const form = body.querySelector('form');
    const tbody = body.querySelector('tbody');
    const summary = body.querySelector('.retazo-summary');
    body.querySelector('datalist').innerHTML = knownMaterials().map(m => `<option value="${escapeHtml(m)}">`).join('');
    form.elements.material.value = (dom.inputMaterial.value || '').trim();

    const render = () => {
        const list = retazosStore.list().sort((a, b) => a.material.localeCompare(b.material) || (b.largo * b.ancho - a.largo * a.ancho));
        const area = list.reduce((s, r) => s + r.largo * r.ancho, 0) / 1e6;
        summary.textContent = list.length ? `${list.length} retazos · ${area.toFixed(2)} m² en total` : 'El inventario está vacío.';
        tbody.innerHTML = list.map(r => `
            <tr>
                <td>${escapeHtml(r.material)}</td>
                <td>${escapeHtml(r.largo)} × ${escapeHtml(r.ancho)} mm</td>
                <td>${(r.largo * r.ancho / 1e6).toFixed(3)} m²</td>
                <td>${escapeHtml(r.origen || '-')}</td>
                <td>${escapeHtml(fmtDate(r.fecha))}</td>
                <td><button type="button" class="btn-icon delete" data-id="${escapeHtml(r.id)}" aria-label="Quitar retazo" title="Quitar">×</button></td>
            </tr>`).join('');
    };
    render();

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const material = form.elements.material.value.trim();
        const largo = num(form.elements.largo.value, 0);
        const ancho = num(form.elements.ancho.value, 0);
        const cant = Math.max(1, Math.round(num(form.elements.cant.value, 1)));
        if (!material || largo < 50 || ancho < 50) {
            toast('Complete material y medidas (mínimo 50 mm).', { type: 'warn' });
            return;
        }
        retazosStore.add(Array.from({ length: cant }, () => ({ material, largo, ancho, origen: 'Agregado a mano' })));
        form.elements.largo.value = '';
        form.elements.ancho.value = '';
        form.elements.largo.focus();
        render();
    });

    tbody.addEventListener('click', (e) => {
        const id = e.target.dataset.id;
        if (!id) return;
        retazosStore.remove([id]);
        render();
    });

    openModal({
        title: 'Inventario de retazos',
        body,
        wide: true,
        actions: [
            {
                label: 'Vaciar inventario',
                variant: 'danger',
                onClick: async () => {
                    if (!retazosStore.list().length) return false;
                    const ok = await confirmDialog('Se eliminarán todos los retazos guardados.', { title: 'Vaciar inventario', okLabel: 'Vaciar', danger: true });
                    if (ok) {
                        retazosStore.save([]);
                        render();
                    }
                    return false;
                }
            },
            { label: 'Cerrar', variant: 'primary' }
        ]
    });
}

// Descuenta los retazos usados en el resultado y guarda los sobrantes útiles que deja el corte
export async function registerInventory() {
    const results = state.results;
    if (!results) {
        toast('Optimice primero.', { type: 'warn' });
        return;
    }
    if (dom.resultsStaleBanner && !dom.resultsStaleBanner.hidden) {
        toast('Los resultados están desactualizados. Reoptimice antes de registrar.', { type: 'warn' });
        return;
    }

    const origen = (dom.inputProjectName.value || '').trim() || 'Proyecto sin nombre';
    const consumed = [];
    const leftovers = [];
    for (const mat in results.groups) {
        for (const sheet of results.groups[mat].sheets) {
            if (sheet.isRemnant && sheet.remnantId) consumed.push(sheet.remnantId);
            for (const r of sheet.freeRects) {
                if (CutOptimizer.isUsefulLeftover(r)) {
                    leftovers.push({ material: mat, largo: Math.floor(r.w), ancho: Math.floor(r.h), origen });
                }
            }
        }
    }
    const area = leftovers.reduce((s, r) => s + r.largo * r.ancho, 0) / 1e6;
    const already = results.inventoryRegistered ? '\n\nOjo: este resultado ya fue registrado antes.' : '';
    const ok = await confirmDialog(
        `Se descontarán ${consumed.length} retazo(s) usados y se guardarán ${leftovers.length} sobrante(s) útiles (${area.toFixed(2)} m²).${already}`,
        { title: 'Registrar corte en el inventario', okLabel: 'Registrar' }
    );
    if (!ok) return;

    const before = retazosStore.list();
    retazosStore.remove(consumed);
    retazosStore.add(leftovers);
    results.inventoryRegistered = true;
    toast(`Inventario actualizado: −${consumed.length} usados, +${leftovers.length} sobrantes.`, {
        type: 'success',
        action: {
            label: 'Deshacer',
            onClick: () => {
                retazosStore.save(before);
                results.inventoryRegistered = false;
            }
        }
    });
}

export function initRetazosUi() {
    dom.btnRetazos.addEventListener('click', openRetazos);
    dom.btnRegisterInventory.addEventListener('click', registerInventory);
}
