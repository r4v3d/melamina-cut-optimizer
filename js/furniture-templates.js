// Plantillas paramétricas de muebles: medidas del mueble → despiece (sin DOM, se prueba en Node).
// Convención: "largo" es el lado en el sentido de la veta; cantos [L1, L2, A1, A2] con L1 = canto frontal.
// Canto: 0 ninguno, 1 delgado, 2 grueso.

const GAP = 3;          // luz entre puertas / frentes (mm)
const FONDO_HOLGURA = 4; // el fondo se clava 2 mm adentro de cada borde

const FRONT = [1, 0, 0, 0];   // solo canto frontal delgado
const ALL_THICK = [2, 2, 2, 2]; // puertas y frentes: grueso en los 4 lados
const NONE = [0, 0, 0, 0];

function hingesPerDoor(alto) {
    if (alto <= 900) return 2;
    if (alto <= 1600) return 3;
    return 4;
}

function piece(name, largo, ancho, cant, cantos, { veta = true, material } = {}) {
    return { name, largo: Math.round(largo * 10) / 10, ancho: Math.round(ancho * 10) / 10, cant, veta, cantos: [...cantos], grooves: [0, 0, 0, 0], material };
}

// Puertas que cubren el frente completo, repartidas en "n" hojas
function doors(ancho, alto, n, material) {
    if (n <= 0) return [];
    const doorW = (ancho - GAP * (n - 1) - 4) / n;
    return [piece(n === 1 ? 'Puerta' : 'Puerta', alto - 4, doorW, n, ALL_THICK, { material })];
}

function fondo(ancho, alto, materialFondo) {
    return piece('Fondo', alto - FONDO_HOLGURA, ancho - FONDO_HOLGURA, 1, NONE, { veta: false, material: materialFondo });
}

