// Cotización profesional para el cliente: perfil del taller, PDF con logo y envío por WhatsApp

import { dom } from './dom.js';
import { state } from './state.js';
import { escapeHtml, num } from '../utils.js';
import { formatPrice } from './currency.js';
import { openModal, downloadFile, safeFileName } from './modal.js';
import { tallerStore } from './store.js';
import { currentQuote } from './results.js';
import { toast } from './ui-feedback.js';
import { isPro } from './plan.js';
import { isNativeApp, shareNativeFile, openExternal } from './native.js';

const LOGO_MAX_PX = 400;

// ===== Perfil del taller =====

// Reduce el logo a un tamaño razonable para localStorage y el PDF
function loadLogo(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => {
            const img = new Image();
            img.onerror = reject;
            img.onload = () => {
                const scale = Math.min(1, LOGO_MAX_PX / Math.max(img.width, img.height));
                const c = document.createElement('canvas');
                c.width = Math.round(img.width * scale);
                c.height = Math.round(img.height * scale);
                c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                resolve({ logo: c.toDataURL('image/png'), logoW: c.width, logoH: c.height });
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    });
}

export function openTallerProfile() {
    const t = tallerStore.get();
    let logo = { logo: t.logo, logoW: t.logoW, logoH: t.logoH };
    const body = document.createElement('div');
    body.innerHTML = `
        <p class="modal-help">Estos datos aparecen en las cotizaciones que envías a tus clientes.</p>
        <div class="form-row">
            <div class="form-group col-6"><label for="tp-nombre">Nombre del taller</label><input id="tp-nombre" class="form-input" value="${escapeHtml(t.nombre)}"></div>
            <div class="form-group col-6"><label for="tp-doc">RUC / NIT / RUT</label><input id="tp-doc" class="form-input" value="${escapeHtml(t.documento)}"></div>
        </div>
        <div class="form-row">
            <div class="form-group col-6"><label for="tp-tel">Teléfono</label><input id="tp-tel" class="form-input" value="${escapeHtml(t.telefono)}"></div>
            <div class="form-group col-6"><label for="tp-email">Correo</label><input id="tp-email" type="email" class="form-input" value="${escapeHtml(t.email)}"></div>
        </div>
        <div class="form-group"><label for="tp-dir">Dirección</label><input id="tp-dir" class="form-input" value="${escapeHtml(t.direccion)}"></div>
        <div class="form-row">
            <div class="form-group col-6"><label for="tp-validez">Validez de la cotización (días)</label><input id="tp-validez" type="number" min="1" class="form-input" value="${escapeHtml(t.validezDias)}"></div>
            <div class="form-group col-6"><label>Logo (PNG/JPG) <span class="pro-tag">PRO</span></label>
                <div class="logo-row">
                    <img class="logo-preview" alt="Logo del taller" ${logo.logo ? `src="${logo.logo}"` : 'hidden'}>
                    <label class="btn btn-secondary btn-sm import-file-label">Subir logo<input type="file" accept="image/png,image/jpeg" hidden id="tp-logo"></label>
                    <button type="button" class="btn btn-secondary btn-sm" id="tp-logo-remove">Quitar</button>
                </div>
            </div>
        </div>
        <div class="form-group"><label for="tp-cond">Condiciones y notas</label><textarea id="tp-cond" class="form-input" rows="3">${escapeHtml(t.condiciones)}</textarea></div>
    `;
    const $ = sel => body.querySelector(sel);
    const preview = $('.logo-preview');
    $('#tp-logo').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            logo = await loadLogo(file);
            preview.src = logo.logo;
            preview.hidden = false;
        } catch (err) {
            toast('No se pudo leer la imagen.', { type: 'error' });
        }
    });
    $('#tp-logo-remove').addEventListener('click', () => {
        logo = { logo: '', logoW: 0, logoH: 0 };
        preview.hidden = true;
    });

    openModal({
        title: 'Mi taller',
        body,
        wide: true,
        actions: [
            { label: 'Cancelar' },
            {
                label: 'Guardar',
                variant: 'primary',
                onClick: () => {
                    const ok = tallerStore.save({
                        nombre: $('#tp-nombre').value.trim(),
                        documento: $('#tp-doc').value.trim(),
                        telefono: $('#tp-tel').value.trim(),
                        email: $('#tp-email').value.trim(),
                        direccion: $('#tp-dir').value.trim(),
                        validezDias: Math.max(1, Math.round(num($('#tp-validez').value, 15))),
                        condiciones: $('#tp-cond').value.trim(),
                        ...logo
                    });
                    if (!ok) {
                        toast('No se pudo guardar (el logo es muy pesado). Pruebe con una imagen más chica.', { type: 'error' });
                        return false;
                    }
                    toast('Datos del taller guardados.', { type: 'success' });
                    return true;
                }
            }
        ]
    });
}

