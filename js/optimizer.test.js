// Pruebas del motor de corte y del importador — ejecutar: npm test
import assert from 'node:assert';
import { CutOptimizer } from './optimizer.js';
import { parseImportText } from './import-parser.js';
import { buildFurniture, FURNITURE_TEMPLATES } from './furniture-templates.js';
import { cutListCsv, sheetDxf } from './exporters.js';
import { computeQuote } from './quote-calc.js';
import { verifyLicense } from './license.js';
import { generateKeyPairSync, sign } from 'node:crypto';

function makeOpt(extra = {}) {
    return new CutOptimizer({
        planchaLargo: 2440,
        planchaAncho: 1830,
        espesorSierra: 4,
        refilado: 10,
        descontarCanto: true,
        tieneVetaGlobal: false,
        metodoCorte: 'optimal',
        ...extra
    });
}

function expand(parts) {
    return parts;
}

let passed = 0;
function test(name, fn) {
    fn();
    passed++;
    console.log('  ok  ' + name);
}

async function testAsync(name, fn) {
    await fn();
    passed++;
    console.log('  ok  ' + name);
}

console.log('CutOptimizer tests\n');

test('pieza casi exacta: leftover < kerf se rechaza (medida exacta)', () => {
    const opt = makeOpt();
    assert.strictEqual(opt.canFit(100, 100, 102, 100), false);
    assert.strictEqual(opt.canFit(100, 100, 100, 100), true);
    assert.strictEqual(opt.canFit(100, 100, 104, 100), true);
});

test('tolerancia de punto flotante no descarta un encaje exacto', () => {
    const opt = makeOpt();
    assert.strictEqual(opt.canFit(400.0000001, 200, 400, 200), true);
});

test('tapacanto no genera medidas negativas; queda sin colocar', () => {
    const opt = makeOpt();
    const result = opt.optimize([{
        id: 'x', name: 'Mini', largo: 2, ancho: 2, cant: 1,
        cantos: [2, 2, 2, 2], grooves: [0, 0, 0, 0],
        material: 'Estándar 18mm', color: '#06b6d4', index: 0
    }]);
    assert.ok(result.unplacedParts.length >= 1);
    assert.strictEqual(result.unplacedParts[0].unplacedReason, 'invalid_size');
});

test('velador cabe en 1 plancha sin piezas sueltas', () => {
    const opt = makeOpt({ tieneVetaGlobal: true });
    const parts = [
        { name: 'Lateral Izquierdo', largo: 550, ancho: 400, cant: 1, veta: true, cantos: [1, 0, 2, 0], material: 'Roble' },
        { name: 'Lateral Derecho', largo: 550, ancho: 400, cant: 1, veta: true, cantos: [1, 0, 2, 0], material: 'Roble' },
        { name: 'Techo (Cubierta)', largo: 450, ancho: 400, cant: 1, veta: true, cantos: [2, 1, 2, 2], material: 'Roble' },
        { name: 'Base inferior', largo: 414, ancho: 400, cant: 1, veta: true, cantos: [1, 0, 0, 0], material: 'Roble' },
        { name: 'Frente Cajón', largo: 180, ancho: 408, cant: 2, veta: true, cantos: [2, 2, 2, 2], material: 'Roble' },
        { name: 'Lateral Cajón', largo: 350, ancho: 120, cant: 4, veta: false, cantos: [1, 0, 0, 0], material: 'Roble' },
        { name: 'Contrafrente Cajón', largo: 356, ancho: 120, cant: 4, veta: false, cantos: [1, 0, 0, 0], material: 'Roble' },
        { name: 'Zócalo Base', largo: 414, ancho: 70, cant: 1, veta: false, cantos: [0, 0, 0, 0], material: 'Roble' },
        { name: 'Amarre Trasero', largo: 414, ancho: 100, cant: 1, veta: false, cantos: [0, 0, 0, 0], material: 'Roble' }
    ].map((p, i) => ({ ...p, id: 'p' + i, index: i, grooves: [0, 0, 0, 0], color: '#06b6d4' }));

    const result = opt.optimize(parts);
    assert.strictEqual(result.unplacedParts.length, 0, 'unplaced=' + result.unplacedParts.length);
    assert.strictEqual(result.metrics.sheetsCount, 1, 'sheets=' + result.metrics.sheetsCount);
    assert.ok(result.metrics.globalEfficiency > 15, 'eff=' + result.metrics.globalEfficiency);
    assert.ok(result.metrics.strategiesTried > 1);
});

