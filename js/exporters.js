// Exportadores de archivos (sin DOM, se prueban en Node): lista de corte CSV y plano DXF

const EDGE = ['L1', 'L2', 'A1', 'A2'];

// Número con coma decimal (Excel en español)
const dec = n => String(Math.round(n * 10) / 10).replace('.', ',');

function csvCell(value) {
    const s = String(value ?? '');
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Lista de corte de todas las piezas colocadas, separada por ";" y con BOM para que Excel respete acentos.
 */
export function cutListCsv(results) {
    const header = ['Material', 'Plancha', '#', 'Pieza', 'Corte largo (mm)', 'Corte ancho (mm)',
        'Largo nominal', 'Ancho nominal', 'Girada', 'Cantos', 'Surcos', 'X (mm)', 'Y (mm)', 'Nota'];
    const rows = [header];
    for (const matName in results.groups) {
        const group = results.groups[matName];
        group.sheets.forEach((sheet, i) => {
            const sheetLabel = sheet.isRemnant ? `Retazo ${sheet.w}x${sheet.h}` : `Plancha ${i + 1}`;
            for (const p of sheet.placedParts) {
                const cantos = (p.cantos || []).map((c, k) => (c ? EDGE[k] + (c === 2 ? 'G' : 'D') : null)).filter(Boolean).join(' ');
                const surcos = (p.grooves || []).map((g, k) => (g ? EDGE[k] : null)).filter(Boolean).join(' ');
                rows.push([
                    matName, sheetLabel, p.originalIndex !== undefined ? p.originalIndex + 1 : '', p.name,
                    dec(p.largo), dec(p.ancho),
                    p.largoNominal, p.anchoNominal, p.rotated ? 'Sí' : 'No',
                    cantos || '-', surcos || '-', dec(p.x), dec(p.y), p.nota || ''
                ]);
            }
        });
    }
    return '\uFEFF' + rows.map(r => r.map(csvCell).join(';')).join('\r\n') + '\r\n';
}

/**
 * Plano DXF (R12, milímetros) de una plancha: contorno, área útil, piezas, cortes y textos.
 * El eje Y del DXF va hacia arriba, así que se invierte respecto al mapa.
 */
export function sheetDxf(sheet, title = '') {
    const out = [];
    const fy = y => sheet.h - y;
    const line = (layer, x1, y1, x2, y2) => {
        out.push('0', 'LINE', '8', layer, '10', x1, '20', fy(y1), '30', 0, '11', x2, '21', fy(y2), '31', 0);
    };
    const rect = (layer, x, y, w, h) => {
        line(layer, x, y, x + w, y);
        line(layer, x + w, y, x + w, y + h);
        line(layer, x + w, y + h, x, y + h);
        line(layer, x, y + h, x, y);
    };
    const text = (layer, x, y, height, value) => {
        const clean = String(value).replace(/[\r\n]+/g, ' ');
        out.push('0', 'TEXT', '8', layer, '10', x, '20', fy(y), '30', 0, '40', height, '1', clean);
    };

    rect('PLANCHA', 0, 0, sheet.w, sheet.h);
    if (sheet.refilado > 0) rect('REFILADO', sheet.refilado, sheet.refilado, sheet.usableW, sheet.usableH);
    for (const p of sheet.placedParts) {
        rect('PIEZAS', p.x, p.y, p.w, p.h);
        const h = Math.max(8, Math.min(40, Math.min(p.w, p.h) * 0.12));
        const num = p.originalIndex !== undefined ? `#${p.originalIndex + 1} ` : '';
        text('TEXTO', p.x + h * 0.5, p.y + h * 1.5, h, `${num}${p.name}`);
        text('TEXTO', p.x + h * 0.5, p.y + h * 3, h * 0.8, `${Math.round(p.w * 10) / 10} x ${Math.round(p.h * 10) / 10}`);
    }
    for (const c of sheet.cuts || []) {
        line(c.kind === 'refilado' ? 'REFILADO' : 'CORTES', c.x1, c.y1, c.x2, c.y2);
    }
    if (title) text('TEXTO', 0, -30, 25, title);

    return ['0', 'SECTION', '2', 'ENTITIES', ...out, '0', 'ENDSEC', '0', 'EOF'].join('\n') + '\n';
}
