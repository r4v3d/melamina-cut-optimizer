// Parser de piezas pegadas desde Excel / CSV (sin DOM, se prueba en Node)
// Columnas: Largo, Ancho, Cant, Nombre, Material, Veta (si/no), Cantos (código L1L2A1A2, ej. "D0G0" o "1020")

const VETA_YES = /^(s|si|sí|x|1|true|y|yes)$/i;

function splitLine(line) {
    if (line.includes('\t')) return { sep: '\t', vals: line.split('\t') };
    if (line.includes(';')) return { sep: ';', vals: line.split(';') };
    return { sep: ',', vals: line.split(',') };
}

// Con separador tab o ";" se acepta coma decimal (500,5)
function parseNumber(value, sep) {
    const v = sep === ',' ? value : value.replace(',', '.');
    return parseFloat(v);
}

// "D0G0" / "1020" / "d-g-" → [1, 0, 2, 0]
function parseCantos(code) {
    const c = (code || '').trim().toUpperCase();
    if (c.length !== 4) return null;
    return c.split('').map(ch => (ch === 'D' || ch === '1') ? 1 : (ch === 'G' || ch === '2') ? 2 : 0);
}

export function parseImportText(text, fallbackMaterial) {
    const parts = [];
    text.split(/\r?\n/).forEach(line => {
        if (!line.trim()) return;
        const { sep, vals: rawVals } = splitLine(line);
        const vals = rawVals.map(v => v.trim());

        const largo = parseNumber(vals[0] || '', sep);
        const ancho = parseNumber(vals[1] || '', sep);

        if (Number.isFinite(largo) && Number.isFinite(ancho)) {
            const cant = parseInt(vals[2], 10);
            const part = {
                largo,
                ancho,
                cant: Number.isFinite(cant) && cant > 0 ? cant : 1,
                name: vals[3] || 'Pieza Importada',
                material: vals[4] || fallbackMaterial,
                veta: VETA_YES.test(vals[5] || ''),
                cantos: parseCantos(vals[6]) || [0, 0, 0, 0],
                grooves: [0, 0, 0, 0]
            };
            if (!Number.isFinite(cant) && vals[2]) part.name = vals[2]; // formato Largo, Ancho, Nombre
            if (largo > 0 && ancho > 0) parts.push(part);
            return;
        }

        // Formato libre: tomar los primeros números como medidas (las filas de encabezado no tienen números)
        const nonEmpty = vals.filter(v => v !== '');
        const numbers = nonEmpty.map(v => parseNumber(v, sep)).filter(n => Number.isFinite(n));
        if (numbers.length >= 2 && numbers[0] > 0 && numbers[1] > 0) {
            const nameVal = nonEmpty.find(v => !Number.isFinite(parseNumber(v, sep)));
            parts.push({
                largo: numbers[0],
                ancho: numbers[1],
                cant: numbers.length >= 3 && numbers[2] > 0 ? Math.round(numbers[2]) : 1,
                name: nameVal || 'Pieza Importada',
                material: fallbackMaterial,
                veta: false,
                cantos: [0, 0, 0, 0],
                grooves: [0, 0, 0, 0]
            });
        }
    });
    return parts;
}