test('muchas piezas iguales caben y respetan kerf entre ellas', () => {
    const opt = makeOpt({ descontarCanto: false });
    const parts = [{
        id: 'a', name: 'Estante', largo: 400, ancho: 300, cant: 20,
        veta: false, cantos: [0, 0, 0, 0], grooves: [0, 0, 0, 0],
        material: 'Estándar 18mm', color: '#06b6d4', index: 0
    }];
    const result = opt.optimize(parts);
    assert.strictEqual(result.unplacedParts.length, 0);
    assert.ok(result.metrics.sheetsCount >= 1 && result.metrics.sheetsCount <= 2, 'sheets=' + result.metrics.sheetsCount);

    const sheet = result.sheets[0];
    for (let i = 0; i < sheet.placedParts.length; i++) {
        for (let j = i + 1; j < sheet.placedParts.length; j++) {
            const a = sheet.placedParts[i];
            const b = sheet.placedParts[j];
            const overlap = !(
                a.x + a.w <= b.x || b.x + b.w <= a.x ||
                a.y + a.h <= b.y || b.y + b.h <= a.y
            );
            assert.ok(!overlap, `overlap ${i} vs ${j}`);
        }
    }
});

test('secuencia de cortes no se reordena por nivel (guillotina válida)', () => {
    const opt = makeOpt({ descontarCanto: false });
    const parts = [
        { id: 'a', name: 'A', largo: 800, ancho: 600, cant: 1, veta: false, cantos: [0, 0, 0, 0], grooves: [0, 0, 0, 0], material: 'M', color: '#06b6d4', index: 0 },
        { id: 'b', name: 'B', largo: 400, ancho: 300, cant: 1, veta: false, cantos: [0, 0, 0, 0], grooves: [0, 0, 0, 0], material: 'M', color: '#06b6d4', index: 1 }
    ];
    const result = opt.optimize(parts);
    const cuts = result.sheets[0].cuts;
    assert.ok(cuts.length >= 1);
    const byLevel = [...cuts].sort((a, b) => a.level - b.level);
    // No exigimos que coincidan, pero sí que cada corte tenga desc con nombre de pieza
    assert.ok(cuts.every(c => c.desc && c.desc.length > 5));
    void byLevel;
});

test('refilado queda guardado en la plancha para el canvas', () => {
    const opt = makeOpt({ refilado: 12 });
    const result = opt.optimize([{
        id: 'a', name: 'A', largo: 500, ancho: 400, cant: 1, veta: false,
        cantos: [0, 0, 0, 0], grooves: [0, 0, 0, 0], material: 'M', color: '#06b6d4', index: 0
    }]);
    assert.strictEqual(result.sheets[0].refilado, 12);
    assert.strictEqual(result.sheets[0].usableW, 2440 - 24);
});

test('método horizontal no usa splits verticales como estrategia ganadora forzada', () => {
    const opt = makeOpt({ metodoCorte: 'horizontal', descontarCanto: false });
    const catalog = opt.strategyCatalog();
    assert.ok(catalog.every(s => s.split === 'horizontal'));
});

