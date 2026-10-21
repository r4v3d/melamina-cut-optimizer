// Importar piezas pegadas desde Excel / CSV

import { dom } from './dom.js';
import { parseImportText } from '../import-parser.js';
import { addNewRow, defaultMaterial, isTableEmpty } from './parts-table.js';
import { saveStateToLocalStorage } from './persistence.js';
import { runOptimization } from './optimize.js';
import { toast } from './ui-feedback.js';

export function initImporter() {
    dom.btnToggleImport.addEventListener('click', () => {
        if (dom.importCsvContainer.style.display === 'none') {
            dom.importCsvContainer.style.display = 'block';
            dom.importCsvTextarea.value = '';
            dom.importCsvTextarea.focus();
        } else {
            dom.importCsvContainer.style.display = 'none';
        }
    });

    dom.btnImportCsvCancel.addEventListener('click', () => {
        dom.importCsvContainer.style.display = 'none';
    });

    dom.btnImportCsvConfirm.addEventListener('click', () => {
        const text = dom.importCsvTextarea.value.trim();
        if (!text) {
            toast('Pegue primero los datos a importar.', { type: 'warn' });
            return;
        }
        importText(text);
    });

    // Subir un archivo .csv/.txt exportado desde Excel u otro programa
    if (dom.importFile) {
        dom.importFile.addEventListener('change', (e) => {
            const file = e.target.files[0];
            e.target.value = '';
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => importText(String(reader.result).replace(/^\uFEFF/, ''));
            reader.onerror = () => toast('No se pudo leer el archivo.', { type: 'error' });
            reader.readAsText(file);
        });
    }
}

function importText(text) {
    const parts = parseImportText(text, defaultMaterial());
    if (parts.length === 0) {
        toast('No se encontraron líneas con Largo y Ancho válidos.', { type: 'error' });
        return;
    }
    if (isTableEmpty()) dom.partsTbody.innerHTML = '';
    parts.forEach(p => addNewRow(p));
    dom.importCsvContainer.style.display = 'none';
    saveStateToLocalStorage();
    runOptimization();
    toast(`Se importaron ${parts.length} piezas.`, { type: 'success' });
}
