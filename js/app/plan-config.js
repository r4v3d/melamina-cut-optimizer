// Datos de venta del plan Pro. COMPLETA tus datos de pago antes de publicar la app:
// solo se muestran los campos que tengan valor.

export const PLAN_CONFIG = {
    moneda: 'S/',
    precioMensual: 19,
    precioAnual: 190,          // 12 meses por el precio de 10

    yapeNumero: '',            // ej. '987654321'
    yapeTitular: '',           // nombre que aparece al yapear
    cuentaBancaria: '',        // ej. 'BCP Soles 191-12345678-0-12 · CCI 002-191-...'
    whatsappVentas: ''         // con código de país, solo dígitos, ej. '51987654321'
};

// Funciones que desbloquea Pro (clave interna → texto para el cliente)
export const PRO_FEATURES = {
    catalog: 'Catálogo de materiales con plancha y precio propios',
    retazos: 'Inventario de retazos (se usan antes de comprar planchas)',
    projects: 'Proyectos ilimitados, duplicar e importar/exportar',
    furniture: 'Mueble por medidas (cocina, ropero, cajonera…)',
    quoteBrand: 'Cotización con tu logo y sin marca de agua',
    exports: 'Exportar lista de corte (Excel) y planos DXF'
};