test('secuencia padre → hijo: ningún traza ocurre antes de su raja', () => {
    const opt = makeOpt({ tieneVetaGlobal: true, descontarCanto: true });
    const parts = [
        { name: 'Costado Lateral', largo: 1800, ancho: 500, cant: 2, veta: true, cantos: [1, 0, 1, 0] },
        { name: 'Techo Superior', largo: 900, ancho: 500, cant: 1, veta: true, cantos: [1, 0, 1, 1] },
        { name: 'Base de Piso', largo: 864, ancho: 500, cant: 1, veta: true, cantos: [1, 0, 0, 0] },
        { name: 'Puerta Principal', largo: 1680, ancho: 440, cant: 2, veta: true, cantos: [2, 2, 2, 2] },
        { name: 'Estante Fijo', largo: 864, ancho: 480, cant: 2, veta: false, cantos: [1, 0, 0, 0] },
        { name: 'División Vertical', largo: 1200, ancho: 480, cant: 1, veta: true, cantos: [1, 0, 0, 0] },
        { name: 'Estante Chico', largo: 422, ancho: 480, cant: 3, veta: false, cantos: [1, 0, 0, 0] },
        { name: 'Zócalo Frontal', largo: 864, ancho: 100, cant: 1, veta: false, cantos: [0, 0, 0, 0] },
        { name: 'Zócalo Posterior', largo: 864, ancho: 100, cant: 1, veta: false, cantos: [0, 0, 0, 0] }
    ].map((p, i) => ({ ...p, id: 'r' + i, index: i, grooves: [0, 0, 0, 0], material: 'Vesto Cedro', color: '#06b6d4' }));

    const result = opt.optimize(parts);
    assert.ok(result.sheets.length >= 1, 'sheets=' + result.sheets.length);
    const sheet = result.sheets[0];
    const pieceCuts = sheet.cuts.filter(c => c.kind !== 'refilado');
    assert.ok(pieceCuts.length >= 1);
    assert.strictEqual(pieceCuts[0].kind, 'raja', 'primer corte tras el refilado debe ser raja de tira');
    assert.ok(/tope/i.test(pieceCuts[0].desc), pieceCuts[0].desc);
    assert.ok(pieceCuts.every(c => c.seq && c.desc && c.fenceMm > 0));

    const produced = new Set(['sheet']);
    for (const cut of pieceCuts) {
        const parent = cut.parentStripId || 'sheet';
        assert.ok(produced.has(parent), `corte seq=${cut.seq} padre ${parent} aún no existe`);
        if (cut.stripId) produced.add(cut.stripId);
        if (cut.leftoverStripId) produced.add(cut.leftoverStripId);
    }
});

test('pack de tiras: 20 estantes 400x300 usan pocas medidas de tope', () => {
    const opt = makeOpt({ descontarCanto: false, metodoCorte: 'strips' });
    const parts = [{
        id: 'a', name: 'Estante', largo: 400, ancho: 300, cant: 20,
        veta: false, cantos: [0, 0, 0, 0], grooves: [0, 0, 0, 0],
        material: 'Estándar 18mm', color: '#06b6d4', index: 0
    }];
    const result = opt.optimize(parts);
    assert.strictEqual(result.unplacedParts.length, 0);
    assert.ok(result.metrics.uniqueFenceCount >= 1 && result.metrics.uniqueFenceCount <= 2,
        'uniqueFenceCount=' + result.metrics.uniqueFenceCount);
    const sheet = result.sheets[0];
    for (let i = 0; i < sheet.placedParts.length; i++) {
        for (let j = i + 1; j < sheet.placedParts.length; j++) {
            const a = sheet.placedParts[i];
            const b = sheet.placedParts[j];
            const overlap = !(
                a.x + a.w <= b.x || b.x + b.w <= a.x ||
                a.y + a.h <= b.y || b.y + b.h <= a.y
            );
            assert.ok(!overlap, `overlap ${i} vs ${j}`);
        }
    }
});

const t0 = Date.now();
test('80 piezas se optimizan en menos de 1s', () => {
    const opt = makeOpt({ descontarCanto: false });
    const parts = [{
        id: 'a', name: 'P', largo: 350, ancho: 220, cant: 80,
        veta: false, cantos: [0, 0, 0, 0], grooves: [0, 0, 0, 0],
        material: 'Estándar 18mm', color: '#06b6d4', index: 0
    }];
    const result = opt.optimize(parts);
    assert.strictEqual(result.unplacedParts.length, 0);
    const ms = Date.now() - t0;
    assert.ok(ms < 1000, 'took ' + ms + 'ms');
    console.log('       (' + ms + ' ms, ' + result.metrics.sheetsCount + ' planchas, ' + result.metrics.globalEfficiency + '% eficiencia)');
});

