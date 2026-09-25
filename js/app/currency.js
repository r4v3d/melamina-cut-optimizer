// Monedas y formato de precios

import { dom } from './dom.js';

const CURRENCIES = {
    PEN: { symbol: 'S/.', locale: 'es-PE', decimals: 2 },
    USD: { symbol: '$USD', locale: 'en-US', decimals: 2 },
    COP: { symbol: '$COP', locale: 'es-CO', decimals: 0 },
    CLP: { symbol: '$CLP', locale: 'es-CL', decimals: 0 },
    MXN: { symbol: '$MXN', locale: 'es-MX', decimals: 2 },
    ARS: { symbol: '$ARS', locale: 'es-AR', decimals: 2 },
    BOB: { symbol: 'Bs.', locale: 'es-BO', decimals: 2 },
    EUR: { symbol: '€', locale: 'es-ES', decimals: 2 }
};

export function getCurrencySymbol(currency) {
    return (CURRENCIES[currency] || { symbol: '$' }).symbol;
}

export function formatPrice(amount, currency) {
    const c = CURRENCIES[currency];
    if (!c) return `$ ${amount.toFixed(2)}`;
    const formatted = new Intl.NumberFormat(c.locale, {
        minimumFractionDigits: c.decimals,
        maximumFractionDigits: c.decimals
    }).format(amount);
    return `${c.symbol} ${formatted}`;
}

export function updateCurrencyLabels() {
    const symbol = getCurrencySymbol(dom.selectMoneda.value);
    const labels = {
        'input-costo-plancha': 'Costo Plancha',
        'input-costo-corte': 'Corte /m',
        'input-costo-canto-del': 'Canto Delg. /m',
        'input-costo-canto-gru': 'Canto Grues. /m',
        'input-costo-ranura': 'Ranura /m',
        'input-costo-mano-obra': 'Mano de Obra',
        'input-costo-herrajes': 'Herrajes/Acc.'
    };
    for (const id in labels) {
        const label = document.querySelector(`label[for="${id}"]`);
        if (label) label.textContent = `${labels[id]} (${symbol})`;
    }
    document.querySelectorAll('.currency-symbol').forEach(el => {
        el.textContent = symbol;
    });
}
