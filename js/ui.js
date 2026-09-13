// Controlador de Interfaz de Usuario (UI) - MelaminaCut

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

document.addEventListener('DOMContentLoaded', () => {
    // Referencias DOM - Plancha
    const selectPlanchaPreset = document.getElementById('select-plancha-preset');
    const selectMueblePreset = document.getElementById('select-mueble-preset');
    const inputLargo = document.getElementById('input-plancha-largo');
    const inputAncho = document.getElementById('input-plancha-ancho');
    const selectEspesor = document.getElementById('input-plancha-espesor');
    const inputMaterial = document.getElementById('input-plancha-material');
    
    // Referencias DOM - Taller y Heurísticas
    const inputSierra = document.getElementById('input-sierra-espesor');
    const inputRefilado = document.getElementById('input-refilado');
    const checkDescontarCanto = document.getElementById('check-descontar-canto');
    const checkTieneVeta = document.getElementById('check-tiene-veta');
    const selectMetodoCorte = document.getElementById('select-metodo-corte');
    const checkPreferFence = document.getElementById('check-prefer-fence');
    
    // Referencias DOM - Tapacantos Custom
    const inputCantoDelgadoVal = document.getElementById('input-canto-delgado-val');
    const inputCantoGruesoVal = document.getElementById('input-canto-grueso-val');
    const txtCantoDelLegend = document.getElementById('txt-canto-del-legend');
    const txtCantoGruLegend = document.getElementById('txt-canto-gru-legend');
    
    // Referencias DOM - Ranuras / Surcos
    const inputGrooveOffset = document.getElementById('input-groove-offset');
    const inputGrooveWidth = document.getElementById('input-groove-width');
    const inputGrooveDepth = document.getElementById('input-groove-depth');
    
    // Referencias DOM - Costos y Presupuesto
    const selectMoneda = document.getElementById('select-moneda');
    const inputCostoPlancha = document.getElementById('input-costo-plancha');
    const inputCostoCorte = document.getElementById('input-costo-corte');
    const inputCostoCantoDel = document.getElementById('input-costo-canto-del');
    const inputCostoCantoGru = document.getElementById('input-costo-canto-gru');
    const inputCostoRanura = document.getElementById('input-costo-ranura');
    
    // Cotización Comercial Avanzada
    const inputCostoManoObra = document.getElementById('input-costo-mano-obra');
    const inputCostoHerrajes = document.getElementById('input-costo-herrajes');
    const inputMargenGanancia = document.getElementById('input-margen-ganancia');
    const inputImpuesto = document.getElementById('input-impuesto');
    
    // Tema Claro / Oscuro
    const btnThemeToggle = document.getElementById('btn-theme-toggle');
    const darkIcon = document.getElementById('theme-toggle-dark-icon');
    const lightIcon = document.getElementById('theme-toggle-light-icon');
    
    // Importador CSV
    const btnToggleImport = document.getElementById('btn-toggle-import');
    const importCsvContainer = document.getElementById('import-csv-container');
    const importCsvTextarea = document.getElementById('import-csv-textarea');
    const btnImportCsvConfirm = document.getElementById('btn-import-csv-confirm');
    const btnImportCsvCancel = document.getElementById('btn-import-csv-cancel');
    
    const partsTbody = document.getElementById('parts-tbody');
    const btnAddRow = document.getElementById('btn-add-row');
    const btnOptimize = document.getElementById('btn-optimize');
    const optimizeBtnDefaultHtml = btnOptimize ? btnOptimize.innerHTML : '';
    const btnClearAll = document.getElementById('btn-clear-all');
    const btnLoadPresetMueble = document.getElementById('btn-load-preset-mueble');
    
    // Resultados DOM - Métricas y Costos
    const resultsSection = document.getElementById('results-section');
    const valEficiencia = document.getElementById('val-eficiencia');
    const circleEficiencia = document.getElementById('circle-eficiencia');
    const valPlanchas = document.getElementById('val-planchas');
    const valCantoDelgado = document.getElementById('val-canto-delgado');
    const valCantoGrueso = document.getElementById('val-canto-grueso');
    const valMetrosCorte = document.getElementById('val-metros-corte');
    const valNumCortes = document.getElementById('val-num-cortes');
    const valMetrosRanura = document.getElementById('val-metros-ranura');
    
    const valCostoTotal = document.getElementById('val-costo-total');
    const valSubPlanchas = document.getElementById('val-sub-planchas');
    const valSubServicios = document.getElementById('val-sub-servicios');
    
    // Referencias DOM - Excedentes no colocados
    const unplacedContainer = document.getElementById('unplaced-container');
    const unplacedCount = document.getElementById('unplaced-count');
    const unplacedListEl = document.getElementById('unplaced-list-el');
    
    // Canvas y Navegación
    const btnPrevSheet = document.getElementById('btn-prev-sheet');
    const btnNextSheet = document.getElementById('btn-next-sheet');
    const sheetNavLabel = document.getElementById('sheet-nav-label');
    const btnDownloadImg = document.getElementById('btn-download-img');
    const btnDownloadPdf = document.getElementById('btn-download-pdf');
    const btnPrintReport = document.getElementById('btn-print-report');
    
    const btnZoomIn = document.getElementById('btn-zoom-in');
    const btnZoomOut = document.getElementById('btn-zoom-out');
    const btnZoomReset = document.getElementById('btn-zoom-reset');
    const btnFullscreenToggle = document.getElementById('btn-fullscreen-toggle');
    
    const selectMaterialGroup = document.getElementById('select-material-group');
    
    // Asistente de Secuencia de Cortes
    const btnSeqPrev = document.getElementById('btn-seq-prev');
    const btnSeqNext = document.getElementById('btn-seq-next');
    const btnSeqReset = document.getElementById('btn-seq-reset');
    const btnSeqDone = document.getElementById('btn-seq-done');
    const lblSeqStep = document.getElementById('lbl-seq-step');
    const wizardOverlay = document.getElementById('cut-wizard-overlay');
    const wizardOverlayText = document.getElementById('cut-wizard-overlay-text');
    const btnOverlayPrev = document.getElementById('btn-overlay-prev');
    const btnOverlayNext = document.getElementById('btn-overlay-next');
    const btnOverlayDone = document.getElementById('btn-overlay-done');
    const sequenceStaleBanner = document.getElementById('sequence-stale-banner');
    const CUT_PROGRESS_KEY = 'melaminacut_cut_progress';
    
    // Inicializar Canvas
    const canvasController = new CutMapCanvas('cut-map-canvas', 'cut-map-canvas');
    let optimizationResults = null;
    let activeSheetIndex = 0;
    let activeMaterialGroup = ""; // Grupo de material seleccionado actualmente
    let activeCutStepIndex = -1; // Corte resaltado actualmente (-1 = ninguno)
    let printReportDirty = true;
    let optimizeGeneration = 0;

    // 1. Cargar Presets de Planchas en el select
    PLANCHA_PRESETS.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        selectPlanchaPreset.appendChild(opt);
    });

    // 2. Cargar Presets de Muebles en el select
    MUEBLE_PRESETS.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.name;
        selectMueblePreset.appendChild(opt);
    });

    // Listener cambio de plancha preset
    selectPlanchaPreset.addEventListener('change', (e) => {
        const selected = PLANCHA_PRESETS.find(p => p.id === e.target.value);
        if (selected) {
            inputLargo.value = selected.largo;
            inputAncho.value = selected.ancho;
            selectEspesor.value = selected.espesor;
            inputMaterial.value = selected.material;
            saveStateToLocalStorage();
        }
    });

    // Listener cambio de mueble preset
    selectMueblePreset.addEventListener('change', (e) => {
        const selected = MUEBLE_PRESETS.find(m => m.id === e.target.value);
        if (selected) {
            loadFurniturePreset(selected);
        }
    });

    btnLoadPresetMueble.addEventListener('click', () => {
        const defaultPreset = MUEBLE_PRESETS.find(m => m.id === 'velador') || MUEBLE_PRESETS[0];
        loadFurniturePreset(defaultPreset);
        selectMueblePreset.value = defaultPreset.id;
    });

    // 3. Gestión de Filas de la Tabla
    function getMaterialOptions(selected) {
        const options = new Set(['Estándar 18mm', 'MDF Fondo 3mm', 'Roble 18mm']);
        const sheetMat = (inputMaterial.value || '').trim();
        if (sheetMat) options.add(sheetMat);
        if (selected) options.add(selected);
        if (partsTbody) {
            partsTbody.querySelectorAll('.part-material').forEach(sel => {
                if (sel.value) options.add(sel.value);
            });
        }
        return Array.from(options);
    }

    function createRowDOM(partData = {}) {
        const tr = document.createElement('tr');
        tr.className = 'part-row';
        
        const name = partData.name || '';
        const colorPalette = ["#06b6d4", "#3b82f6", "#f97316", "#8b5cf6", "#10b981", "#ec4899", "#f59e0b"];
        const numRows = partsTbody ? partsTbody.querySelectorAll('.part-row').length : 0;
        const color = partData.color || colorPalette[numRows % colorPalette.length];
        const material = partData.material || (inputMaterial.value || '').trim() || 'Estándar 18mm';
        const materialOptions = getMaterialOptions(material);
        const largo = partData.largo || '';
        const ancho = partData.ancho || '';
        const cant = partData.cant || 1;
        const veta = partData.veta !== undefined ? partData.veta : false;
        
        // cantos: [L1, L2, A1, A2] -> 0: Ninguno, 1: Delgado, 2: Grueso
        const cantos = partData.cantos ? [...partData.cantos] : [0, 0, 0, 0];
        // grooves: [L1, L2, A1, A2] -> 0: No, 1: Sí
        const grooves = partData.grooves ? [...partData.grooves] : [0, 0, 0, 0];

        const materialOptionsHtml = materialOptions.map(mat =>
            `<option value="${escapeHtml(mat)}" ${mat === material ? 'selected' : ''}>${escapeHtml(mat)}</option>`
        ).join('');

        tr.innerHTML = `
            <td class="row-num"></td>
            <td><input type="text" class="table-input part-name" placeholder="Ej. Lateral" value="${escapeHtml(name)}"></td>
            <td><input type="color" class="table-input part-color" value="${escapeHtml(color)}" title="Elegir Color de la pieza"></td>
            <td>
                <select class="table-input part-material" style="font-weight: 500;">
                    ${materialOptionsHtml}
                </select>
            </td>
            <td><input type="number" class="table-input part-largo" placeholder="0" value="${largo}" min="10"></td>
            <td><input type="number" class="table-input part-ancho" placeholder="0" value="${ancho}" min="10"></td>
            <td><input type="number" class="table-input part-cant" placeholder="1" value="${cant}" min="1"></td>
            <td><input type="checkbox" class="part-veta" ${veta ? 'checked' : ''}></td>
            <td>
                <div class="canto-config-grid">
                    <button class="canto-btn" data-edge="0" title="Largo Superior (L1)">L1</button>
                    <button class="canto-btn" data-edge="1" title="Largo Inferior (L2)">L2</button>
                    <button class="canto-btn" data-edge="2" title="Ancho Izquierdo (A1)">A1</button>
                    <button class="canto-btn" data-edge="3" title="Ancho Derecho (A2)">A2</button>
                </div>
                <div class="canto-print-label print-only"></div>
            </td>
            <td>
                <div class="canto-config-grid">
                    <button class="groove-btn" data-edge="0" title="Surco Superior (L1)">L1</button>
                    <button class="groove-btn" data-edge="1" title="Surco Inferior (L2)">L2</button>
                    <button class="groove-btn" data-edge="2" title="Surco Izquierdo (A1)">A1</button>
                    <button class="groove-btn" data-edge="3" title="Surco Derecho (A2)">A2</button>
                </div>
                <div class="groove-print-label print-only"></div>
            </td>
            <td>
                <div class="row-actions">
                    <button class="btn-icon duplicate" title="Duplicar pieza">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    </button>
                    <button class="btn-icon delete" title="Eliminar fila">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                    </button>
                </div>
            </td>
        `;

        // Configurar navegación por teclado
        tr.querySelectorAll('.table-input').forEach(input => {
            input.addEventListener('keydown', (e) => {
                const row = tr;
                const fieldClass = Array.from(input.classList).find(c => c.startsWith('part-'));
                
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    const nextRow = row.nextElementSibling;
                    if (nextRow) {
                        const target = nextRow.querySelector('.' + fieldClass);
                        if (target) target.focus();
                    }
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    const prevRow = row.previousElementSibling;
                    if (prevRow) {
                        const target = prevRow.querySelector('.' + fieldClass);
                        if (target) target.focus();
                    }
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    const nextRow = row.nextElementSibling;
                    if (nextRow) {
                        const target = nextRow.querySelector('.' + fieldClass);
                        if (target) target.focus();
                    } else {
                        addNewRow();
                        const newRow = partsTbody.lastElementChild;
                        if (newRow) {
                            const target = newRow.querySelector('.' + fieldClass);
                            if (target) target.focus();
                        }
                    }
                }
            });
        });

        // Configurar botones de tapacantos (ciclo de clicks)
        const cantoBtns = tr.querySelectorAll('.canto-btn');
        cantoBtns.forEach((btn, idx) => {
            const state = cantos[idx];
            applyCantoState(btn, state);

            btn.addEventListener('click', () => {
                let currentState = parseInt(btn.getAttribute('data-state')) || 0;
                let nextState = (currentState + 1) % 3; // 0 -> 1 -> 2 -> 0
                applyCantoState(btn, nextState);
                updatePrintLabels(tr);
                saveStateToLocalStorage();
            });
        });

        // Configurar botones de surcos (Ranuras)
        const grooveBtns = tr.querySelectorAll('.groove-btn');
        grooveBtns.forEach((btn, idx) => {
            const active = grooves[idx] === 1;
            if (active) btn.classList.add('active');

            btn.addEventListener('click', () => {
                btn.classList.toggle('active');
                updatePrintLabels(tr);
                saveStateToLocalStorage();
            });
        });

        // Configurar duplicado de fila
        tr.querySelector('.btn-icon.duplicate').addEventListener('click', () => {
            const currentData = getRowData(tr);
            const newRow = createRowDOM(currentData);
            tr.after(newRow);
            updateRowNumbers();
            saveStateToLocalStorage();
        });

        // Configurar eliminación de fila
        tr.querySelector('.btn-icon.delete').addEventListener('click', () => {
            tr.remove();
            updateRowNumbers();
            if (partsTbody.children.length === 0) {
                addNewRow();
            }
            saveStateToLocalStorage();
        });

        // Cambiar color en tiempo real sin re-optimizar
        const colorInput = tr.querySelector('.part-color');
        if (colorInput) {
            colorInput.addEventListener('input', () => {
                const idx = Array.from(partsTbody.children).indexOf(tr);
                if (optimizationResults && idx > -1) {
                    const selectedColor = colorInput.value;
                    for (const matName in optimizationResults.groups) {
                        const group = optimizationResults.groups[matName];
                        for (const sheet of group.sheets) {
                            for (const p of sheet.placedParts) {
                                if (p.originalIndex === idx) {
                                    p.color = selectedColor;
                                }
                            }
                        }
                        for (const p of group.unplacedParts) {
                            if (p.originalIndex === idx) {
                                    p.color = selectedColor;
                            }
                        }
                    }
                    if (optimizationResults.unplacedParts) {
                        for (const p of optimizationResults.unplacedParts) {
                            if (p.originalIndex === idx) {
                                p.color = selectedColor;
                            }
                        }
                    }
                    canvasController.render();
                }
                saveStateToLocalStorage();
            });
        }

        // Guardado automático ante cualquier cambio de valor
        tr.querySelectorAll('.table-input, input[type="checkbox"]').forEach(el => {
            el.addEventListener('change', () => {
                saveStateToLocalStorage();
                applyRowWarnings();
            });
        });

        updatePrintLabels(tr);

        return tr;
    }

    function applyCantoState(button, state) {
        button.setAttribute('data-state', state);
        button.classList.remove('delgado', 'grueso');

        const titles = {
            '0': 'Largo Superior (L1)',
            '1': 'Largo Inferior (L2)',
            '2': 'Ancho Izquierdo (A1)',
            '3': 'Ancho Derecho (A2)'
        };
        let title = titles[button.getAttribute('data-edge')] || button.textContent;

        if (state === 1) {
            button.classList.add('delgado');
            title += ' [Delgado]';
        } else if (state === 2) {
            button.classList.add('grueso');
            title += ' [Grueso]';
        }
        button.title = title;
    }

    function updatePrintLabels(rowEl) {
        // 1. Tapacantos
        const cantoBtns = rowEl.querySelectorAll('.canto-btn');
        const cantoLabels = ["L1", "L2", "A1", "A2"];
        const cantoParts = [];
        cantoBtns.forEach((btn, idx) => {
            const state = parseInt(btn.getAttribute('data-state')) || 0;
            if (state === 1) cantoParts.push(`${cantoLabels[idx]}(D)`);
            if (state === 2) cantoParts.push(`${cantoLabels[idx]}(G)`);
        });
        const cantoText = cantoParts.length > 0 ? cantoParts.join(",") : "-";
        const cantoLabelEl = rowEl.querySelector('.canto-print-label');
        if (cantoLabelEl) cantoLabelEl.textContent = cantoText;
        
        // 2. Surcos
        const grooveBtns = rowEl.querySelectorAll('.groove-btn');
        const grooveLabels = ["L1", "L2", "A1", "A2"];
        const grooveParts = [];
        grooveBtns.forEach((btn, idx) => {
            if (btn.classList.contains('active')) {
                grooveParts.push(grooveLabels[idx]);
            }
        });
        const grooveText = grooveParts.length > 0 ? grooveParts.join(",") : "-";
        const grooveLabelEl = rowEl.querySelector('.groove-print-label');
        if (grooveLabelEl) grooveLabelEl.textContent = grooveText;
    }

    function getRowData(rowEl) {
        const name = rowEl.querySelector('.part-name').value.trim();
        const color = rowEl.querySelector('.part-color').value;
        const material = rowEl.querySelector('.part-material').value;
        const largo = parseFloat(rowEl.querySelector('.part-largo').value) || 0;
        const ancho = parseFloat(rowEl.querySelector('.part-ancho').value) || 0;
        const cant = parseInt(rowEl.querySelector('.part-cant').value) || 1;
        const veta = rowEl.querySelector('.part-veta').checked;
        
        const cantos = [];
        rowEl.querySelectorAll('.canto-btn').forEach(btn => {
            cantos.push(parseInt(btn.getAttribute('data-state')) || 0);
        });

        const grooves = [];
        rowEl.querySelectorAll('.groove-btn').forEach(btn => {
            grooves.push(btn.classList.contains('active') ? 1 : 0);
        });

        return { name, color, material, largo, ancho, cant, veta, cantos, grooves };
    }

    function physicalCutSize(data) {
        let largo = data.largo;
        let ancho = data.ancho;
        if (checkDescontarCanto.checked) {
            const d = parseFloat(inputCantoDelgadoVal.value) || 0.4;
            const g = parseFloat(inputCantoGruesoVal.value) || 2;
            const esp = [0, d, g];
            largo -= (esp[data.cantos[2] || 0] + esp[data.cantos[3] || 0]);
            ancho -= (esp[data.cantos[0] || 0] + esp[data.cantos[1] || 0]);
        }
        return { largo, ancho };
    }

    function applyRowWarnings(rawParts) {
        const rows = partsTbody.querySelectorAll('.part-row');
        const usableW = (parseFloat(inputLargo.value) || 0) - 2 * (parseFloat(inputRefilado.value) || 0);
        const usableH = (parseFloat(inputAncho.value) || 0) - 2 * (parseFloat(inputRefilado.value) || 0);
        const vetaOn = checkTieneVeta.checked;

        rows.forEach((row) => {
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
        void rawParts;
    }

    function confirmWorkshopParams(rawParts) {
        const kerf = parseFloat(inputSierra.value) || 0;
        const refilado = parseFloat(inputRefilado.value) || 0;
        const totalQty = rawParts.reduce((s, p) => s + (p.cant || 0), 0);
        if (kerf > 8 && !confirm(`El kerf es ${kerf} mm (mayor a 8 mm). ¿Continuar?`)) return false;
        if (refilado > 20 && !confirm(`El refilado es ${refilado} mm (mayor a 20 mm). ¿Continuar?`)) return false;
        if (totalQty > 200 && !confirm(`Hay ${totalQty} piezas (>200). El cálculo puede tardar. ¿Continuar?`)) return false;
        return true;
    }

    function updateWorkshopChecklist() {
        const vetaEl = document.getElementById('chk-veta-state');
        const cantoEl = document.getElementById('chk-canto-state');
        if (vetaEl) {
            vetaEl.textContent = `Veta global: ${checkTieneVeta.checked ? 'ON' : 'OFF'}`;
            vetaEl.classList.toggle('is-on', checkTieneVeta.checked);
        }
        if (cantoEl) {
            cantoEl.textContent = `Descontar canto: ${checkDescontarCanto.checked ? 'ON' : 'OFF'}`;
            cantoEl.classList.toggle('is-on', checkDescontarCanto.checked);
        }
    }

    function cutKindLabel(cut) {
        if (cut.kind === 'raja') return 'Raja';
        if (cut.kind === 'traza') return 'Traza';
        return cut.level === 1 ? 'Raja' : 'Traza';
    }

    function sheetProgressKey(mat, sheet) {
        const fences = (sheet.cuts || []).map(c => Math.round(c.fenceMm || 0)).join('-');
        return `${mat}|${sheet.id}|${(sheet.cuts || []).length}|${fences}`;
    }

    function loadCutProgress(mat, sheet) {
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
            all[sheetProgressKey(mat, sheet)] = doneIdx;
            localStorage.setItem(CUT_PROGRESS_KEY, JSON.stringify(all));
        } catch (e) { /* ignore quota */ }
    }

    function anySequenceStale() {
        if (!optimizationResults) return false;
        for (const mat of Object.keys(optimizationResults.groups || {})) {
            for (const sheet of optimizationResults.groups[mat].sheets || []) {
                if (sheet.sequenceStale) return true;
            }
        }
        return false;
    }

    function addNewRow(partData = {}) {
        const row = createRowDOM(partData);
        partsTbody.appendChild(row);
        updateRowNumbers();
    }

    function updateRowNumbers() {
        const rows = partsTbody.querySelectorAll('.part-row');
        rows.forEach((row, idx) => {
            row.querySelector('.row-num').textContent = idx + 1;
        });
    }

    btnAddRow.addEventListener('click', () => {
        addNewRow();
        saveStateToLocalStorage();
    });

    btnClearAll.addEventListener('click', () => {
        if (confirm('¿Estás seguro de que quieres limpiar todo el listado de piezas y configuración?')) {
            partsTbody.innerHTML = '';
            addNewRow();
            inputLargo.value = 2440;
            inputAncho.value = 1830;
            selectEspesor.value = 18;
            inputMaterial.value = 'Blanco Masisa';
            inputSierra.value = 4;
            inputRefilado.value = 10;
            checkDescontarCanto.checked = true;
            checkTieneVeta.checked = false;
            selectMetodoCorte.value = 'optimal';
            inputCantoDelgadoVal.value = '0.4';
            inputCantoGruesoVal.value = '2.0';
            inputGrooveOffset.value = '15';
            inputGrooveWidth.value = '4';
            inputGrooveDepth.value = '8';
            inputCostoPlancha.value = '45';
            inputCostoCorte.value = '0.5';
            inputCostoCantoDel.value = '0.8';
            inputCostoCantoGru.value = '2.5';
            inputCostoRanura.value = '1.0';
            selectMoneda.value = 'PEN';
            updateCurrencyLabels();
            selectPlanchaPreset.selectedIndex = 0;
            selectMueblePreset.selectedIndex = 0;
            resultsSection.style.display = 'none';
            unplacedContainer.style.display = 'none';
            saveStateToLocalStorage();
        }
    });

    // 4. Cargar Preset Mueble completo en la tabla
    function loadFurniturePreset(preset) {
        partsTbody.innerHTML = '';
        
        inputMaterial.value = preset.material;
        if (preset.plancha) {
            inputLargo.value = preset.plancha.largo || 2440;
            inputAncho.value = preset.plancha.ancho || 1830;
            checkTieneVeta.checked = preset.plancha.veta || false;
        }

        preset.parts.forEach(p => {
            addNewRow(p);
        });
        
        saveStateToLocalStorage();
        runOptimization();
    }

    // 5. Motor de Optimización y Flujo
    function runOptimization() {
        const rows = partsTbody.querySelectorAll('.part-row');
        const rawParts = [];

        rows.forEach((row, rowIdx) => {
            const data = getRowData(row);
            if (data.largo > 0 && data.ancho > 0 && data.cant > 0) {
                rawParts.push({
                    ...data,
                    id: `p${rowIdx}`,
                    index: rowIdx
                });
            }
        });

        if (rawParts.length === 0) {
            alert('Por favor ingrese al menos una pieza válida con largo, ancho y cantidad mayor a cero.');
            return;
        }

        applyRowWarnings(rawParts);
        if (!confirmWorkshopParams(rawParts)) return;

        const opt = new CutOptimizer({
            planchaLargo: parseFloat(inputLargo.value),
            planchaAncho: parseFloat(inputAncho.value),
            espesorSierra: parseFloat(inputSierra.value),
            refilado: parseFloat(inputRefilado.value),
            descontarCanto: checkDescontarCanto.checked,
            tieneVetaGlobal: checkTieneVeta.checked,
            metodoCorte: selectMetodoCorte.value,
            preferFewerFenceChanges: !!(checkPreferFence && checkPreferFence.checked),
            cantoDelgadoEspesor: parseFloat(inputCantoDelgadoVal.value) || 0.4,
            cantoGruesoEspesor: parseFloat(inputCantoGruesoVal.value) || 2.0
        });

        const gen = ++optimizeGeneration;
        btnOptimize.disabled = true;
        btnOptimize.classList.add('is-busy');
        btnOptimize.innerHTML = '<span>Optimizando…</span>';

        const finishOptimize = () => {
            if (gen !== optimizeGeneration) return;
            btnOptimize.disabled = false;
            btnOptimize.classList.remove('is-busy');
            btnOptimize.innerHTML = optimizeBtnDefaultHtml;
        };

        // Cede un frame para que el botón muestre el estado de carga
        requestAnimationFrame(() => {
            if (gen !== optimizeGeneration) return;
            try {
                const results = opt.optimize(rawParts);
                if (gen !== optimizeGeneration) return;
                optimizationResults = results;

                selectMaterialGroup.innerHTML = '';
                const materialKeys = Object.keys(optimizationResults.groups);
                materialKeys.forEach(key => {
                    const optEl = document.createElement('option');
                    optEl.value = key;
                    optEl.textContent = key;
                    selectMaterialGroup.appendChild(optEl);
                });

                if (materialKeys.length > 0) {
                    activeMaterialGroup = materialKeys[0];
                } else {
                    activeMaterialGroup = "Estándar 18mm";
                }

                displayResults(optimizationResults);
            } catch (err) {
                if (gen === optimizeGeneration) {
                    alert(`Error de optimización: ${err.message}`);
                }
            } finally {
                finishOptimize();
            }
        });
    }

    btnOptimize.addEventListener('click', runOptimization);

    // 6. Mostrar Resultados
    function displayResults(results, preserveActiveSheet = false) {
        resultsSection.style.display = 'block';

        // Renderizar leyenda dinámica de grosores
        txtCantoDelLegend.textContent = inputCantoDelgadoVal.value;
        txtCantoGruLegend.textContent = inputCantoGruesoVal.value;

        // Renderizar métricas globales
        valEficiencia.textContent = `${results.metrics.globalEfficiency}%`;
        valPlanchas.textContent = results.metrics.sheetsCount;
        valCantoDelgado.textContent = `${results.metrics.cantoDelgado} m`;
        valCantoGrueso.textContent = `${results.metrics.cantoGrueso} m`;
        valMetrosCorte.textContent = `${results.metrics.totalCutsLength} m`;
        valNumCortes.textContent = results.metrics.totalCutsCount;
        valMetrosRanura.textContent = `${results.metrics.totalGroovesLength} m`;

        const valSobrante = document.getElementById('val-sobrante');
        const valMerma = document.getElementById('val-merma');
        const strategyNote = document.getElementById('opt-strategy-note');
        if (valSobrante) {
            valSobrante.textContent = `${results.metrics.leftoverAreaM2 || 0} m²`;
        }
        if (valMerma) {
            valMerma.textContent = `${results.metrics.wastePercent || 0}%`;
        }
        if (strategyNote) {
            const tried = results.metrics.strategiesTried || 0;
            const winner = results.metrics.winningStrategy;
            strategyNote.textContent = tried > 1 && winner
                ? `Mejor de ${tried} layouts`
                : '';
            strategyNote.title = winner || '';
        }

        // Cotizar Presupuesto Estimado con cargos adicionales
        const costoPlancha = parseFloat(inputCostoPlancha.value) || 0;
        const costoCorte = parseFloat(inputCostoCorte.value) || 0;
        const costoCantoDel = parseFloat(inputCostoCantoDel.value) || 0;
        const costoCantoGru = parseFloat(inputCostoCantoGru.value) || 0;
        const costoRanura = parseFloat(inputCostoRanura.value) || 0;
        
        const costoManoObra = parseFloat(inputCostoManoObra.value) || 0;
        const costoHerrajes = parseFloat(inputCostoHerrajes.value) || 0;
        const margenGanancia = parseFloat(inputMargenGanancia.value) || 0;
        const impuestoVal = parseFloat(inputImpuesto.value) || 0;
        
        const totalPlanchasCosto = results.metrics.sheetsCount * costoPlancha;
        const totalServiciosCosto = 
            (results.metrics.totalCutsLength * costoCorte) +
            (results.metrics.cantoDelgado * costoCantoDel) +
            (results.metrics.cantoGrueso * costoCantoGru) +
            (results.metrics.totalGroovesLength * costoRanura);
            
        const costoMaterialesYServicios = totalPlanchasCosto + totalServiciosCosto + costoHerrajes;
        const costoConManoObra = costoMaterialesYServicios + costoManoObra;
        const costoConMargen = costoConManoObra * (1 + (margenGanancia / 100));
        const costoTotalFinal = costoConMargen * (1 + (impuestoVal / 100));
        
        const moneda = selectMoneda.value;
        valCostoTotal.textContent = formatPrice(costoTotalFinal, moneda);
        valSubPlanchas.textContent = `Costos Base: ${formatPrice(costoConManoObra, moneda)}`;
        valSubServicios.textContent = `Venta (c/Margen + Imp): ${formatPrice(costoTotalFinal, moneda)}`;

        // Animación del anillo de progreso
        const circle = circleEficiencia;
        const radius = circle.r.baseVal.value;
        const circumference = 2 * Math.PI * radius;
        circle.style.strokeDasharray = `${circumference}`;
        
        const offset = circumference - (results.metrics.globalEfficiency / 100) * circumference;
        circle.style.strokeDashoffset = offset;

        // Mostrar listado de Piezas No Colocadas
        unplacedListEl.innerHTML = '';
        if (results.unplacedParts && results.unplacedParts.length > 0) {
            unplacedContainer.style.display = 'block';
            unplacedCount.textContent = results.unplacedParts.length;
            
            results.unplacedParts.forEach(p => {
                const reasonMap = {
                    too_large: 'No cabe en la plancha (ni rotada)',
                    invalid_size: 'Medida de corte inválida (revise tapacantos)',
                    no_space: 'Sin espacio residual suficiente (kerf)'
                };
                const reason = reasonMap[p.unplacedReason] || 'No se pudo colocar';
                const card = document.createElement('div');
                card.className = 'unplaced-item';
                card.innerHTML = `
                    <div class="unplaced-item-info">
                        <span class="unplaced-item-name">${escapeHtml(p.name)}</span>
                        <span class="unplaced-item-size">${p.largoNominal} x ${p.anchoNominal} mm (${escapeHtml(p.material)})</span>
                        <span class="unplaced-item-size">${escapeHtml(reason)}</span>
                    </div>
                `;
                unplacedListEl.appendChild(card);
            });
        } else {
            unplacedContainer.style.display = 'none';
        }

        // Reiniciar paginación de planchas y visualización
        if (!preserveActiveSheet) {
            activeSheetIndex = 0;
            activeCutStepIndex = -1;
        } else {
            // Clamp activeSheetIndex to valid range in case sheets count changed
            const currentGroup = results.groups[activeMaterialGroup];
            const totalSheets = currentGroup ? currentGroup.sheets.length : 0;
            if (activeSheetIndex >= totalSheets) {
                activeSheetIndex = Math.max(0, totalSheets - 1);
            }
        }
        updateSheetNavigation();
        updateCutWizardUI();
        printReportDirty = true;
    }

    // Navegación de planchas
    function updateSheetNavigation() {
        if (!optimizationResults || !activeMaterialGroup) return;
        
        const currentGroup = optimizationResults.groups[activeMaterialGroup];
        if (!currentGroup || !currentGroup.sheets || currentGroup.sheets.length === 0) {
            sheetNavLabel.textContent = "Plancha 0 de 0";
            btnPrevSheet.disabled = true;
            btnNextSheet.disabled = true;
            return;
        }

        const totalSheets = currentGroup.sheets.length;
        sheetNavLabel.textContent = `Plancha ${activeSheetIndex + 1} de ${totalSheets}`;
        
        btnPrevSheet.disabled = (activeSheetIndex === 0);
        btnNextSheet.disabled = (activeSheetIndex === totalSheets - 1);
        
        canvasController.setSheet(currentGroup.sheets[activeSheetIndex]);
        const sheet = currentGroup.sheets[activeSheetIndex];
        if (sheet && !sheet.sequenceStale) {
            const done = loadCutProgress(activeMaterialGroup, sheet);
            canvasController.completedCutIndex = done;
            if (activeCutStepIndex < 0 && done >= 0 && done < (sheet.cuts || []).length - 1) {
                activeCutStepIndex = done + 1;
            } else if (activeCutStepIndex < 0 && done >= (sheet.cuts || []).length - 1 && (sheet.cuts || []).length) {
                activeCutStepIndex = sheet.cuts.length - 1;
            }
        }
        renderCutSequence(currentGroup.sheets[activeSheetIndex]);
    }

    // Secuencia de cortes descriptiva
    function renderCutSequence(sheet) {
        const seqList = document.getElementById('sequence-list-el');
        seqList.innerHTML = '';
        const stale = !!(sheet && sheet.sequenceStale);
        if (sequenceStaleBanner) sequenceStaleBanner.hidden = !stale;
        
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
            const kind = cutKindLabel(cut);
            const seq = cut.seq || (idx + 1);
            li.innerHTML = `<strong>Paso ${seq} (${kind}):</strong> ${escapeHtml(cut.desc)}`;
            li.addEventListener('click', () => {
                activeCutStepIndex = idx;
                updateCutWizardUI();
            });
            seqList.appendChild(li);
        });
    }

    // 7. Descarga de imagen y zoom
    btnDownloadImg.addEventListener('click', () => {
        canvasController.downloadImage();
    });

    btnPrintReport.addEventListener('click', () => {
        if (anySequenceStale()) {
            alert('La secuencia de cortes está desactualizada. Reoptimice antes de imprimir los pasos de sierra.');
        }
        generatePrintReport();
        window.print();
    });

    window.addEventListener('beforeprint', () => {
        generatePrintReport();
    });

    function generatePrintReport() {
        const printAllSheetsEl = document.getElementById('print-report-all-sheets');
        const printLabelsEl = document.getElementById('print-labels-sheet');
        if (!printAllSheetsEl || !optimizationResults || !printReportDirty) return;

        printAllSheetsEl.innerHTML = '';
        if (printLabelsEl) printLabelsEl.innerHTML = '';

        const stale = anySequenceStale();
        const labels = [];

        for (const matName in optimizationResults.groups) {
            const group = optimizationResults.groups[matName];
            group.sheets.forEach((sheet, idx) => {
                const section = document.createElement('div');
                section.className = 'print-sheet-section';

                canvasController.setSheet(sheet);
                const highResUrl = canvasController.getHighResDataURL(3000);

                let cutsHtml = '';
                if (stale || sheet.sequenceStale) {
                    cutsHtml = '<li>Secuencia desactualizada. Reoptimice antes de cortar.</li>';
                } else if (!sheet.cuts || sheet.cuts.length === 0) {
                    cutsHtml = '<li>No se requieren cortes para esta plancha.</li>';
                } else {
                    sheet.cuts.forEach((cut, cIdx) => {
                        const kind = cutKindLabel(cut);
                        cutsHtml += `<li><strong>Paso ${cut.seq || cIdx + 1} (${kind}):</strong> ${escapeHtml(cut.desc)}</li>`;
                    });
                }

                let partsRows = '';
                (sheet.placedParts || []).forEach((p) => {
                    const num = p.originalIndex !== undefined ? p.originalIndex + 1 : '';
                    const cantoLabels = ['L1', 'L2', 'A1', 'A2'];
                    const cantos = (p.cantos || []).map((c, i) => c ? `${cantoLabels[i]}${c === 2 ? 'G' : 'D'}` : null).filter(Boolean).join(',') || '-';
                    partsRows += `<tr><td>#${num}</td><td>${escapeHtml(p.name)}</td><td>${Math.round(p.w * 10) / 10}×${Math.round(p.h * 10) / 10}</td><td>${p.largoNominal}×${p.anchoNominal}</td><td>${escapeHtml(cantos)}</td></tr>`;
                    labels.push({
                        num,
                        name: p.name,
                        cut: `${Math.round(p.w * 10) / 10}×${Math.round(p.h * 10) / 10}`,
                        material: p.material || matName
                    });
                });

                section.innerHTML = `
                    <h3 class="card-title" style="margin-top: 0; margin-bottom: 0.25cm;">Plano de taller — ${escapeHtml(matName)} — Plancha ${idx + 1} de ${group.sheets.length}</h3>
                    <div class="print-sheet-img-container">
                        <img class="print-sheet-img" src="${highResUrl || ''}" />
                    </div>
                    <h4 style="font-size: 12pt; margin: 0.2cm 0; font-weight: bold; color: #000;">Pasos de sierra</h4>
                    <ol class="sequence-list print-steps" style="color: #000 !important; font-size: 11pt; padding-left: 1.25rem;">
                        ${cutsHtml}
                    </ol>
                    <table class="print-parts-table">
                        <thead><tr><th>#</th><th>Nombre</th><th>Corte mm</th><th>Nominal</th><th>Cantos</th></tr></thead>
                        <tbody>${partsRows}</tbody>
                    </table>
                `;
                printAllSheetsEl.appendChild(section);
            });
        }

        if (printLabelsEl && labels.length) {
            const page = document.createElement('div');
            page.className = 'print-labels-page';
            page.innerHTML = labels.map(l => `
                <div class="print-label">
                    <div class="label-num">#${escapeHtml(String(l.num))}</div>
                    <div class="label-name">${escapeHtml(l.name)}</div>
                    <div class="label-size">LxA corte ${escapeHtml(l.cut)} mm</div>
                    <div class="label-mat">${escapeHtml(l.material)}</div>
                </div>
            `).join('');
            printLabelsEl.appendChild(page);
        }

        if (optimizationResults.groups[activeMaterialGroup] && optimizationResults.groups[activeMaterialGroup].sheets[activeSheetIndex]) {
            canvasController.setSheet(optimizationResults.groups[activeMaterialGroup].sheets[activeSheetIndex]);
        }

        printReportDirty = false;
    }

    // Controles de zoom del canvas
    btnZoomIn.addEventListener('click', () => canvasController.zoom('in'));
    btnZoomOut.addEventListener('click', () => canvasController.zoom('out'));
    btnZoomReset.addEventListener('click', () => canvasController.zoom('reset'));
    if (btnFullscreenToggle) {
        btnFullscreenToggle.addEventListener('click', () => {
            const container = document.querySelector('.canvas-container');
            if (container) {
                const isFullscreen = container.classList.toggle('fullscreen-map');
                if (isFullscreen) {
                    // Save original parent and next sibling to restore it later
                    container._originalParent = container.parentElement;
                    container._originalNextSibling = container.nextSibling;
                    document.body.appendChild(container);
                } else {
                    // Restore to original parent and position
                    if (container._originalParent) {
                        container._originalParent.insertBefore(container, container._originalNextSibling);
                    }
                }
                setTimeout(() => {
                    canvasController.fitToScreen();
                }, 80);
            }
        });
    }

    // Helpers de Formato de Precios y Moneda
    function getCurrencySymbol(currency) {
        if (currency === 'PEN') return 'S/.';
        if (currency === 'USD') return '$USD';
        if (currency === 'COP') return '$COP';
        return '$';
    }

    function formatPrice(amount, currency) {
        if (currency === 'PEN') {
            return `S/. ${amount.toFixed(2)}`;
        } else if (currency === 'USD') {
            return `$USD ${amount.toFixed(2)}`;
        } else if (currency === 'COP') {
            const rounded = Math.round(amount);
            const formatted = rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
            return `$COP ${formatted}`;
        }
        return `$ ${amount.toFixed(2)}`;
    }

    function updateCurrencyLabels() {
        const symbol = getCurrencySymbol(selectMoneda.value);
        const labelPlancha = document.querySelector('label[for="input-costo-plancha"]');
        const labelCorte = document.querySelector('label[for="input-costo-corte"]');
        const labelCantoDel = document.querySelector('label[for="input-costo-canto-del"]');
        const labelCantoGru = document.querySelector('label[for="input-costo-canto-gru"]');
        const labelRanura = document.querySelector('label[for="input-costo-ranura"]');
        const labelManoObra = document.querySelector('label[for="input-costo-mano-obra"]');
        const labelHerrajes = document.querySelector('label[for="input-costo-herrajes"]');
        
        if (labelPlancha) labelPlancha.textContent = `Costo Plancha (${symbol})`;
        if (labelCorte) labelCorte.textContent = `Corte /m (${symbol})`;
        if (labelCantoDel) labelCantoDel.textContent = `Canto Delg. /m (${symbol})`;
        if (labelCantoGru) labelCantoGru.textContent = `Canto Grues. /m (${symbol})`;
        if (labelRanura) labelRanura.textContent = `Ranura /m (${symbol})`;
        if (labelManoObra) labelManoObra.textContent = `Mano de Obra (${symbol})`;
        if (labelHerrajes) labelHerrajes.textContent = `Herrajes/Acc. (${symbol})`;
        
        // Update input prefix symbols
        document.querySelectorAll('.currency-symbol').forEach(el => {
            el.textContent = symbol;
        });
    }

    // Recalcular presupuesto inmediatamente al cambiar los costos o la moneda
    const costInputs = [
        inputCostoPlancha,
        inputCostoCorte,
        inputCostoCantoDel,
        inputCostoCantoGru,
        inputCostoRanura,
        selectMoneda,
        inputCostoManoObra,
        inputCostoHerrajes,
        inputMargenGanancia,
        inputImpuesto
    ];
    
    costInputs.forEach(input => {
        if (input) {
            const eventHandler = () => {
                if (input === selectMoneda) {
                    updateCurrencyLabels();
                }
                recalculateStatsAndDisplay();
                saveStateToLocalStorage();
            };
            input.addEventListener('input', eventHandler);
            input.addEventListener('change', eventHandler);
        }
    });

    // 8. Enlace de Modificaciones Manuales en Canvas (Editor PRO)
    function recalculateStatsAndDisplay() {
        if (!optimizationResults || !activeMaterialGroup) return;
        
        let totalPlacedArea = 0;
        let totalCorteMetros = 0;
        let totalCantoDelgado = 0;
        let totalCantoGrueso = 0;
        let totalGroovesLength = 0;
        let totalCutsCount = 0;
        let leftoverArea = 0;
        
        const margin = parseFloat(inputRefilado.value) || 10;
        const planchaL = parseFloat(inputLargo.value) || 2440;
        const planchaA = parseFloat(inputAncho.value) || 1830;
        const usableArea = (planchaL - 2 * margin) * (planchaA - 2 * margin);
        
        // Recalcular métricas para todos los grupos de materiales
        for (const matName in optimizationResults.groups) {
            const group = optimizationResults.groups[matName];
            
            let groupPlacedArea = 0;
            let groupCutsLength = 0;
            let groupCutsCount = 0;
            let groupCantoDelgado = 0;
            let groupCantoGrueso = 0;
            let groupGrooves = 0;
            
            for (const sheet of group.sheets) {
                let placedArea = 0;
                for (const p of sheet.placedParts) {
                    placedArea += p.w * p.h;
                    
                    const largoM = p.largoNominal / 1000;
                    const anchoM = p.anchoNominal / 1000;
                    
                    [p.cantos[0], p.cantos[1]].forEach(c => {
                        if (c === 1) { totalCantoDelgado += largoM; groupCantoDelgado += largoM; }
                        if (c === 2) { totalCantoGrueso += largoM; groupCantoGrueso += largoM; }
                    });
                    
                    [p.cantos[2], p.cantos[3]].forEach(c => {
                        if (c === 1) { totalCantoDelgado += anchoM; groupCantoDelgado += anchoM; }
                        if (c === 2) { totalCantoGrueso += anchoM; groupCantoGrueso += anchoM; }
                    });
                    
                    if (p.grooves) {
                        [p.grooves[0], p.grooves[1]].forEach(g => {
                            if (g === 1) { totalGroovesLength += largoM; groupGrooves += largoM; }
                        });
                        [p.grooves[2], p.grooves[3]].forEach(g => {
                            if (g === 1) { totalGroovesLength += anchoM; groupGrooves += anchoM; }
                        });
                    }
                }
                sheet.efficiency = usableArea > 0 ? (placedArea / usableArea) * 100 : 0;
                groupPlacedArea += placedArea;
                
                let sheetCutsLength = 0;
                for (const cut of sheet.cuts) {
                    const dx = Math.abs(cut.x2 - cut.x1);
                    const dy = Math.abs(cut.y2 - cut.y1);
                    sheetCutsLength += (dx + dy) / 1000;
                }
                totalCorteMetros += sheetCutsLength;
                groupCutsLength += sheetCutsLength;
                totalCutsCount += sheet.cuts.length;
                groupCutsCount += sheet.cuts.length;

                for (const r of sheet.freeRects) {
                    leftoverArea += r.w * r.h;
                }
            }
            
            const groupUsableArea = group.sheets.length * usableArea;
            group.metrics = {
                globalEfficiency: groupUsableArea > 0 ? Math.round((groupPlacedArea / groupUsableArea) * 1000) / 10 : 0,
                sheetsCount: group.sheets.length,
                totalCutsLength: Math.round(groupCutsLength * 10) / 10,
                totalCutsCount: groupCutsCount,
                cantoDelgado: Math.round(groupCantoDelgado * 10) / 10,
                cantoGrueso: Math.round(groupCantoGrueso * 10) / 10,
                totalGroovesLength: Math.round(groupGrooves * 10) / 10
            };
            totalPlacedArea += groupPlacedArea;
        }
        
        let totalSheetsCount = 0;
        let totalUsableArea = 0;
        for (const matName in optimizationResults.groups) {
            const group = optimizationResults.groups[matName];
            totalSheetsCount += group.sheets.length;
            totalUsableArea += group.sheets.length * usableArea;
        }
        
        optimizationResults.metrics = {
            globalEfficiency: totalUsableArea > 0 ? Math.round((totalPlacedArea / totalUsableArea) * 1000) / 10 : 0,
            sheetsCount: totalSheetsCount,
            totalCutsLength: Math.round(totalCorteMetros * 10) / 10,
            totalCutsCount: totalCutsCount,
            cantoDelgado: Math.round(totalCantoDelgado * 10) / 10,
            cantoGrueso: Math.round(totalCantoGrueso * 10) / 10,
            totalGroovesLength: Math.round(totalGroovesLength * 10) / 10,
            leftoverAreaM2: Math.round((leftoverArea / 1e6) * 1000) / 1000,
            wastePercent: totalUsableArea > 0 ? Math.round((1 - totalPlacedArea / totalUsableArea) * 1000) / 10 : 0,
            strategiesTried: optimizationResults.metrics.strategiesTried || 0,
            winningStrategy: optimizationResults.metrics.winningStrategy || ''
        };
        
        displayResults(optimizationResults, true);
    }
    
    window.onCanvasPartModified = () => {
        recalculateStatsAndDisplay();
    };
    
    window.onCanvasPartRemoved = (part) => {
        if (!optimizationResults || !activeMaterialGroup) return;
        
        const currentGroup = optimizationResults.groups[activeMaterialGroup];
        const sheet = currentGroup.sheets[activeSheetIndex];
        sheet.placedParts = sheet.placedParts.filter(p => p !== part);
        
        optimizationResults.unplacedParts.push(part);
        currentGroup.unplacedParts.push(part);
        
        recalculateStatsAndDisplay();
    };

    function updateCutWizardUI() {
        if (!optimizationResults || !activeMaterialGroup) return;
        const currentGroup = optimizationResults.groups[activeMaterialGroup];
        const sheet = currentGroup.sheets[activeSheetIndex];
        
        if (!sheet || !sheet.cuts || sheet.cuts.length === 0 || sheet.sequenceStale) {
            btnSeqPrev.disabled = true;
            btnSeqNext.disabled = true;
            if (btnSeqDone) btnSeqDone.disabled = true;
            lblSeqStep.textContent = sheet && sheet.sequenceStale ? "Reoptimizar" : "Sin cortes";
            canvasController.activeCutIndex = -1;
            canvasController.render();
            if (wizardOverlay) wizardOverlay.hidden = true;
            return;
        }
        
        btnSeqPrev.disabled = (activeCutStepIndex <= -1);
        btnSeqNext.disabled = (activeCutStepIndex >= sheet.cuts.length - 1);
        if (btnSeqDone) btnSeqDone.disabled = activeCutStepIndex < 0;
        
        if (activeCutStepIndex === -1) {
            lblSeqStep.textContent = "Apagado";
            if (wizardOverlay) wizardOverlay.hidden = true;
        } else {
            const cut = sheet.cuts[activeCutStepIndex];
            lblSeqStep.textContent = `Corte ${activeCutStepIndex + 1} de ${sheet.cuts.length}`;
            if (wizardOverlay) {
                wizardOverlay.hidden = false;
                wizardOverlayText.textContent = cut.desc || `Tope a ${cut.fenceMm} mm`;
            }
        }
        
        canvasController.activeCutIndex = activeCutStepIndex;
        canvasController.render();
        
        const listItems = document.querySelectorAll('#sequence-list-el li');
        listItems.forEach((li, idx) => {
            if (idx === activeCutStepIndex) {
                li.style.backgroundColor = 'rgba(234, 179, 8, 0.15)';
                li.style.borderLeft = '3px solid #eab308';
                li.style.paddingLeft = '6px';
            } else {
                li.style.backgroundColor = '';
                li.style.borderLeft = '';
                li.style.paddingLeft = '';
            }
        });
    }

    function markCurrentCutDone() {
        if (!optimizationResults || !activeMaterialGroup) return;
        const currentGroup = optimizationResults.groups[activeMaterialGroup];
        const sheet = currentGroup.sheets[activeSheetIndex];
        if (!sheet || !sheet.cuts || sheet.sequenceStale) return;
        if (activeCutStepIndex < 0) activeCutStepIndex = 0;
        saveCutProgress(activeMaterialGroup, sheet, activeCutStepIndex);
        canvasController.completedCutIndex = activeCutStepIndex;
        if (activeCutStepIndex < sheet.cuts.length - 1) {
            activeCutStepIndex++;
        }
        updateCutWizardUI();
    }

    btnSeqPrev.addEventListener('click', () => {
        if (activeCutStepIndex > -1) {
            activeCutStepIndex--;
            updateCutWizardUI();
        }
    });

    btnSeqNext.addEventListener('click', () => {
        if (!optimizationResults || !activeMaterialGroup) return;
        const currentGroup = optimizationResults.groups[activeMaterialGroup];
        const sheet = currentGroup.sheets[activeSheetIndex];
        if (sheet && activeCutStepIndex < sheet.cuts.length - 1) {
            activeCutStepIndex++;
            updateCutWizardUI();
        }
    });

    btnSeqReset.addEventListener('click', () => {
        activeCutStepIndex = -1;
        updateCutWizardUI();
    });

    if (btnSeqDone) btnSeqDone.addEventListener('click', markCurrentCutDone);
    if (btnOverlayPrev) btnOverlayPrev.addEventListener('click', () => btnSeqPrev.click());
    if (btnOverlayNext) btnOverlayNext.addEventListener('click', () => btnSeqNext.click());
    if (btnOverlayDone) btnOverlayDone.addEventListener('click', markCurrentCutDone);

    selectMaterialGroup.addEventListener('change', (e) => {
        activeMaterialGroup = e.target.value;
        activeSheetIndex = 0;
        activeCutStepIndex = -1;
        updateSheetNavigation();
        updateCutWizardUI();
    });

    btnToggleImport.addEventListener('click', () => {
        if (importCsvContainer.style.display === 'none') {
            importCsvContainer.style.display = 'block';
            importCsvTextarea.value = '';
            importCsvTextarea.focus();
        } else {
            importCsvContainer.style.display = 'none';
        }
    });

    btnImportCsvCancel.addEventListener('click', () => {
        importCsvContainer.style.display = 'none';
    });

    btnImportCsvConfirm.addEventListener('click', () => {
        const text = importCsvTextarea.value.trim();
        if (!text) {
            alert('Por favor pegue datos válidos.');
            return;
        }

        const lines = text.split(/\r?\n/);
        let importedCount = 0;
        
        const rows = partsTbody.querySelectorAll('.part-row');
        if (rows.length === 1) {
            const firstRowData = getRowData(rows[0]);
            if (!firstRowData.name && !firstRowData.largo && !firstRowData.ancho) {
                partsTbody.innerHTML = '';
            }
        }

        lines.forEach(line => {
            if (!line.trim()) return;
            
            let parts = line.split('\t');
            if (parts.length < 2) {
                parts = line.split(/[,;]/);
            }

            let largo = 0;
            let ancho = 0;
            let cant = 1;
            let name = 'Pieza Importada';
            let material = 'Estándar 18mm';
            
            const vals = parts.map(p => p.trim()).filter(p => p !== '');
            if (vals.length >= 2) {
                const num1 = parseFloat(vals[0]);
                const num2 = parseFloat(vals[1]);
                
                if (!isNaN(num1) && !isNaN(num2)) {
                    largo = num1;
                    ancho = num2;
                    
                    if (vals.length >= 3) {
                        const num3 = parseInt(vals[2]);
                        if (!isNaN(num3)) {
                            cant = num3;
                            if (vals.length >= 4) name = vals[3];
                            if (vals.length >= 5) {
                                if (vals[4].includes('3mm') || vals[4].includes('Fondo')) {
                                    material = 'MDF Fondo 3mm';
                                } else if (vals[4].includes('Roble')) {
                                    material = 'Roble 18mm';
                                }
                            }
                        } else {
                            name = vals[2];
                        }
                    }
                } else {
                    const numbers = vals.map(v => parseFloat(v)).filter(n => !isNaN(n));
                    if (numbers.length >= 2) {
                        largo = numbers[0];
                        ancho = numbers[1];
                        if (numbers.length >= 3) cant = parseInt(numbers[2]);
                        const stringVal = vals.find(v => isNaN(parseFloat(v)));
                        if (stringVal) name = stringVal;
                    }
                }
            }
            
            if (largo > 0 && ancho > 0) {
                addNewRow({
                    name: name,
                    material: material,
                    largo: largo,
                    ancho: ancho,
                    cant: cant,
                    veta: false,
                    cantos: [0,0,0,0],
                    grooves: [0,0,0,0]
                });
                importedCount++;
            }
        });

        if (importedCount > 0) {
            importCsvContainer.style.display = 'none';
            saveStateToLocalStorage();
            runOptimization();
            alert(`Se importaron ${importedCount} piezas correctamente.`);
        } else {
            alert('No se encontraron líneas con formato de dimensiones válido.');
        }
    });

    btnDownloadPdf.addEventListener('click', () => {
        if (!optimizationResults) {
            alert("Por favor optimice primero para generar el PDF.");
            return;
        }
        if (anySequenceStale()) {
            alert("La secuencia de cortes está desactualizada. Reoptimice antes de imprimir los pasos de sierra. Se generará el mapa sin secuencia.");
        }
        
        const { jsPDF } = window.jspdf;
        if (!jsPDF) {
            alert("La librería PDF no se cargó correctamente.");
            return;
        }

        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });
        
        const margin = 15;
        let y = 20;
        const width = 210 - 2 * margin;
        
        const printText = (text, size, isBold = false, color = '#0f172a') => {
            doc.setFont('helvetica', isBold ? 'bold' : 'normal');
            doc.setFontSize(size);
            doc.setTextColor(color);
            doc.text(text, margin, y);
            y += size * 0.4 + 3;
        };

        printText("MelaminaCut - Reporte de Corte Profesional", 18, true, "#f97316");
        printText("Generado el: " + new Date().toLocaleDateString() + " " + new Date().toLocaleTimeString(), 9, false, "#64748b");
        
        y += 2;
        doc.setDrawColor(249, 115, 22);
        doc.setLineWidth(0.5);
        doc.line(margin, y, margin + width, y);
        y += 8;

        printText("RESUMEN DE COTIZACIÓN Y MÉTRICAS", 12, true, "#0f172a");
        y += 2;

        const moneda = selectMoneda.value;
        const totalCost = valCostoTotal.textContent;
        const totalSheets = valPlanchas.textContent;
        const totalCuts = valMetrosCorte.textContent;
        const totalDelgado = valCantoDelgado.textContent;
        const totalGrueso = valCantoGrueso.textContent;

        doc.setFillColor(241, 245, 249);
        doc.rect(margin, y, width, 38, 'F');
        doc.setDrawColor(203, 213, 225);
        doc.rect(margin, y, width, 38, 'S');
        
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor('#0f172a');
        
        doc.text(`Presupuesto Venta Comercial: ${totalCost}`, margin + 5, y + 8);
        doc.text(`Planchas Requeridas: ${totalSheets}`, margin + 5, y + 15);
        doc.text(`Eficiencia Global: ${valEficiencia.textContent}`, margin + 5, y + 22);
        doc.text(`Cargos Base + Mano Obra: ${valSubPlanchas.textContent}`, margin + 5, y + 29);

        doc.text(`Corte de Sierra Total: ${totalCuts} (${valNumCortes.textContent} cortes)`, margin + width / 2 + 5, y + 8);
        doc.text(`Tapacanto Delgado (D): ${totalDelgado}`, margin + width / 2 + 5, y + 15);
        doc.text(`Tapacanto Grueso (G): ${totalGrueso}`, margin + width / 2 + 5, y + 22);
        doc.text(`Surcos/Ranuras Total: ${valMetrosRanura.textContent}`, margin + width / 2 + 5, y + 29);
        
        y += 45;

        printText("DETALLE DE PIEZAS A CORTAR", 12, true, "#0f172a");
        y += 2;
        
        const colPositions = {
            num: margin + 2,
            name: margin + 8,
            material: margin + 60,
            largo: margin + 95,
            ancho: margin + 113,
            cant: margin + 131,
            tapacantos: margin + 141
        };

        const colWidths = {
            name: 48,
            material: 32,
            tapacantos: 36
        };

        doc.setFillColor(15, 23, 42);
        doc.rect(margin, y, width, 8, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor('#ffffff');
        doc.text("#", colPositions.num, y + 5);
        doc.text("Nombre", colPositions.name, y + 5);
        doc.text("Material/Espesor", colPositions.material, y + 5);
        doc.text("Largo", colPositions.largo, y + 5);
        doc.text("Ancho", colPositions.ancho, y + 5);
        doc.text("Cant", colPositions.cant, y + 5);
        doc.text("Tapacantos", colPositions.tapacantos, y + 5);
        
        y += 8;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor('#0f172a');
        
        const truncateText = (text, maxWidth) => {
            if (doc.getTextWidth(text) <= maxWidth) return text;
            let truncated = text;
            while (truncated.length > 0 && doc.getTextWidth(truncated + "...") > maxWidth) {
                truncated = truncated.slice(0, -1);
            }
            return truncated + "...";
        };

        const rows = partsTbody.querySelectorAll('.part-row');
        rows.forEach((row, idx) => {
            const data = getRowData(row);
            if (!data.largo || !data.ancho) return;
            
            if (y > 270) {
                doc.addPage();
                y = 20;
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(7.5);
                doc.setTextColor('#0f172a');
            }
            
            if (idx % 2 === 1) {
                doc.setFillColor(248, 250, 252);
                doc.rect(margin, y, width, 6, 'F');
            }
            
            doc.text(`${idx + 1}`, colPositions.num, y + 4.5);
            doc.text(truncateText(data.name || `Pieza ${idx + 1}`, colWidths.name), colPositions.name, y + 4.5);
            doc.text(truncateText(data.material, colWidths.material), colPositions.material, y + 4.5);
            doc.text(`${data.largo} mm`, colPositions.largo, y + 4.5);
            doc.text(`${data.ancho} mm`, colPositions.ancho, y + 4.5);
            doc.text(`${data.cant}`, colPositions.cant, y + 4.5);
            
            const cantoLabels = ["L1", "L2", "A1", "A2"];
            const cantoParts = [];
            data.cantos.forEach((c, cIdx) => {
                if (c === 1) cantoParts.push(`${cantoLabels[cIdx]}(D)`);
                if (c === 2) cantoParts.push(`${cantoLabels[cIdx]}(G)`);
            });
            const cantoText = cantoParts.length > 0 ? cantoParts.join(",") : "-";
            doc.text(truncateText(cantoText, colWidths.tapacantos), colPositions.tapacantos, y + 4.5);
            
            y += 6;
        });

        for (const matName in optimizationResults.groups) {
            const group = optimizationResults.groups[matName];
            
            group.sheets.forEach((sheet, idx) => {
                doc.addPage();
                y = 20;
                
                printText(`PLANO DE CORTE - ${matName.toUpperCase()}`, 14, true, "#f97316");
                printText(`Plancha ${idx + 1} de ${group.sheets.length} (Eficiencia: ${sheet.efficiency.toFixed(1)}%)`, 10, true, "#0f172a");
                y += 4;
                
                canvasController.setSheet(sheet);
                const highResUrl = canvasController.getHighResDataURL(3000);
                
                if (highResUrl) {
                    const imgAspect = sheet.h / sheet.w;
                    const imgWidth = width;
                    const imgHeight = width * imgAspect;
                    
                    try {
                        doc.addImage(highResUrl, 'PNG', margin, y, imgWidth, imgHeight);
                        y += imgHeight + 10;
                    } catch (e) {
                        y += 10;
                    }
                }
                
                if (y > 200) {
                    doc.addPage();
                    y = 20;
                }
                
                printText("Secuencia de Cortes Sugerida:", 10, true, "#0f172a");
                y += 2;

                if (sheet.sequenceStale || !sheet.cuts || sheet.cuts.length === 0) {
                    printText(sheet.sequenceStale
                        ? "Secuencia desactualizada. Reoptimice antes de cortar."
                        : "No se requieren cortes para esta plancha.", 8, false, "#334155");
                } else {
                    sheet.cuts.forEach((cut, cIdx) => {
                        if (y > 270) {
                            doc.addPage();
                            y = 20;
                        }
                        printText(`${cIdx + 1}. [${cutKindLabel(cut)}] ${cut.desc}`, 8, false, "#334155");
                    });
                }
            });
        }

        const labelParts = [];
        for (const matName in optimizationResults.groups) {
            const group = optimizationResults.groups[matName];
            group.sheets.forEach((sheet) => {
                (sheet.placedParts || []).forEach((p) => {
                    labelParts.push({
                        num: p.originalIndex !== undefined ? p.originalIndex + 1 : '',
                        name: p.name || 'Pieza',
                        cut: `${Math.round(p.w * 10) / 10}×${Math.round(p.h * 10) / 10}`,
                        material: p.material || matName
                    });
                });
            });
        }

        if (labelParts.length) {
            doc.addPage('a4', 'portrait');
            y = 18;
            printText("ETIQUETAS DE PIEZAS (50 × 30 mm)", 14, true, "#0f172a");
            y += 4;
            const lw = 50;
            const lh = 30;
            const gap = 4;
            let x = margin;
            labelParts.forEach((lab) => {
                if (y + lh > 287) {
                    doc.addPage();
                    y = 15;
                    x = margin;
                }
                if (x + lw > 210 - margin) {
                    x = margin;
                    y += lh + gap;
                    if (y + lh > 287) {
                        doc.addPage();
                        y = 15;
                    }
                }
                doc.setDrawColor(0);
                doc.setLineWidth(0.3);
                doc.rect(x, y, lw, lh);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(14);
                doc.setTextColor('#000000');
                doc.text(`#${lab.num}`, x + 2, y + 8);
                doc.setFontSize(9);
                doc.text(truncateText(lab.name, lw - 4), x + 2, y + 15);
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8);
                doc.text(`LxA corte ${lab.cut} mm`, x + 2, y + 21);
                doc.text(truncateText(lab.material, lw - 4), x + 2, y + 26);
                x += lw + gap;
            });
        }
        
        if (optimizationResults && activeMaterialGroup) {
            const currentGroup = optimizationResults.groups[activeMaterialGroup];
            if (currentGroup && currentGroup.sheets[activeSheetIndex]) {
                canvasController.setSheet(currentGroup.sheets[activeSheetIndex]);
            }
        }
        
        doc.save(`reporte_de_corte_melaminacut.pdf`);
    });

    function applyTheme(theme) {
        if (theme === 'light') {
            document.body.classList.add('light-theme');
            darkIcon.style.display = 'none';
            lightIcon.style.display = 'block';
        } else {
            document.body.classList.remove('light-theme');
            darkIcon.style.display = 'block';
            lightIcon.style.display = 'none';
        }
    }

    const savedTheme = localStorage.getItem('theme_preference') || 'dark';
    applyTheme(savedTheme);

    btnThemeToggle.addEventListener('click', () => {
        const currentTheme = document.body.classList.contains('light-theme') ? 'light' : 'dark';
        const nextTheme = currentTheme === 'light' ? 'dark' : 'light';
        applyTheme(nextTheme);
        localStorage.setItem('theme_preference', nextTheme);
        if (canvasController) {
            canvasController.render();
        }
    });

    function saveStateToLocalStorage() {
        const rows = partsTbody.querySelectorAll('.part-row');
        const partsData = [];
        rows.forEach(row => {
            const data = getRowData(row);
            if (data.name || data.largo > 0 || data.ancho > 0) {
                partsData.push(data);
            }
        });

        const state = {
            plancha: {
                largo: inputLargo.value,
                ancho: inputAncho.value,
                espesor: selectEspesor.value,
                material: inputMaterial.value,
                presetId: selectPlanchaPreset.value
            },
            parametros: {
                sierra: inputSierra.value,
                refilado: inputRefilado.value,
                descontarCanto: checkDescontarCanto.checked,
                tieneVeta: checkTieneVeta.checked,
                metodoCorte: selectMetodoCorte.value,
                preferFewerFenceChanges: !!(checkPreferFence && checkPreferFence.checked),
                cantoDelgadoEspesor: inputCantoDelgadoVal.value,
                cantoGruesoEspesor: inputCantoGruesoVal.value,
                grooveOffset: inputGrooveOffset.value,
                grooveWidth: inputGrooveWidth.value,
                grooveDepth: inputGrooveDepth.value
            },
            costos: {
                plancha: inputCostoPlancha.value,
                corte: inputCostoCorte.value,
                cantoDel: inputCostoCantoDel.value,
                cantoGru: inputCostoCantoGru.value,
                ranura: inputCostoRanura.value,
                moneda: selectMoneda.value,
                manoObra: inputCostoManoObra.value,
                herrajes: inputCostoHerrajes.value,
                margenGanancia: inputMargenGanancia.value,
                impuesto: inputImpuesto.value
            },
            parts: partsData
        };

        localStorage.setItem('melaminacut_project_state_pro', JSON.stringify(state));
    }

    function loadStateFromLocalStorage() {
        const serialized = localStorage.getItem('melaminacut_project_state_pro');
        if (!serialized) {
            const classic = localStorage.getItem('melaminacut_project_state');
            if (classic) {
                try {
                    const parsed = JSON.parse(classic);
                    partsTbody.innerHTML = '';
                    parsed.parts.forEach(p => addNewRow(p));
                    inputLargo.value = parsed.plancha.largo;
                    inputAncho.value = parsed.plancha.ancho;
                    inputMaterial.value = parsed.plancha.material;
                    selectMoneda.value = 'PEN';
                    updateCurrencyLabels();
                    setTimeout(runOptimization, 100);
                    return;
                } catch (e) {}
            }
            const defaultPreset = MUEBLE_PRESETS.find(m => m.id === 'velador') || MUEBLE_PRESETS[0];
            selectMoneda.value = 'PEN';
            updateCurrencyLabels();
            loadFurniturePreset(defaultPreset);
            return;
        }

        try {
            const state = JSON.parse(serialized);
            
            if (state.plancha) {
                inputLargo.value = state.plancha.largo || 2440;
                inputAncho.value = state.plancha.ancho || 1830;
                selectEspesor.value = state.plancha.espesor || 18;
                inputMaterial.value = state.plancha.material || 'Blanco';
                selectPlanchaPreset.value = state.plancha.presetId || '';
            }

            if (state.parametros) {
                inputSierra.value = state.parametros.sierra !== undefined ? state.parametros.sierra : 4;
                inputRefilado.value = state.parametros.refilado !== undefined ? state.parametros.refilado : 10;
                checkDescontarCanto.checked = state.parametros.descontarCanto !== undefined ? state.parametros.descontarCanto : true;
                checkTieneVeta.checked = state.parametros.tieneVeta !== undefined ? state.parametros.tieneVeta : false;
                
                selectMetodoCorte.value = state.parametros.metodoCorte || 'optimal';
                if (checkPreferFence) {
                    checkPreferFence.checked = !!state.parametros.preferFewerFenceChanges;
                }
                inputCantoDelgadoVal.value = state.parametros.cantoDelgadoEspesor || '0.4';
                inputCantoGruesoVal.value = state.parametros.cantoGruesoEspesor || '2.0';
                inputGrooveOffset.value = state.parametros.grooveOffset || '15';
                inputGrooveWidth.value = state.parametros.grooveWidth || '4';
                inputGrooveDepth.value = state.parametros.grooveDepth || '8';
            }

            if (state.costos) {
                inputCostoPlancha.value = state.costos.plancha || '45';
                inputCostoCorte.value = state.costos.corte || '0.5';
                inputCostoCantoDel.value = state.costos.cantoDel || '0.8';
                inputCostoCantoGru.value = state.costos.cantoGru || '2.5';
                inputCostoRanura.value = state.costos.ranura || '1.0';
                selectMoneda.value = state.costos.moneda || 'PEN';
                
                inputCostoManoObra.value = state.costos.manoObra || '0';
                inputCostoHerrajes.value = state.costos.herrajes || '0';
                inputMargenGanancia.value = state.costos.margenGanancia || '0';
                inputImpuesto.value = state.costos.impuesto || '0';
            } else {
                selectMoneda.value = 'PEN';
            }
            updateCurrencyLabels();

            partsTbody.innerHTML = '';
            if (state.parts && state.parts.length > 0) {
                state.parts.forEach(p => addNewRow(p));
            } else {
                addNewRow();
            }

            setTimeout(runOptimization, 100);

        } catch (e) {
            console.error('Error al cargar estado de localStorage:', e);
            const defaultPreset = MUEBLE_PRESETS.find(m => m.id === 'velador') || MUEBLE_PRESETS[0];
            loadFurniturePreset(defaultPreset);
        }
    }

    btnPrevSheet.addEventListener('click', () => {
        if (activeSheetIndex > 0) {
            activeSheetIndex--;
            activeCutStepIndex = -1;
            updateSheetNavigation();
            updateCutWizardUI();
        }
    });

    btnNextSheet.addEventListener('click', () => {
        if (!optimizationResults || !activeMaterialGroup) return;
        const currentGroup = optimizationResults.groups[activeMaterialGroup];
        if (activeSheetIndex < currentGroup.sheets.length - 1) {
            activeSheetIndex++;
            activeCutStepIndex = -1;
            updateSheetNavigation();
            updateCutWizardUI();
        }
    });

    document.querySelectorAll('.sidebar-config input, .sidebar-config select').forEach(el => {
        el.addEventListener('change', () => {
            saveStateToLocalStorage();
            updateWorkshopChecklist();
        });
    });

    loadStateFromLocalStorage();
    updateWorkshopChecklist();
});