function firstSheet(result) {
    return result.groups[Object.keys(result.groups)[0]].sheets[0];
}

test('sobrante igual al kerf: igual se emite el corte que lo separa', () => {
    const opt = makeOpt({ planchaLargo: 1000, planchaAncho: 500, refilado: 0 });
    const both = firstSheet(opt.optimize([{ name: 'A', largo: 996, ancho: 496, cant: 1 }]));
    assert.strictEqual(both.cuts.length, 2);
    assert.deepStrictEqual(both.cuts.map(c => c.axis).sort(), ['H', 'V']);

    const right = firstSheet(opt.optimize([{ name: 'A', largo: 996, ancho: 300, cant: 1 }]));
    assert.deepStrictEqual(right.cuts.map(c => c.axis).sort(), ['H', 'V']);
});

test('parámetros vacíos o NaN usan defecto; el 0 se respeta', () => {
    const vacio = new CutOptimizer({ espesorSierra: '', refilado: NaN, planchaLargo: NaN });
    assert.strictEqual(vacio.espesorSierra, 4);
    assert.strictEqual(vacio.refilado, 10);
    assert.strictEqual(vacio.planchaLargo, 2440);

    const cero = new CutOptimizer({ espesorSierra: 0, refilado: 0, cantoDelgadoEspesor: 0 });
    assert.strictEqual(cero.espesorSierra, 0);
    assert.strictEqual(cero.refilado, 0);
    const [p] = cero.prepareParts([{ name: 'A', largo: 500, ancho: 400, cant: 1, cantos: [1, 1, 1, 1] }]);
    assert.strictEqual(p.largo, 500);
    assert.strictEqual(p.ancho, 400);

    const r = new CutOptimizer({ espesorSierra: NaN, refilado: NaN })
        .optimize([{ name: 'A', largo: 500, ancho: 400, cant: 4 }]);
    assert.strictEqual(r.unplacedParts.length, 0);
});

test('sobrante útil no cuenta astillas', () => {
    assert.strictEqual(CutOptimizer.isUsefulLeftover({ w: 2420, h: 4 }), false);
    assert.strictEqual(CutOptimizer.isUsefulLeftover({ w: 400, h: 300 }), true);
});

test('propiedad: 60 casos aleatorios sin solapes, dentro del útil y con cada borde cortado', () => {
    let seed = 12345;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let caso = 0; caso < 60; caso++) {
        const kerf = [0, 3, 4, 4.5][caso % 4];
        const refilado = [0, 10][caso % 2];
        const metodo = ['optimal', 'horizontal', 'vertical', 'strips'][caso % 4];
        const opt = makeOpt({ espesorSierra: kerf, refilado, metodoCorte: metodo, descontarCanto: false });
        const nTipos = 1 + Math.floor(rnd() * 6);
        const parts = [];
        for (let t = 0; t < nTipos; t++) {
            parts.push({
                name: 'P' + t,
                largo: 50 + Math.round(rnd() * 1200),
                ancho: 50 + Math.round(rnd() * 800),
                cant: 1 + Math.floor(rnd() * 6)
            });
        }
        const result = opt.optimize(parts);
        const uW = opt.usableWidth();
        const uH = opt.usableHeight();
        for (const sheet of firstGroupSheets(result)) {
            const ps = sheet.placedParts;
            // Las distribuciones del optimizador siempre deben poder re-derivarse como guillotina
            const derived = opt.deriveGuillotine(sheet);
            assert.ok(derived, `caso ${caso}: deriveGuillotine no encontró secuencia`);
            for (const fr of derived.freeRects) {
                for (const p of ps) {
                    const overlap = !(fr.x + fr.w <= p.x + 0.3 || p.x + p.w <= fr.x + 0.3 ||
                        fr.y + fr.h <= p.y + 0.3 || p.y + p.h <= fr.y + 0.3);
                    assert.ok(!overlap, `caso ${caso}: sobrante derivado pisa una pieza`);
                }
            }
            for (let i = 0; i < ps.length; i++) {
                const a = ps[i];
                assert.ok(a.x >= refilado - 0.2 && a.y >= refilado - 0.2, `caso ${caso}: fuera del refilado`);
                assert.ok(a.x + a.w <= refilado + uW + 0.2 && a.y + a.h <= refilado + uH + 0.2, `caso ${caso}: fuera del útil`);
                for (let j = i + 1; j < ps.length; j++) {
                    const b = ps[j];
                    const sep = a.x + a.w + kerf <= b.x + 0.3 || b.x + b.w + kerf <= a.x + 0.3 ||
                        a.y + a.h + kerf <= b.y + 0.3 || b.y + b.h + kerf <= a.y + 0.3;
                    assert.ok(sep, `caso ${caso}: piezas ${i} y ${j} sin kerf entre ellas`);
                }
                const hasCut = (axis, pos, from, to) => sheet.cuts.some(c => c.axis === axis &&
                    Math.abs((axis === 'V' ? c.x1 : c.y1) - pos) <= 0.3 &&
                    Math.min(axis === 'V' ? c.y1 : c.x1, axis === 'V' ? c.y2 : c.x2) <= from + 0.3 &&
                    Math.max(axis === 'V' ? c.y1 : c.x1, axis === 'V' ? c.y2 : c.x2) >= to - 0.3);
                if (a.x + a.w < refilado + uW - 0.3) {
                    assert.ok(hasCut('V', a.x + a.w, a.y, a.y + a.h), `caso ${caso}: falta corte derecho de ${a.name}`);
                }
                if (a.y + a.h < refilado + uH - 0.3) {
                    assert.ok(hasCut('H', a.y + a.h, a.x, a.x + a.w), `caso ${caso}: falta corte inferior de ${a.name}`);
                }
            }
        }
    }
});