export const FURNITURE_TEMPLATES = [
    {
        id: 'bajo-cocina',
        name: 'Módulo bajo de cocina',
        params: [
            { key: 'ancho', label: 'Ancho (mm)', value: 800, min: 200 },
            { key: 'alto', label: 'Alto sin zócalo (mm)', value: 720, min: 200 },
            { key: 'profundidad', label: 'Profundidad (mm)', value: 560, min: 150 },
            { key: 'puertas', label: 'Puertas', value: 2, min: 0, max: 4 },
            { key: 'repisas', label: 'Repisas', value: 1, min: 0, max: 6 }
        ],
        build: (p, e, mat, matFondo) => {
            const interior = p.ancho - 2 * e;
            return {
                parts: [
                    piece('Lateral', p.alto, p.profundidad, 2, FRONT, { material: mat }),
                    piece('Base', interior, p.profundidad, 1, FRONT, { material: mat }),
                    piece('Amarre superior', interior, 100, 2, FRONT, { material: mat }),
                    ...(p.repisas > 0 ? [piece('Repisa', interior - 2, p.profundidad - 40, p.repisas, FRONT, { material: mat })] : []),
                    fondo(p.ancho, p.alto, matFondo),
                    ...doors(p.ancho, p.alto, p.puertas, mat)
                ],
                herrajes: [
                    { name: 'Bisagras', cant: p.puertas * hingesPerDoor(p.alto) },
                    { name: 'Jaladores', cant: p.puertas },
                    { name: 'Patas regulables', cant: 4 }
                ]
            };
        }
    },
    {
        id: 'alto-cocina',
        name: 'Módulo alto de cocina',
        params: [
            { key: 'ancho', label: 'Ancho (mm)', value: 800, min: 200 },
            { key: 'alto', label: 'Alto (mm)', value: 700, min: 200 },
            { key: 'profundidad', label: 'Profundidad (mm)', value: 300, min: 150 },
            { key: 'puertas', label: 'Puertas', value: 2, min: 0, max: 4 },
            { key: 'repisas', label: 'Repisas', value: 2, min: 0, max: 6 }
        ],
        build: (p, e, mat, matFondo) => {
            const interior = p.ancho - 2 * e;
            return {
                parts: [
                    piece('Lateral', p.alto, p.profundidad, 2, FRONT, { material: mat }),
                    piece('Techo y base', interior, p.profundidad, 2, FRONT, { material: mat }),
                    ...(p.repisas > 0 ? [piece('Repisa', interior - 2, p.profundidad - 20, p.repisas, FRONT, { material: mat })] : []),
                    fondo(p.ancho, p.alto, matFondo),
                    ...doors(p.ancho, p.alto, p.puertas, mat)
                ],
                herrajes: [
                    { name: 'Bisagras', cant: p.puertas * hingesPerDoor(p.alto) },
                    { name: 'Jaladores', cant: p.puertas },
                    { name: 'Colgadores de pared', cant: 2 }
                ]
            };
        }
    },
    {
        id: 'ropero',
        name: 'Ropero',
        params: [
            { key: 'ancho', label: 'Ancho (mm)', value: 1000, min: 400 },
            { key: 'alto', label: 'Alto (mm)', value: 1800, min: 600 },
            { key: 'profundidad', label: 'Profundidad (mm)', value: 550, min: 300 },
            { key: 'puertas', label: 'Puertas', value: 2, min: 0, max: 4 },
            { key: 'repisas', label: 'Repisas', value: 3, min: 0, max: 10 }
        ],
        build: (p, e, mat, matFondo) => {
            const interior = p.ancho - 2 * e;
            const zocalo = 80;
            return {
                parts: [
                    piece('Costado', p.alto, p.profundidad, 2, FRONT, { material: mat }),
                    piece('Techo y piso', interior, p.profundidad, 2, FRONT, { material: mat }),
                    piece('Zócalo', interior, zocalo, 1, FRONT, { material: mat }),
                    ...(p.repisas > 0 ? [piece('Repisa', interior - 2, p.profundidad - 40, p.repisas, FRONT, { material: mat })] : []),
                    fondo(p.ancho, p.alto, matFondo),
                    ...doors(p.ancho, p.alto - zocalo, p.puertas, mat)
                ],
                herrajes: [
                    { name: 'Bisagras', cant: p.puertas * hingesPerDoor(p.alto - zocalo) },
                    { name: 'Jaladores', cant: p.puertas },
                    { name: `Tubo colgador de ${Math.round(interior)} mm`, cant: 1 }
                ]
            };
        }
    },
    {
        id: 'cajonera',
        name: 'Cajonera',
        params: [
            { key: 'ancho', label: 'Ancho (mm)', value: 450, min: 250 },
            { key: 'alto', label: 'Alto (mm)', value: 700, min: 250 },
            { key: 'profundidad', label: 'Profundidad (mm)', value: 500, min: 300 },
            { key: 'cajones', label: 'Cajones', value: 4, min: 1, max: 8 }
        ],
        build: (p, e, mat, matFondo) => {
            const interior = p.ancho - 2 * e;
            const n = p.cajones;
            const frenteAlto = (p.alto - GAP * (n - 1) - 4) / n;
            const cajonAlto = Math.max(60, frenteAlto - 40);
            const correderaHolgura = 26; // 13 mm por lado
            const cajonAncho = interior - correderaHolgura;
            const cajonProf = p.profundidad - 50;
            return {
                parts: [
                    piece('Lateral', p.alto, p.profundidad, 2, FRONT, { material: mat }),
                    piece('Techo y base', interior, p.profundidad, 2, FRONT, { material: mat }),
                    piece('Frente de cajón', p.ancho - 4, frenteAlto, n, ALL_THICK, { material: mat }),
                    piece('Lateral de cajón', cajonProf, cajonAlto, 2 * n, FRONT, { veta: false, material: mat }),
                    piece('Frente/fondo interno de cajón', cajonAncho - 2 * e, cajonAlto, 2 * n, FRONT, { veta: false, material: mat }),
                    piece('Piso de cajón', cajonProf, cajonAncho, n, NONE, { veta: false, material: matFondo }),
                    fondo(p.ancho, p.alto, matFondo)
                ],
                herrajes: [
                    { name: `Correderas de ${Math.round(cajonProf / 50) * 50} mm (pares)`, cant: n },
                    { name: 'Jaladores', cant: n }
                ]
            };
        }
    },
    {
        id: 'repisero',
        name: 'Repisero abierto',
        params: [
            { key: 'ancho', label: 'Ancho (mm)', value: 800, min: 200 },
            { key: 'alto', label: 'Alto (mm)', value: 1800, min: 300 },
            { key: 'profundidad', label: 'Profundidad (mm)', value: 300, min: 150 },
            { key: 'repisas', label: 'Repisas', value: 4, min: 0, max: 12 }
        ],
        build: (p, e, mat, matFondo) => {
            const interior = p.ancho - 2 * e;
            return {
                parts: [
                    piece('Lateral', p.alto, p.profundidad, 2, FRONT, { material: mat }),
                    piece('Techo y base', interior, p.profundidad, 2, FRONT, { material: mat }),
                    ...(p.repisas > 0 ? [piece('Repisa', interior, p.profundidad, p.repisas, FRONT, { material: mat })] : []),
                    fondo(p.ancho, p.alto, matFondo)
                ],
                herrajes: [
                    { name: 'Soportes de repisa', cant: p.repisas * 4 },
                    { name: 'Colgadores de pared', cant: 2 }
                ]
            };
        }
    }
];

/**
 * Genera el despiece de una plantilla.
 * options: { espesor = 18, material, materialFondo = 'MDF Fondo 3mm', prefix = nombre de la plantilla }
 * Devuelve { parts, herrajes, errors }.
 */
export function buildFurniture(templateId, values = {}, options = {}) {
    const tpl = FURNITURE_TEMPLATES.find(t => t.id === templateId);
    if (!tpl) return { parts: [], herrajes: [], errors: ['Plantilla desconocida'] };

    const errors = [];
    const p = {};
    for (const def of tpl.params) {
        const n = Number(values[def.key] ?? def.value);
        if (!Number.isFinite(n) || n < def.min || (def.max !== undefined && n > def.max)) {
            errors.push(`${def.label}: debe estar entre ${def.min} y ${def.max ?? '∞'}`);
            p[def.key] = def.value;
        } else {
            p[def.key] = def.key === 'puertas' || def.key === 'repisas' || def.key === 'cajones' ? Math.round(n) : n;
        }
    }
    if (errors.length) return { parts: [], herrajes: [], errors };

    const e = Number(options.espesor) > 0 ? Number(options.espesor) : 18;
    const built = tpl.build(p, e, options.material, options.materialFondo || 'MDF Fondo 3mm');
    const prefix = options.prefix ?? tpl.name;
    const parts = built.parts
        .filter(pt => pt.cant > 0 && pt.largo > 0 && pt.ancho > 0)
        .map(pt => ({ ...pt, name: prefix ? `${pt.name} · ${prefix}` : pt.name }));
    const herrajes = built.herrajes.filter(h => h.cant > 0);
    return { parts, herrajes, errors: [] };
}
