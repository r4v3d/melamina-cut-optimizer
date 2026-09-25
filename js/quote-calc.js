// Cálculo de la cotización (sin DOM, se prueba en Node).
// Las planchas se cobran por material (precio del catálogo); los retazos del inventario no se cobran.

const round2 = n => Math.round(n * 100) / 100;

/**
 * results: resultado del optimizador
 * costs: { corte, cantoDel, cantoGru, ranura, herrajes, manoObra, margenGanancia, impuesto, moneda }
 * priceForMaterial(nombre) → precio de una plancha nueva de ese material
 */
export function computeQuote(results, costs, priceForMaterial) {
    const lines = [];
    let planchas = 0;

    for (const mat in results.groups) {
        const group = results.groups[mat];
        const nuevas = group.sheets.filter(s => !s.isRemnant).length;
        if (!nuevas) continue;
        const price = Number(priceForMaterial(mat)) || 0;
        const cfg = group.config || {};
        const size = cfg.planchaLargo && cfg.planchaAncho ? ` (${cfg.planchaLargo}×${cfg.planchaAncho} mm)` : '';
        lines.push({ kind: 'plancha', desc: `Plancha ${mat}${size}`, qty: nuevas, unit: 'und', unitCost: price, cost: nuevas * price });
        planchas += nuevas * price;
    }

    const m = results.metrics;
    let servicios = 0;
    const services = [
        ['Servicio de corte', m.totalCutsLength, costs.corte],
        ['Tapacanto delgado', m.cantoDelgado, costs.cantoDel],
        ['Tapacanto grueso', m.cantoGrueso, costs.cantoGru],
        ['Ranurado / surcos', m.totalGroovesLength, costs.ranura]
    ];
    for (const [desc, qty, unitCost] of services) {
        const cost = qty * unitCost;
        servicios += cost;
        if (qty > 0 && unitCost > 0) lines.push({ kind: 'servicio', desc, qty, unit: 'm', unitCost, cost });
    }

    const extras = costs.herrajes + costs.manoObra;
    if (costs.herrajes > 0) lines.push({ kind: 'extra', desc: 'Herrajes y accesorios', qty: 1, unit: 'glb', unitCost: costs.herrajes, cost: costs.herrajes });
    if (costs.manoObra > 0) lines.push({ kind: 'extra', desc: 'Mano de obra e instalación', qty: 1, unit: 'glb', unitCost: costs.manoObra, cost: costs.manoObra });

    const base = planchas + servicios + extras;
    const factor = 1 + costs.margenGanancia / 100;
    const subtotal = base * factor;
    const impuestoMonto = subtotal * costs.impuesto / 100;
    const total = subtotal + impuestoMonto;

    return {
        // Para el cliente: precios con margen incluido (el margen no se muestra por separado)
        lines: lines.map(l => ({ ...l, unitPrice: round2(l.unitCost * factor), amount: round2(l.cost * factor) })),
        planchas,
        servicios,
        extras,
        base,
        subtotal,
        impuestoMonto,
        impuestoPct: costs.impuesto,
        margenImpuesto: total - base,
        total,
        moneda: costs.moneda
    };
}
