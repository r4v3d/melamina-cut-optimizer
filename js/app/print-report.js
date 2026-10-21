// Reporte imprimible: plano por plancha, pasos de sierra, tabla de piezas y etiquetas

import { dom } from './dom.js';
import { state, currentSheet, sheetTitle } from './state.js';
import { escapeHtml, cantosText, groovesText } from '../utils.js';
import { readGrooveSpec } from './settings.js';
import { anySequenceStale, cutKindLabel } from './sequence.js';
import { toast } from './ui-feedback.js';
import { isNativeApp } from './native.js';

const fmt1 = n => Math.round(n * 10) / 10;

// Etiquetas de todas las piezas colocadas (reporte impreso y PDF)
export function collectLabels() {
    const labels = [];
    for (const matName in state.results.groups) {
        state.results.groups[matName].sheets.forEach(sheet => {
            (sheet.placedParts || []).forEach(p => {
                labels.push({
                    num: p.originalIndex !== undefined ? p.originalIndex + 1 : '',
                    name: p.name || 'Pieza',
                    cut: `${fmt1(p.w)}×${fmt1(p.h)}`,
                    material: p.material || matName
                });
            });
        });
    }
    return labels;
}

export function grooveSpecText() {
    const g = readGrooveSpec();
    return `Surcos: a ${g.offset} mm del borde, ${g.width} mm de ancho × ${g.depth} mm de profundidad`;
}

export function generatePrintReport() {
    if (!dom.printAllSheets || !state.results || !state.printReportDirty) return;

    dom.printAllSheets.innerHTML = '';
    if (dom.printLabels) dom.printLabels.innerHTML = '';

    const stale = anySequenceStale();
    const hasGrooves = Object.values(state.results.groups).some(g =>
        g.sheets.some(s => s.placedParts.some(p => (p.grooves || []).some(Boolean))));

    for (const matName in state.results.groups) {
        const group = state.results.groups[matName];
        group.sheets.forEach((sheet, idx) => {
            const section = document.createElement('div');
            section.className = 'print-sheet-section';

            state.canvas.setSheet(sheet);
            const highResUrl = state.canvas.getHighResDataURL(3000);

            let cutsHtml = '';
            if (stale || sheet.sequenceStale) {
                cutsHtml = '<li>Secuencia desactualizada. Reoptimice antes de cortar.</li>';
            } else if (!sheet.cuts || sheet.cuts.length === 0) {
                cutsHtml = '<li>No se requieren cortes para esta plancha.</li>';
            } else {
                sheet.cuts.forEach((cut, cIdx) => {
                    cutsHtml += `<li><strong>Paso ${cut.seq || cIdx + 1} · ${cutKindLabel(cut)}</strong> — ${escapeHtml(cut.desc)}</li>`;
                });
            }

            let partsRows = '';
            (sheet.placedParts || []).forEach((p) => {
                const num = p.originalIndex !== undefined ? p.originalIndex + 1 : '';
                partsRows += `<tr><td>#${num}</td><td>${escapeHtml(p.name)}</td><td>${fmt1(p.w)}×${fmt1(p.h)}</td><td>${escapeHtml(p.largoNominal)}×${escapeHtml(p.anchoNominal)}</td><td>${escapeHtml(cantosText(p.cantos, false))}</td><td>${escapeHtml(groovesText(p.grooves))}</td></tr>`;
            });

            section.innerHTML = `
                <h3 class="card-title" style="margin-top: 0; margin-bottom: 0.25cm;">Plano de taller — ${escapeHtml(matName)} — ${escapeHtml(sheetTitle(sheet, idx))} (${idx + 1} de ${group.sheets.length})</h3>
                <div class="print-sheet-img-container">
                    <img class="print-sheet-img" src="${highResUrl || ''}" />
                </div>
                <h4 style="font-size: 12pt; margin: 0.2cm 0; font-weight: bold; color: #000;">Pasos de sierra</h4>
                <ol class="sequence-list print-steps" style="color: #000 !important; font-size: 11pt; padding-left: 1.25rem;">
                    ${cutsHtml}
                </ol>
                <table class="print-parts-table">
                    <thead><tr><th>#</th><th>Nombre</th><th>Corte mm</th><th>Nominal</th><th>Cantos</th><th>Surcos</th></tr></thead>
                    <tbody>${partsRows}</tbody>
                </table>
                ${hasGrooves ? `<p style="font-size: 10pt; color: #000; margin-top: 0.2cm;">${escapeHtml(grooveSpecText())}</p>` : ''}
            `;
            dom.printAllSheets.appendChild(section);
        });
    }

    const labels = collectLabels();
    if (dom.printLabels && labels.length) {
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
        dom.printLabels.appendChild(page);
    }

    const active = currentSheet();
    if (active) state.canvas.setSheet(active);
    state.printReportDirty = false;
}

export function initPrintReport() {
    dom.btnPrintReport.addEventListener('click', () => {
        if (anySequenceStale()) {
            toast('Hay planchas con la secuencia de cortes desactualizada. Reoptimice antes de cortar.', { type: 'warn' });
        }
        if (isNativeApp) {
            // El WebView de Android no imprime: se genera el PDF, que sí se puede imprimir o enviar
            import('./export-pdf.js').then(m => m.exportPdf());
            return;
        }
        generatePrintReport();
        window.print();
    });
    window.addEventListener('beforeprint', generatePrintReport);
}
