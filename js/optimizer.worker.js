// Worker del optimizador: calcula fuera del hilo principal para no congelar la interfaz

import { CutOptimizer } from './optimizer.js';

self.onmessage = (e) => {
    const { config, rawParts, options = {} } = e.data;
    try {
        let lastSent = 0;
        const results = new CutOptimizer(config).optimize(rawParts, {
            ...options,
            onProgress: (fraction) => {
                if (fraction - lastSent >= 0.02 || fraction === 1) {
                    lastSent = fraction;
                    self.postMessage({ type: 'progress', value: fraction });
                }
            }
        });
        self.postMessage({ type: 'done', results });
    } catch (err) {
        self.postMessage({ type: 'error', message: (err && err.message) || String(err) });
    }
};