// ===== Cotización en PDF =====

function canQuote() {
    if (!state.results) {
        toast('Optimice primero para cotizar.', { type: 'warn' });
        return false;
    }
    if (dom.resultsStaleBanner && !dom.resultsStaleBanner.hidden) {
        toast('Los resultados están desactualizados. Reoptimice antes de cotizar.', { type: 'warn' });
        return false;
    }
    if (!(window.jspdf && window.jspdf.jsPDF)) {
        toast('La librería PDF no se cargó correctamente.', { type: 'error' });
        return false;
    }
    return true;
}

function fmtQty(line) {
    return line.unit === 'm' ? (Math.round(line.qty * 10) / 10).toFixed(1) : String(line.qty);
}

function taxLabel(moneda, pct) {
    return `${moneda === 'PEN' ? 'IGV' : 'IVA'} (${pct}%)`;
}

// Genera el PDF; devuelve { doc, filename, summaryText }
function buildQuotePdf() {
    const { jsPDF } = window.jspdf;
    const q = currentQuote();
    const t = tallerStore.get();
    const number = String(tallerStore.nextQuoteNumber()).padStart(6, '0');
    const today = new Date();
    const validUntil = new Date(today.getTime() + (t.validezDias || 15) * 86400000);
    const proyecto = dom.inputProjectName.value.trim();
    const cliente = dom.inputClientName.value.trim();
    const telefono = dom.inputClientPhone.value.trim();
    const money = n => formatPrice(n, q.moneda);

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const M = 15;
    const W = 210 - 2 * M;
    const RIGHT = 210 - M;
    let y = 15;

    const pro = isPro();
    // Plan gratis: marca de agua diagonal y pie de página; Pro: logo y sin marca
    const footer = () => {
        if (!pro) {
            doc.saveGraphicsState();
            doc.setGState(new doc.GState({ opacity: 0.07 }));
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(46);
            doc.setTextColor('#0f172a');
            doc.text('MelaminaCut · versión gratuita', 105, 170, { align: 'center', angle: 35 });
            doc.restoreGraphicsState();
        }
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor('#94a3b8');
        doc.text(pro ? 'Cotización generada con MelaminaCut' : 'Cotización generada con la versión gratuita de MelaminaCut', 105, 290, { align: 'center' });
    };

    // Encabezado: logo (Pro) y datos del taller
    let logoH = 0;
    if (pro && t.logo && t.logoW && t.logoH) {
        const maxW = 45;
        const maxH = 24;
        const scale = Math.min(maxW / t.logoW, maxH / t.logoH);
        const w = t.logoW * scale;
        logoH = t.logoH * scale;
        try {
            doc.addImage(t.logo, t.logo.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG', M, y, w, logoH);
        } catch (e) {
            logoH = 0;
        }
    }
    doc.setTextColor('#0f172a');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(t.nombre || 'Mi taller', RIGHT, y + 5, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor('#475569');
    let infoY = y + 10;
    [t.documento, t.telefono, t.email, t.direccion].filter(Boolean).forEach(line => {
        doc.text(line, RIGHT, infoY, { align: 'right' });
        infoY += 4;
    });
    y = Math.max(y + logoH, infoY) + 6;

    // Título, número y fechas
    doc.setDrawColor(249, 115, 22);
    doc.setLineWidth(0.6);
    doc.line(M, y, RIGHT, y);
    y += 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(17);
    doc.setTextColor('#f97316');
    doc.text('COTIZACIÓN', M, y);
    doc.setFontSize(11);
    doc.setTextColor('#0f172a');
    doc.text(`N° ${number}`, RIGHT, y, { align: 'right' });
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor('#475569');
    doc.text(`Fecha: ${today.toLocaleDateString()}`, M, y);
    doc.text(`Válida hasta: ${validUntil.toLocaleDateString()}`, RIGHT, y, { align: 'right' });
    y += 7;

    // Cliente
    doc.setFillColor(241, 245, 249);
    doc.rect(M, y, W, 18, 'F');
    doc.setTextColor('#0f172a');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text('Cliente:', M + 4, y + 6);
    doc.text('Proyecto:', M + 4, y + 13);
    doc.setFont('helvetica', 'normal');
    doc.text(cliente || '-', M + 24, y + 6);
    doc.text(proyecto || '-', M + 24, y + 13);
    if (telefono) {
        doc.setFont('helvetica', 'bold');
        doc.text('Teléfono:', M + W / 2 + 10, y + 6);
        doc.setFont('helvetica', 'normal');
        doc.text(telefono, M + W / 2 + 30, y + 6);
    }
    y += 26;

    // Tabla de ítems
    const col = { n: M + 2, desc: M + 10, qty: M + 120, und: M + 124, pu: M + 157, amt: RIGHT - 2 };
    const header = () => {
        doc.setFillColor(15, 23, 42);
        doc.rect(M, y, W, 8, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor('#ffffff');
        doc.text('#', col.n, y + 5.3);
        doc.text('Descripción', col.desc, y + 5.3);
        doc.text('Cant.', col.qty, y + 5.3, { align: 'right' });
        doc.text('Und', col.und, y + 5.3);
        doc.text('P. unit.', col.pu, y + 5.3, { align: 'right' });
        doc.text('Importe', col.amt, y + 5.3, { align: 'right' });
        y += 8;
    };
    header();
    doc.setFont('helvetica', 'normal');
    q.lines.forEach((line, i) => {
        if (y > 262) {
            footer();
            doc.addPage();
            y = 20;
            header();
        }
        if (i % 2 === 1) {
            doc.setFillColor(248, 250, 252);
            doc.rect(M, y, W, 7, 'F');
        }
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor('#0f172a');
        const desc = doc.splitTextToSize(line.desc, col.qty - col.desc - 14)[0];
        doc.text(String(i + 1), col.n, y + 4.8);
        doc.text(desc, col.desc, y + 4.8);
        doc.text(fmtQty(line), col.qty, y + 4.8, { align: 'right' });
        doc.text(line.unit, col.und, y + 4.8);
        doc.text(money(line.unitPrice), col.pu, y + 4.8, { align: 'right' });
        doc.text(money(line.amount), col.amt, y + 4.8, { align: 'right' });
        y += 7;
    });

    // Totales
    y += 4;
    const totalRow = (label, value, bold = false, size = 9.5) => {
        doc.setFont('helvetica', bold ? 'bold' : 'normal');
        doc.setFontSize(size);
        doc.setTextColor('#0f172a');
        doc.text(label, col.pu - 20, y, { align: 'right' });
        doc.text(value, col.amt, y, { align: 'right' });
        y += size * 0.5 + 2;
    };
    totalRow('Subtotal', money(q.subtotal));
    if (q.impuestoPct > 0) totalRow(taxLabel(q.moneda, q.impuestoPct), money(q.impuestoMonto));
    doc.setDrawColor(203, 213, 225);
    doc.line(col.pu - 50, y - 3, RIGHT, y - 3);
    y += 1;
    totalRow('TOTAL', money(q.total), true, 12);

    // Detalle técnico y condiciones
    y += 6;
    const m = state.results.metrics;
    const piezas = Object.values(state.results.groups).reduce((s, g) => s + g.sheets.reduce((a, sh) => a + sh.placedParts.length, 0), 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor('#475569');
    const tecnico = `Incluye el corte de ${piezas} piezas en ${m.newSheetsCount ?? m.sheetsCount} plancha(s)` +
        `${m.remnantsUsed ? ` y ${m.remnantsUsed} retazo(s) de inventario` : ''}, ` +
        `con ${m.cantoDelgado + m.cantoGrueso > 0 ? `${Math.round((m.cantoDelgado + m.cantoGrueso) * 10) / 10} m de tapacanto` : 'sin tapacanto'}.`;
    doc.splitTextToSize(tecnico, W).forEach(l => { doc.text(l, M, y); y += 4; });
    if (t.condiciones) {
        y += 3;
        doc.setFont('helvetica', 'bold');
        doc.setTextColor('#0f172a');
        doc.text('Condiciones', M, y);
        y += 4.5;
        doc.setFont('helvetica', 'normal');
        doc.setTextColor('#475569');
        doc.splitTextToSize(t.condiciones, W).forEach(l => {
            if (y > 282) { footer(); doc.addPage(); y = 20; }
            doc.text(l, M, y);
            y += 4;
        });
    }
    footer();

    const filename = `cotizacion_${number}_${safeFileName(proyecto || cliente, 'proyecto')}.pdf`;
    const tax = q.impuestoPct > 0 ? ` (incluye ${q.moneda === 'PEN' ? 'IGV' : 'IVA'})` : '';
    const summaryText = `${cliente ? `Hola ${cliente}, ` : 'Hola, '}le envío la cotización N° ${number}` +
        `${t.nombre ? ` de ${t.nombre}` : ''}${proyecto ? ` para "${proyecto}"` : ''}: ` +
        `total ${money(q.total)}${tax}. Válida hasta ${validUntil.toLocaleDateString()}.`;
    return { doc, filename, summaryText };
}

function exportQuotePdf() {
    if (!canQuote()) return;
    const { doc, filename } = buildQuotePdf();
    downloadFile(filename, doc.output('blob'));
}

// Web Share con el PDF adjunto (celular); si no se puede, descarga el PDF y abre WhatsApp con el mensaje
async function shareQuote() {
    if (!canQuote()) return;
    const { doc, filename, summaryText } = buildQuotePdf();
    const blob = doc.output('blob');
    if (isNativeApp) {
        // App Android: menú "Compartir" con el PDF y el mensaje (WhatsApp, correo...)
        try {
            await shareNativeFile(filename, blob, { text: summaryText });
        } catch (e) {
            console.error(e);
            toast('No se pudo compartir la cotización.', { type: 'error' });
        }
        return;
    }
    const file = new File([blob], filename, { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({ files: [file], title: filename, text: summaryText });
            return;
        } catch (e) {
            if (e && e.name === 'AbortError') return; // el usuario canceló
        }
    }
    downloadFile(filename, blob);
    const phone = dom.inputClientPhone.value.replace(/\D/g, '');
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(summaryText)}`;
    openExternal(url);
    toast('Se descargó el PDF: adjúntalo en el chat de WhatsApp que se abrió.', { type: 'info', duration: 8000 });
}

export function initQuoteUi() {
    dom.btnTallerProfile.addEventListener('click', openTallerProfile);
    dom.btnQuotePdf.addEventListener('click', exportQuotePdf);
    dom.btnShareQuote.addEventListener('click', shareQuote);
}