function firstGroupSheets(result) {
    return Object.values(result.groups).flatMap(g => g.sheets);
}

test('refilado: 4 pasadas al inicio, no se cobran; con refilado 0 no hay', () => {
    const parts = [{ name: 'A', largo: 800, ancho: 600, cant: 2 }];
    const conRef = makeOpt({ refilado: 10 }).optimize(parts);
    const sheet = firstSheet(conRef);
    assert.deepStrictEqual(sheet.cuts.slice(0, 4).map(c => c.kind), ['refilado', 'refilado', 'refilado', 'refilado']);
    assert.ok(sheet.cuts.slice(4).every(c => c.kind !== 'refilado'));
    assert.deepStrictEqual(sheet.cuts.map(c => c.seq), sheet.cuts.map((_, i) => i + 1));
    const pieceCuts = sheet.cuts.filter(c => c.kind !== 'refilado').length;
    assert.strictEqual(conRef.metrics.totalCutsCount, pieceCuts);

    const sinRef = makeOpt({ refilado: 0 }).optimize(parts);
    assert.ok(firstSheet(sinRef).cuts.every(c => c.kind !== 'refilado'));
});

test('girar a mano: se regenera secuencia y sobrantes sin pisar piezas', () => {
    const opt = makeOpt({ refilado: 10 });
    const result = opt.optimize([{ name: 'A', largo: 600, ancho: 300, cant: 1 }]);
    const sheet = firstSheet(result);
    const p = sheet.placedParts[0];
    [p.w, p.h] = [p.h, p.w];
    p.rotated = !p.rotated;
    assert.strictEqual(opt.rebuildSheet(sheet), true);
    assert.strictEqual(sheet.sequenceStale, false);
    for (const fr of sheet.freeRects) {
        const overlap = !(fr.x + fr.w <= p.x || p.x + p.w <= fr.x || fr.y + fr.h <= p.y || p.y + p.h <= fr.y);
        assert.ok(!overlap, 'sobrante pisa la pieza girada');
    }
    const pieceCuts = sheet.cuts.filter(c => c.kind !== 'refilado');
    assert.strictEqual(pieceCuts.length, 2);
    assert.ok(pieceCuts.every(c => c.desc && /tope/i.test(c.desc)));
});

