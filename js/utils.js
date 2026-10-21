// Utilidades compartidas - MelaminaCut

export function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Convierte un color HEX a RGBA
export function hexToRgba(hex, alpha) {
    if (!hex) return `rgba(6, 182, 212, ${alpha})`;
    hex = hex.replace('#', '');
    if (hex.length === 3) {
        hex = hex.split('').map(char => char + char).join('');
    }
    const r = parseInt(hex.substring(0, 2), 16) || 6;
    const g = parseInt(hex.substring(2, 4), 16) || 182;
    const b = parseInt(hex.substring(4, 6), 16) || 212;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Número del input o valor por defecto (respeta el 0; vacío / inválido → defecto)
export function num(value, def) {
    if (value === '' || value === null || value === undefined) return def;
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : def;
}

// Mezcla valores guardados sobre los defectos, ignorando vacíos
export function withDefaults(defaults, saved) {
    const out = { ...defaults };
    for (const key in (saved || {})) {
        const v = saved[key];
        if (v !== '' && v !== null && v !== undefined) out[key] = v;
    }
    return out;
}

export const EDGE_LABELS = ['L1', 'L2', 'A1', 'A2'];

// "L1(D),A2(G)" o "-" a partir del arreglo de cantos [L1, L2, A1, A2]
export function cantosText(cantos, withParens = true) {
    const parts = [];
    (cantos || []).forEach((c, i) => {
        if (c === 1) parts.push(withParens ? `${EDGE_LABELS[i]}(D)` : `${EDGE_LABELS[i]}D`);
        if (c === 2) parts.push(withParens ? `${EDGE_LABELS[i]}(G)` : `${EDGE_LABELS[i]}G`);
    });
    return parts.length ? parts.join(',') : '-';
}

// "L1,A2" o "-" a partir del arreglo de surcos [L1, L2, A1, A2]
export function groovesText(grooves) {
    const parts = [];
    (grooves || []).forEach((g, i) => {
        if (g === 1) parts.push(EDGE_LABELS[i]);
    });
    return parts.length ? parts.join(',') : '-';
}
