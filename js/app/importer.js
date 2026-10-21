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
            if (/\.(xlsx|xls|xlsm|ods)$/i.test(file.name)) {
                importSpreadsheet(file);
                return;
            }
            const reader = new FileReader();
            reader.onload = () => importText(String(reader.result).replace(/^\uFEFF/, ''));
            reader.onerror = () => toast('No se pudo leer el archivo.', { type: 'error' });
            reader.readAsText(file);
        });
    }
}

// SheetJS (≈950 KB) se carga solo la primera vez que se importa un Excel
let sheetJsPromise = null;
function loadSheetJs() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (!sheetJsPromise) {
        sheetJsPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = new URL('../../vendor/sheetjs/xlsx.full.min.js', import.meta.url).href;
            script.onload = () => (window.XLSX ? resolve(window.XLSX) : reject(new Error('SheetJS no disponible')));
            script.onerror = () => {
                sheetJsPromise = null;
                reject(new Error('No se pudo cargar el lector de Excel'));
            };
            document.head.appendChild(script);
        });
    }
    return sheetJsPromise;
}

// Primera hoja del libro → texto separado por tabulaciones → mismo importador que al pegar
async function importSpreadsheet(file) {
    try {
        const [XLSX, data] = await Promise.all([loadSheetJs(), file.arrayBuffer()]);
        const book = XLSX.read(data, { type: 'array' });
        const first = book.SheetNames[0];
        if (!first) throw new Error('El archivo no tiene hojas');
        const text = XLSX.utils.sheet_to_csv(book.Sheets[first], { FS: '\t', blankrows: false });
        importText(text);
    } catch (err) {
        toast(`No se pudo leer el Excel: ${err.message}`, { type: 'error' });
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
