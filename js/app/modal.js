// Ventana modal genérica (usa <dialog> nativo: foco atrapado y Escape para cerrar)

import { isNativeApp, shareNativeFile } from './native.js';
import { toast } from './ui-feedback.js';

/**
 * openModal({ title, body, actions, wide })
 *  body: HTMLElement o texto HTML
 *  actions: [{ label, variant: 'primary'|'secondary'|'danger', onClick }]
 *           onClick(close) — si devuelve false, el modal queda abierto
 * Devuelve { dialog, body, close }.
 */
export function openModal({ title, body, actions = [], wide = false, onClose = null }) {
    const dialog = document.createElement('dialog');
    dialog.className = `app-dialog app-modal${wide ? ' app-modal-wide' : ''}`;
    dialog.setAttribute('aria-label', title);

    const header = document.createElement('header');
    header.className = 'app-modal-header';
    const h = document.createElement('h3');
    h.className = 'app-dialog-title';
    h.textContent = title;
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'toast-close';
    closeBtn.setAttribute('aria-label', 'Cerrar');
    closeBtn.textContent = '×';
    header.append(h, closeBtn);

    const content = document.createElement('div');
    content.className = 'app-modal-body';
    if (typeof body === 'string') content.innerHTML = body;
    else if (body) content.appendChild(body);

    const footer = document.createElement('div');
    footer.className = 'app-dialog-actions app-modal-footer';

    // Cierre directo (no depende del evento "close", que algunos navegadores demoran en segundo plano)
    let closed = false;
    const close = () => {
        if (closed) return;
        closed = true;
        if (dialog.open) dialog.close();
        if (onClose) onClose();
        dialog.remove();
    };
    for (const action of actions) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `btn btn-sm btn-${action.variant || 'secondary'}`;
        btn.textContent = action.label;
        btn.addEventListener('click', async () => {
            const keepOpen = action.onClick ? (await action.onClick(close)) === false : false;
            if (!keepOpen) close();
        });
        footer.appendChild(btn);
    }

    closeBtn.addEventListener('click', close);
    dialog.addEventListener('cancel', (e) => {
        e.preventDefault(); // Escape
        close();
    });
    dialog.addEventListener('close', close);

    dialog.append(header, content);
    if (actions.length) dialog.appendChild(footer);
    document.body.appendChild(dialog);
    dialog.showModal();
    return { dialog, body: content, close };
}

// Descarga un texto o Blob como archivo generado por la app
// (en la app Android abre "Compartir" para guardarlo en Archivos/Drive o enviarlo)
export function downloadFile(filename, data, mime = 'text/plain;charset=utf-8') {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
    if (isNativeApp) {
        shareNativeFile(filename, blob).catch(err => {
            console.error(err);
            toast('No se pudo guardar el archivo.', { type: 'error' });
        });
        return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Nombre de archivo seguro a partir de un texto libre
export function safeFileName(text, fallback = 'archivo') {
    const s = String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
    return s || fallback;
}
