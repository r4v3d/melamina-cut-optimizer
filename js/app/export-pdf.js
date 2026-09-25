// Exportación del reporte de corte a PDF (jsPDF global cargado desde index.html)

import { dom } from './dom.js';
import { state, currentSheet, sheetTitle } from './state.js';
import { cantosText } from '../utils.js';
import { formatPrice } from './currency.js';
import { getRowData } from './parts-table.js';
import { anySequenceStale, cutKindLabel } from './sequence.js';
import { collectLabels, grooveSpecText } from './print-report.js';
import { toast } from './ui-feedback.js';

const PAGE_W = 210;
const MARGIN = 15;
const CONTENT_W = PAGE_W - 2 * MARGIN;

function exportPdf() {
    if (!state.results) {
        toast('Optimice primero para generar el PDF.', { type: 'warn' });
        return;
    }
    if (anySequenceStale()) {
        toast('Alguna plancha tiene la secuencia desactualizada: el PDF la incluye sin pasos de sierra.', { type: 'warn' });
    }
    const jsPDF = window.jspdf && window.jspdf.jsPDF;
    if (!jsPDF) {
        toast('La librería PDF no se cargó correctamente.', { type: 'error' });
        return;
    }

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    let y = 20;

    const printText = (text, size, isBold = false, color = '#0f172a') => {
        doc.setFont('helvetica', isBold ? 'bold' : 'normal');
        doc.setFontSize(size);
        doc.setTextColor(color);
        doc.text(text, MARGIN, y);
        y += size * 0.4 + 3;
    };
    const truncateText = (text, maxWidth) => {
        if (doc.getTextWidth(text) <= maxWidth) return text;
        let truncated = text;
        while (truncated.length > 0 && doc.getTextWidth(truncated + '...') > maxWidth) {
            truncated = truncated.slice(0, -1);
        }
        return truncated + '...';
    };

    // Encabezado
    printText('MelaminaCut - Reporte de Corte Profesional', 18, true, '#f97316');
    printText('Generado el: ' + new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString(), 9, false, '#64748b');
    y += 2;
    doc.setDrawColor(249, 115, 22);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
    y += 8;

    // Resumen
    printText('RESUMEN DE COTIZACIÓN Y MÉTRICAS', 12, true, '#0f172a');
    y += 2;
    const m = state.results.metrics;
    const q = state.lastQuote;
    const moneda = q ? q.moneda : dom.selectMoneda.value;

    doc.setFillColor(241, 245, 249);
    doc.rect(MARGIN, y, CONTENT_W, 38, 'F');
    doc.setDrawColor(203, 213, 225);
    doc.rect(MARGIN, y, CONTENT_W, 38, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor('#0f172a');
    doc.text(`Presupuesto Venta Comercial: ${q ? formatPrice(q.total, moneda) : '-'}`, MARGIN + 5, y + 8);
    doc.text(`Planchas nuevas: ${m.newSheetsCount ?? m.sheetsCount}${m.remnantsUsed ? ` + ${m.remnantsUsed} retazo(s)` : ''}`, MARGIN + 5, y + 15);
    doc.text(`Eficiencia Global: ${m.globalEfficiency}%`, MARGIN + 5, y + 22);
    doc.text(`Costo base (sin margen): ${q ? formatPrice(q.base, moneda) : '-'}`, MARGIN + 5, y + 29);
    const col2 = MARGIN + CONTENT_W / 2 + 5;
    doc.text(`Corte de Sierra Total: ${m.totalCutsLength} m (${m.totalCutsCount} cortes)`, col2, y + 8);
    doc.text(`Tapacanto Delgado (D): ${m.cantoDelgado} m`, col2, y + 15);
    doc.text(`Tapacanto Grueso (G): ${m.cantoGrueso} m`, col2, y + 22);
    doc.text(`Surcos/Ranuras Total: ${m.totalGroovesLength} m`, col2, y + 29);
    y += 45;
    if (m.totalGroovesLength > 0) {
        printText(grooveSpecText(), 9, false, '#334155');
        y += 2;
    }

    // Detalle de piezas
    printText('DETALLE DE PIEZAS A CORTAR', 12, true, '#0f172a');
    y += 2;
    const col = {
        num: MARGIN + 2, name: MARGIN + 8, material: MARGIN + 60, largo: MARGIN + 95,
        ancho: MARGIN + 113, cant: MARGIN + 131, tapacantos: MARGIN + 141
    };
    const colW = { name: 48, material: 32, tapacantos: 36 };

    doc.setFillColor(15, 23, 42);
    doc.rect(MARGIN, y, CONTENT_W, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor('#ffffff');
    doc.text('#', col.num, y + 5);
    doc.text('Nombre', col.name, y + 5);
    doc.text('Material/Espesor', col.material, y + 5);
    doc.text('Largo', col.largo, y + 5);
    doc.text('Ancho', col.ancho, y + 5);
    doc.text('Cant', col.cant, y + 5);
    doc.text('Tapacantos', col.tapacantos, y + 5);
    y += 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor('#0f172a');

    dom.partsTbody.querySelectorAll('.part-row').forEach((row, idx) => {
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
            doc.rect(MARGIN, y, CONTENT_W, 6, 'F');
        }
        doc.text(`${idx + 1}`, col.num, y + 4.5);
        doc.text(truncateText(data.name || `Pieza ${idx + 1}`, colW.name), col.name, y + 4.5);
        doc.text(truncateText(data.material, colW.material), col.material, y + 4.5);
        doc.text(`${data.largo} mm`, col.largo, y + 4.5);
        doc.text(`${data.ancho} mm`, col.ancho, y + 4.5);
        doc.text(`${data.cant}`, col.cant, y + 4.5);
        doc.text(truncateText(cantosText(data.cantos), colW.tapacantos), col.tapacantos, y + 4.5);
        y += 6;
    });

    // Un plano por plancha (JPEG: el PDF pesa mucho menos que con PNG)
    for (const matName in state.results.groups) {
        const group = state.results.groups[matName];
        group.sheets.forEach((sheet, idx) => {
            doc.addPage();
            y = 20;
            printText(`PLANO DE CORTE - ${matName.toUpperCase()}`, 14, true, '#f97316');
            printText(`${sheetTitle(sheet, idx)} — ${idx + 1} de ${group.sheets.length} (Eficiencia: ${sheet.efficiency.toFixed(1)}%)`, 10, true, '#0f172a');
            y += 4;

            state.canvas.setSheet(sheet);
            const imgUrl = state.canvas.getHighResDataURL(2400, 'image/jpeg', 0.85);
            if (imgUrl) {
                const imgHeight = CONTENT_W * (sheet.h / sheet.w);
                try {
                    doc.addImage(imgUrl, 'JPEG', MARGIN, y, CONTENT_W, imgHeight);
                    y += imgHeight + 10;
                } catch (e) {
                    y += 10;
                }
            }
            if (y > 200) {
                doc.addPage();
                y = 20;
            }

            printText('Secuencia de Cortes Sugerida:', 10, true, '#0f172a');
            y += 2;
            if (sheet.sequenceStale || !sheet.cuts || sheet.cuts.length === 0) {
                printText(sheet.sequenceStale
                    ? 'Secuencia desactualizada. Reoptimice antes de cortar.'
                    : 'No se requieren cortes para esta plancha.', 8, false, '#334155');
            } else {
                sheet.cuts.forEach((cut, cIdx) => {
                    if (y > 270) {
                        doc.addPage();
                        y = 20;
                    }
                    printText(`${cIdx + 1}. [${cutKindLabel(cut)}] ${cut.desc}`, 8, false, '#334155');
                });
            }
        });
    }

    // Etiquetas 50 × 30 mm
    const labels = collectLabels();
    if (labels.length) {
        doc.addPage('a4', 'portrait');
        y = 18;
        printText('ETIQUETAS DE PIEZAS (50 × 30 mm)', 14, true, '#0f172a');
        y += 4;
        const lw = 50;
        const lh = 30;
        const gap = 4;
        let x = MARGIN;
        labels.forEach((lab) => {
            if (x + lw > PAGE_W - MARGIN) {
                x = MARGIN;
                y += lh + gap;
            }
            if (y + lh > 287) {
                doc.addPage();
                y = 15;
                x = MARGIN;
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

    const active = currentSheet();
    if (active) state.canvas.setSheet(active);
    doc.save('reporte_de_corte_melaminacut.pdf');
}

export function initExportPdf() {
    dom.btnDownloadPdf.addEventListener('click', exportPdf);
}
