// Botones de exportación: lista de corte CSV (Excel) y plano DXF de la plancha visible

import { dom } from './dom.js';
import { state, currentSheet, sheetTitle } from './state.js';
import { cutListCsv, sheetDxf } from '../exporters.js';
import { downloadFile, safeFileName } from './modal.js';
import { toast } from './ui-feedback.js';

function projectSlug() {
    return safeFileName(dom.inputProjectName.value, 'proyecto');
}

function exportCsv() {
    if (!state.results) {
        toast('Optimice primero.', { type: 'warn' });
        return;
    }
    downloadFile(`lista_corte_${projectSlug()}.csv`, cutListCsv(state.results), 'text/csv;charset=utf-8');
}

function exportDxf() {
    const sheet = currentSheet();
    if (!sheet) {
        toast('Optimice primero.', { type: 'warn' });
        return;
    }
    const title = `${state.activeMaterialGroup} - ${sheetTitle(sheet, state.activeSheetIndex)}`;
    const name = `plano_${projectSlug()}_${safeFileName(state.activeMaterialGroup, 'material')}_${safeFileName(sheetTitle(sheet, state.activeSheetIndex))}.dxf`;
    downloadFile(name, sheetDxf(sheet, title), 'application/dxf');
    if (sheet.sequenceStale) {
        toast('Esta plancha tiene la secuencia desactualizada: el DXF no incluye líneas de corte.', { type: 'warn' });
    }
}

export function initExportsUi() {
    dom.btnExportCsv.addEventListener('click', exportCsv);
    dom.btnExportDxf.addEventListener('click', exportDxf);
}