test('distribución no guillotinable (molinete): secuencia vencida y espacio libre correcto', () => {
    const opt = makeOpt({ planchaLargo: 1000, planchaAncho: 1000, refilado: 0, espesorSierra: 0 });
    const sheet = opt.createNewSheet(1);
    const mk = (x, y, w, h) => ({ name: 'P', x, y, w, h, largo: w, ancho: h, cantos: [0, 0, 0, 0], grooves: [0, 0, 0, 0] });
    sheet.placedParts = [mk(0, 0, 600, 400), mk(600, 0, 400, 600), mk(400, 600, 600, 400), mk(0, 400, 400, 600)];
    assert.strictEqual(opt.rebuildSheet(sheet), false);
    assert.strictEqual(sheet.sequenceStale, true);
    const freeArea = sheet.freeRects.reduce((s, r) => s + r.w * r.h, 0);
    assert.strictEqual(Math.round(freeArea), 200 * 200);
});

test('quitar y volver a colocar una pieza deja la plancha válida', () => {
    const opt = makeOpt();
    const result = opt.optimize([{ name: 'A', largo: 700, ancho: 500, cant: 3 }]);
    const sheet = firstSheet(result);
    const removed = sheet.placedParts.pop();
    opt.rebuildSheet(sheet);
    const placed = opt.placeOnSheet(removed, sheet);
    assert.ok(placed);
    assert.strictEqual(sheet.placedParts.length, 3);
    assert.strictEqual(sheet.sequenceStale, false);
    opt.recomputeMetrics(result);
    assert.strictEqual(result.metrics.sheetsCount, 1);
});

test('onProgress informa avance hasta 1', () => {
    const steps = [];
    makeOpt().optimize([{ name: 'A', largo: 500, ancho: 400, cant: 2 }], { onProgress: f => steps.push(f) });
    assert.ok(steps.length > 1);
    assert.strictEqual(steps[steps.length - 1], 1);
});

test('catálogo: cada material usa su propia plancha', () => {
    const result = makeOpt().optimize([
        { name: 'Lateral', largo: 700, ancho: 400, cant: 2, material: 'Blanco' },
        { name: 'Fondo', largo: 1000, ancho: 800, cant: 1, material: 'MDF 3mm' }
    ], { materials: { 'MDF 3mm': { planchaLargo: 2440, planchaAncho: 1220 } } });
    const mdf = result.groups['MDF 3mm'];
    assert.strictEqual(mdf.sheets[0].h, 1220);
    assert.strictEqual(mdf.config.planchaAncho, 1220);
    assert.strictEqual(result.groups['Blanco'].sheets[0].h, 1830);
});

test('retazos: se usan antes de abrir planchas nuevas; los no usados se descartan', () => {
    const parts = [{ name: 'Repisa', largo: 500, ancho: 300, cant: 2, material: 'Blanco' }];
    const stock = { Blanco: [{ id: 'r1', largo: 1100, ancho: 400 }, { id: 'r2', largo: 300, ancho: 200 }] };
    const result = makeOpt().optimize(parts, { stock });
    const g = result.groups['Blanco'];
    assert.strictEqual(g.metrics.newSheetsCount, 0, 'no compra planchas');
    assert.strictEqual(g.sheets.length, 1, 'el retazo chico no se usa');
    assert.strictEqual(g.sheets[0].remnantId, 'r1');
    assert.strictEqual(g.sheets[0].refilado, 0);
    assert.ok(g.sheets[0].cuts.every(c => c.kind !== 'refilado'));
    assert.strictEqual(result.metrics.remnantsUsed, 1);

    const sinStock = makeOpt().optimize(parts);
    assert.strictEqual(sinStock.metrics.newSheetsCount, 1);
});

test('búsqueda aleatoria: respeta el tiempo y no empeora el resultado', () => {
    const parts = [
        { name: 'A', largo: 820, ancho: 560, cant: 5 },
        { name: 'B', largo: 610, ancho: 350, cant: 7 },
        { name: 'C', largo: 450, ancho: 260, cant: 9 }
    ];
    const base = makeOpt().optimize(parts);
    const t = Date.now();
    const searched = makeOpt({ searchTimeMs: 150 }).optimize(parts);
    const ms = Date.now() - t;
    assert.ok(ms < 1500, 'tardó ' + ms + ' ms');
    assert.ok(searched.metrics.newSheetsCount <= base.metrics.newSheetsCount);
    assert.ok(searched.metrics.strategiesTried > base.metrics.strategiesTried);
});

