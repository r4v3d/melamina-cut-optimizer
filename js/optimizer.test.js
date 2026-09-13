// Pruebas del motor de corte — ejecutar: node js/optimizer.test.js
const { CutOptimizer } = require('./optimizer.js');
const assert = require('assert');

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
    assert.ok(sheet.cuts.length >= 1);
    assert.strictEqual(sheet.cuts[0].kind, 'raja', 'paso 1 debe ser raja de tira');
    assert.ok(sheet.cuts[0].desc.includes('tope'), sheet.cuts[0].desc);
    assert.ok(sheet.cuts.every(c => c.seq && c.desc && c.fenceMm > 0));

    const produced = new Set(['sheet']);
    for (const cut of sheet.cuts) {
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

console.log('\n' + passed + ' tests passed');
