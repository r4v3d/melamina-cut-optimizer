// Service worker de MelaminaCut: permite usar la app sin conexión.
// Estrategia: primero la red (siempre la versión más reciente) y, sin conexión, la copia en caché.

const CACHE = 'melaminacut-v7';

const APP_SHELL = [
    './',
    'index.html',
    'style.css',
    'manifest.webmanifest',
    'icons/icon.svg',
    'icons/icon-192.png',
    'icons/icon-512.png',
    'vendor/jspdf/jspdf.umd.min.js',
    'vendor/fonts/fonts.css',
    'vendor/fonts/outfit-latin.woff2',
    'vendor/fonts/outfit-latin-ext.woff2',
    'vendor/fonts/plus-jakarta-sans-latin.woff2',
    'vendor/fonts/plus-jakarta-sans-latin-ext.woff2',
    'js/canvas.js',
    'js/import-parser.js',
    'js/optimizer.js',
    'js/optimizer.worker.js',
    'js/presets.js',
    'js/utils.js',
    'js/app/currency.js',
    'js/app/dom.js',
    'js/app/export-pdf.js',
    'js/app/importer.js',
    'js/app/main.js',
    'js/app/optimize.js',
    'js/app/parts-table.js',
    'js/app/persistence.js',
    'js/app/print-report.js',
    'js/app/results.js',
    'js/app/sequence.js',
    'js/app/settings.js',
    'js/app/state.js',
    'js/app/theme.js',
    'js/app/ui-feedback.js',
    'js/app/workshop-mode.js',
    'js/app/catalog-ui.js',
    'js/app/exports-ui.js',
    'js/app/furniture-ui.js',
    'js/app/modal.js',
    'js/app/projects-ui.js',
    'js/app/quote-ui.js',
    'js/app/retazos-ui.js',
    'js/app/store.js',
    'js/exporters.js',
    'js/furniture-templates.js',
    'js/quote-calc.js',
    'js/license.js',
    'js/license-key.js',
    'js/app/plan.js',
    'js/app/plan-config.js',
    'js/app/native.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE)
            .then(cache => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

    event.respondWith((async () => {
        try {
            // Revalidar siempre con el servidor (304 si no cambió): tras publicar no se mezclan versiones
            const res = await fetch(req.mode === 'navigate' ? req : new Request(req, { cache: 'no-cache' }));
            if (res.ok) {
                const copy = res.clone();
                caches.open(CACHE).then(cache => cache.put(req, copy));
            }
            return res;
        } catch (err) {
            // Sin conexión: la copia en caché (ignorando ?v=... del cache busting)
            const cached = await caches.match(req, { ignoreSearch: true });
            if (cached) return cached;
            if (req.mode === 'navigate') {
                const shell = await caches.match('index.html');
                if (shell) return shell;
            }
            return Response.error();
        }
    })());
});