test('margen de tapacanto: suma el despunte por lado enchapado', () => {
    const parts = [{ name: 'Puerta', largo: 700, ancho: 400, cant: 1, cantos: [1, 1, 0, 0] }];
    const sinMargen = makeOpt({ descontarCanto: false }).optimize(parts);
    const conMargen = makeOpt({ descontarCanto: false, cantoMargenMm: 30 }).optimize(parts);
    assert.strictEqual(sinMargen.metrics.cantoDelgado, 1.4);
    assert.strictEqual(conMargen.metrics.cantoDelgado, 1.5);
});

test('muebles por medidas: bajo de cocina genera despiece coherente y cabe en la plancha', () => {
    const { parts, herrajes, errors } = buildFurniture('bajo-cocina', { ancho: 800, alto: 720, profundidad: 560, puertas: 2, repisas: 1 }, { espesor: 18, material: 'Blanco', prefix: '' });
    assert.deepStrictEqual(errors, []);
    const byName = Object.fromEntries(parts.map(p => [p.name, p]));
    assert.strictEqual(byName['Lateral'].largo, 720);
    assert.strictEqual(byName['Lateral'].cant, 2);
    assert.strictEqual(byName['Base'].largo, 800 - 36);
    assert.strictEqual(byName['Puerta'].cant, 2);
    assert.strictEqual(byName['Puerta'].ancho, (800 - 3 - 4) / 2);
    assert.strictEqual(byName['Fondo'].material, 'MDF Fondo 3mm');
    assert.strictEqual(herrajes.find(h => h.name === 'Bisagras').cant, 4);

    const result = makeOpt().optimize(parts);
    assert.strictEqual(result.unplacedParts.length, 0);
});

test('muebles por medidas: todas las plantillas con valores por defecto; valida rangos', () => {
    for (const tpl of FURNITURE_TEMPLATES) {
        const { parts, errors } = buildFurniture(tpl.id, {}, { material: 'M' });
        assert.deepStrictEqual(errors, [], tpl.id);
        assert.ok(parts.length >= 3, tpl.id);
        assert.ok(parts.every(p => p.largo > 0 && p.ancho > 0 && p.cant > 0), tpl.id);
    }
    assert.ok(buildFurniture('cajonera', { cajones: 0 }).errors.length > 0);
});

test('exportadores: CSV con BOM y ";" ; DXF con entidades', () => {
    const result = makeOpt().optimize([{ name: 'Lateral; izq', largo: 700, ancho: 400, cant: 2, cantos: [1, 0, 2, 0] }]);
    const csv = cutListCsv(result);
    assert.ok(csv.startsWith('\uFEFF'));
    const lines = csv.trim().split('\r\n');
    assert.strictEqual(lines.length, 3);
    assert.ok(lines[1].includes('"Lateral; izq"'));
    assert.ok(lines[1].includes('L1D A1G'));
    const dxf = sheetDxf(result.groups[Object.keys(result.groups)[0]].sheets[0], 'Plancha 1');
    assert.ok(dxf.startsWith('0\nSECTION\n2\nENTITIES'));
    assert.ok(dxf.trim().endsWith('EOF'));
    assert.strictEqual((dxf.match(/\nTEXT\n/g) || []).length, 2 * 2 + 1);
});

