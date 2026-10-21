// Avisos no bloqueantes (toasts) y diálogos de confirmación accesibles

let container = null;

function ensureContainer() {
    if (container) return container;
    container = document.createElement('div');
    container.className = 'toast-container';
    container.setAttribute('aria-live', 'polite');
    document.body.appendChild(container);
    return container;
}

/**
 * Muestra un aviso temporal.
 * type: 'info' | 'success' | 'warn' | 'error'
 * action: { label, onClick } — p. ej. "Deshacer"
 */
export function toast(message, { type = 'info', duration, action = null } = {}) {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');

    const text = document.createElement('span');
    text.className = 'toast-text';
    text.textContent = message;
    el.appendChild(text);

    let timer = null;
    const dismiss = () => {
        clearTimeout(timer);
        el.classList.add('toast-leaving');
        setTimeout(() => el.remove(), 200);
    };

    if (action) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'toast-action';
        btn.textContent = action.label;
        btn.addEventListener('click', () => {
            dismiss();
            action.onClick();
        });
        el.appendChild(btn);
    }

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'toast-close';
    close.setAttribute('aria-label', 'Cerrar aviso');
    close.textContent = '×';
    close.addEventListener('click', dismiss);
    el.appendChild(close);

    ensureContainer().appendChild(el);
    const ms = duration ?? (action ? 8000 : type === 'error' ? 7000 : 4000);
    timer = setTimeout(dismiss, ms);
    // Mantener visible mientras el mouse está encima
    el.addEventListener('mouseenter', () => clearTimeout(timer));
    el.addEventListener('mouseleave', () => { timer = setTimeout(dismiss, 2500); });
    return { dismiss };
}

/**
 * Diálogo modal de confirmación. Resuelve true (aceptar) o false (cancelar / Escape).
 */
export function confirmDialog(message, { title = 'Confirmar', okLabel = 'Aceptar', cancelLabel = 'Cancelar', danger = false } = {}) {
    return new Promise((resolve) => {
        const dialog = document.createElement('dialog');
        dialog.className = 'app-dialog';
        dialog.innerHTML = `
            <form method="dialog" class="app-dialog-body">
                <h3 class="app-dialog-title"></h3>
                <p class="app-dialog-message"></p>
                <div class="app-dialog-actions">
                    <button type="submit" value="cancel" class="btn btn-secondary btn-sm"></button>
                    <button type="submit" value="ok" class="btn btn-sm ${danger ? 'btn-danger' : 'btn-primary'}"></button>
                </div>
            </form>
        `;
        dialog.querySelector('.app-dialog-title').textContent = title;
        dialog.querySelector('.app-dialog-message').textContent = message;
        const [cancelBtn, okBtn] = dialog.querySelectorAll('button');
        cancelBtn.textContent = cancelLabel;
        okBtn.textContent = okLabel;

        // Se resuelve al enviar el formulario o con Escape; el evento "close" es solo respaldo
        // (en algunas pestañas en segundo plano el navegador lo demora)
        let settled = false;
        const finish = (value) => {
            if (settled) return;
            settled = true;
            resolve(value);
            if (dialog.open) dialog.close();
            dialog.remove();
        };
        dialog.querySelector('form').addEventListener('submit', (e) => {
            e.preventDefault();
            finish(!!(e.submitter && e.submitter.value === 'ok'));
        });
        dialog.addEventListener('cancel', (e) => {
            e.preventDefault();
            finish(false);
        });
        dialog.addEventListener('close', () => finish(dialog.returnValue === 'ok'));
        document.body.appendChild(dialog);
        dialog.showModal();
        okBtn.focus();
    });
}
