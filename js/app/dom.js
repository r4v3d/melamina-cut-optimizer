// Referencias al DOM (los módulos se ejecutan con el HTML ya parseado)

const $ = id => document.getElementById(id);

export const dom = {
    // Plancha
    selectPlanchaPreset: $('select-plancha-preset'),
    selectMueblePreset: $('select-mueble-preset'),
    inputLargo: $('input-plancha-largo'),
    inputAncho: $('input-plancha-ancho'),
    selectEspesor: $('input-plancha-espesor'),
    inputMaterial: $('input-plancha-material'),

    // Taller y heurísticas
    inputSierra: $('input-sierra-espesor'),
    inputRefilado: $('input-refilado'),
    checkDescontarCanto: $('check-descontar-canto'),
    checkTieneVeta: $('check-tiene-veta'),
    selectMetodoCorte: $('select-metodo-corte'),
    checkPreferFence: $('check-prefer-fence'),
    checkUsarRetazos: $('check-usar-retazos'),
    checkBusquedaExtra: $('check-busqueda-extra'),
    inputCantoMargen: $('input-canto-margen'),

    // Proyecto y herramientas del taller
    inputProjectName: $('input-project-name'),
    inputClientName: $('input-client-name'),
    inputClientPhone: $('input-client-phone'),
    inputOrderDate: $('input-order-date'),
    inputDeliveryDate: $('input-delivery-date'),
    btnProjects: $('btn-projects'),
    btnCatalog: $('btn-catalog'),
    btnRetazos: $('btn-retazos'),
    btnTallerProfile: $('btn-taller-profile'),
    btnFurnitureBuilder: $('btn-furniture-builder'),
    btnQuotePdf: $('btn-quote-pdf'),
    btnShareQuote: $('btn-share-quote'),
    btnExportCsv: $('btn-export-csv'),
    btnExportDxf: $('btn-export-dxf'),
    btnRegisterInventory: $('btn-register-inventory'),
    importFile: $('import-file'),

    // Tapacantos
    inputCantoDelgadoVal: $('input-canto-delgado-val'),
    inputCantoGruesoVal: $('input-canto-grueso-val'),
    txtCantoDelLegend: $('txt-canto-del-legend'),
    txtCantoGruLegend: $('txt-canto-gru-legend'),

    // Surcos
    inputGrooveOffset: $('input-groove-offset'),
    inputGrooveWidth: $('input-groove-width'),
    inputGrooveDepth: $('input-groove-depth'),

    // Costos
    selectMoneda: $('select-moneda'),
    inputCostoPlancha: $('input-costo-plancha'),
    inputCostoCorte: $('input-costo-corte'),
    inputCostoCantoDel: $('input-costo-canto-del'),
    inputCostoCantoGru: $('input-costo-canto-gru'),
    inputCostoRanura: $('input-costo-ranura'),
    inputCostoManoObra: $('input-costo-mano-obra'),
    inputCostoHerrajes: $('input-costo-herrajes'),
    inputMargenGanancia: $('input-margen-ganancia'),
    inputImpuesto: $('input-impuesto'),

    // Tema
    btnThemeToggle: $('btn-theme-toggle'),
    darkIcon: $('theme-toggle-dark-icon'),
    lightIcon: $('theme-toggle-light-icon'),

    // Importador
    btnToggleImport: $('btn-toggle-import'),
    importCsvContainer: $('import-csv-container'),
    importCsvTextarea: $('import-csv-textarea'),
    btnImportCsvConfirm: $('btn-import-csv-confirm'),
    btnImportCsvCancel: $('btn-import-csv-cancel'),

    // Tabla de piezas
    partsTbody: $('parts-tbody'),
    btnAddRow: $('btn-add-row'),
    btnOptimize: $('btn-optimize'),
    checkAutoOptimize: $('check-auto-optimize'),
    btnClearAll: $('btn-clear-all'),
    btnLoadPresetMueble: $('btn-load-preset-mueble'),

    // Resultados
    resultsSection: $('results-section'),
    resultsStaleBanner: $('results-stale-banner'),
    valEficiencia: $('val-eficiencia'),
    circleEficiencia: $('circle-eficiencia'),
    valPlanchas: $('val-planchas'),
    valCantoDelgado: $('val-canto-delgado'),
    valCantoGrueso: $('val-canto-grueso'),
    valMetrosCorte: $('val-metros-corte'),
    valNumCortes: $('val-num-cortes'),
    valMetrosRanura: $('val-metros-ranura'),
    valSobrante: $('val-sobrante'),
    valMerma: $('val-merma'),
    strategyNote: $('opt-strategy-note'),
    valCostoTotal: $('val-costo-total'),
    valSubPlanchas: $('val-sub-planchas'),
    valSubServicios: $('val-sub-servicios'),
    valSubExtras: $('val-sub-extras'),
    valSubMargen: $('val-sub-margen'),

    // Piezas sin colocar
    unplacedContainer: $('unplaced-container'),
    unplacedCount: $('unplaced-count'),
    unplacedListEl: $('unplaced-list-el'),

    // Mapa y navegación
    btnPrevSheet: $('btn-prev-sheet'),
    btnNextSheet: $('btn-next-sheet'),
    sheetNavLabel: $('sheet-nav-label'),
    btnDownloadImg: $('btn-download-img'),
    btnDownloadPdf: $('btn-download-pdf'),
    btnPrintReport: $('btn-print-report'),
    btnZoomIn: $('btn-zoom-in'),
    btnZoomOut: $('btn-zoom-out'),
    btnZoomReset: $('btn-zoom-reset'),
    btnFullscreenToggle: $('btn-fullscreen-toggle'),
    selectMaterialGroup: $('select-material-group'),

    // Secuencia de cortes
    btnSeqPrev: $('btn-seq-prev'),
    btnSeqNext: $('btn-seq-next'),
    btnSeqReset: $('btn-seq-reset'),
    btnSeqDone: $('btn-seq-done'),
    lblSeqStep: $('lbl-seq-step'),
    wizardOverlay: $('cut-wizard-overlay'),
    wizardOverlayText: $('cut-wizard-overlay-text'),
    btnOverlayPrev: $('btn-overlay-prev'),
    btnOverlayNext: $('btn-overlay-next'),
    btnOverlayDone: $('btn-overlay-done'),
    sequenceStaleBanner: $('sequence-stale-banner'),
    sequenceList: $('sequence-list-el'),

    // Impresión
    printAllSheets: $('print-report-all-sheets'),
    printLabels: $('print-labels-sheet')
};

// Inputs de costos: se recalculan en vivo y no requieren reoptimizar
export const costInputs = [
    dom.inputCostoPlancha,
    dom.inputCostoCorte,
    dom.inputCostoCantoDel,
    dom.inputCostoCantoGru,
    dom.inputCostoRanura,
    dom.selectMoneda,
    dom.inputCostoManoObra,
    dom.inputCostoHerrajes,
    dom.inputMargenGanancia,
    dom.inputImpuesto
];

// Inputs de surcos: solo cambian el dibujo, no el layout
export const grooveInputs = [dom.inputGrooveOffset, dom.inputGrooveWidth, dom.inputGrooveDepth];