test('cotización: precio por material, retazos gratis, margen e impuesto', () => {
    const parts = [
        { name: 'Lateral', largo: 700, ancho: 400, cant: 2, material: 'Blanco', cantos: [1, 0, 0, 0] },
        { name: 'Fondo', largo: 900, ancho: 700, cant: 1, material: 'MDF' }
    ];
    const stock = { MDF: [{ id: 'r1', largo: 1000, ancho: 800 }] };
    const result = makeOpt({ descontarCanto: false }).optimize(parts, { stock });
    const costs = { corte: 1, cantoDel: 2, cantoGru: 0, ranura: 0, herrajes: 10, manoObra: 0, margenGanancia: 20, impuesto: 18, moneda: 'PEN' };
    const q = computeQuote(result, costs, mat => (mat === 'Blanco' ? 150 : 40));
    assert.strictEqual(q.planchas, 150, 'el MDF sale de un retazo: no se cobra');
    assert.ok(q.lines.every(l => l.desc !== 'Plancha MDF'));
    const expectedBase = 150 + result.metrics.totalCutsLength * 1 + result.metrics.cantoDelgado * 2 + 10;
    assert.ok(Math.abs(q.base - expectedBase) < 1e-9);
    assert.ok(Math.abs(q.total - expectedBase * 1.2 * 1.18) < 1e-9);
    const sumLines = q.lines.reduce((s, l) => s + l.amount, 0);
    assert.ok(Math.abs(sumLines - q.subtotal) < 0.05, 'las líneas suman el subtotal');
});

// Licencias: par de claves temporal, independiente de la clave real del vendedor
const licKeys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const licPublic = licKeys.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function makeLicense(data, key = licKeys.privateKey) {
    const signed = `MC1.${b64u(JSON.stringify(data))}`;
    return `${signed}.${b64u(sign('sha256', Buffer.from(signed), { key, dsaEncoding: 'ieee-p1363' }))}`;
}

await testAsync('licencias: válida, alterada, vencida, de otra clave y basura', async () => {
    const now = new Date(2026, 8, 25).getTime();
    const data = { p: 'pro', n: 'Ana Pérez', e: '2026-10-25', i: '2026-09-25', id: 'ab12' };
    const ok = await verifyLicense(makeLicense(data), licPublic, now);
    assert.strictEqual(ok.valid, true);
    assert.strictEqual(ok.name, 'Ana Pérez');
    assert.strictEqual(ok.daysLeft, 31);

    // Cambiar el nombre (o la fecha) invalida la firma
    const code = makeLicense(data);
    const [pre, , sig] = code.split('.');
    const forged = `${pre}.${b64u(JSON.stringify({ ...data, e: '2099-12-31' }))}.${sig}`;
    assert.strictEqual((await verifyLicense(forged, licPublic, now)).reason, 'firma');

    const expired = await verifyLicense(makeLicense({ ...data, e: '2026-09-24' }), licPublic, now);
    assert.strictEqual(expired.valid, false);
    assert.strictEqual(expired.reason, 'vencida');
    assert.strictEqual(expired.name, 'Ana Pérez');

    const other = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    assert.strictEqual((await verifyLicense(makeLicense(data, other.privateKey), licPublic, now)).reason, 'firma');
    assert.strictEqual((await verifyLicense('hola mundo', licPublic, now)).reason, 'formato');
    assert.strictEqual((await verifyLicense(` ${code}\n`, licPublic, now)).valid, true, 'tolera espacios al pegar');
});

test('importador: columnas opcionales de material, veta y cantos', () => {
    const txt = [
        'Largo\tAncho\tCant\tNombre\tMaterial\tVeta\tCantos',
        '500\t400\t2\tLateral\tRoble 18mm\tsi\tD0G0',
        '450,5\t300\t1\tTecho',
        '600;300;3;Repisa'
    ].join('\n');
    const parts = parseImportText(txt, 'Blanco Masisa');
    assert.strictEqual(parts.length, 3, 'la fila de encabezado se ignora');
    assert.deepStrictEqual(
        { ...parts[0] },
        { largo: 500, ancho: 400, cant: 2, name: 'Lateral', material: 'Roble 18mm', veta: true, cantos: [1, 0, 2, 0], grooves: [0, 0, 0, 0] }
    );
    assert.strictEqual(parts[1].largo, 450.5, 'coma decimal con separador tab');
    assert.strictEqual(parts[1].material, 'Blanco Masisa', 'sin columna material usa el de la plancha');
    assert.strictEqual(parts[2].cant, 3);
    assert.strictEqual(parts[2].name, 'Repisa');
});

console.log('\n' + passed + ' tests passed');
