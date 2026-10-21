// Integración con la app Android (Capacitor). En el navegador todo queda inactivo y se usa la vía web.
// El WebView de Android no descarga archivos con <a download>, no imprime y no tiene Web Share:
// aquí se guardan los archivos en la caché de la app y se abre el menú "Compartir" de Android.

const cap = window.Capacitor;
export const isNativeApp = !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());

let pluginsPromise = null;
function plugins() {
    if (!pluginsPromise) {
        pluginsPromise = import('../../vendor/capacitor/core.js').then(({ registerPlugin }) => ({
            Filesystem: registerPlugin('Filesystem'),
            Share: registerPlugin('Share'),
            App: registerPlugin('App')
        }));
    }
    return pluginsPromise;
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

function isCancel(err) {
    return /cancel/i.test(String(err && (err.message || err)));
}

// Escribe el archivo en la caché de la app y abre "Compartir" (Drive, Archivos, WhatsApp, correo...)
export async function shareNativeFile(filename, blob, { text, title } = {}) {
    const { Filesystem, Share } = await plugins();
    const { uri } = await Filesystem.writeFile({
        path: filename,
        data: await blobToBase64(blob),
        directory: 'CACHE'
    });
    try {
        await Share.share({ title: title || filename, text, files: [uri], dialogTitle: 'Guardar o enviar' });
    } catch (err) {
        if (!isCancel(err)) throw err;
    }
}

// Abre un enlace externo (WhatsApp, web) fuera de la app
export function openExternal(url) {
    if (isNativeApp) {
        // Capacitor abre en el sistema toda navegación a otro dominio (wa.me abre WhatsApp)
        window.location.href = url;
    } else {
        window.open(url, '_blank', 'noopener');
    }
}

// Botón "atrás" de Android: cierra lo que esté abierto antes de salir de la app
async function initBackButton() {
    const { App } = await plugins();
    App.addListener('backButton', ({ canGoBack }) => {
        const dialogs = document.querySelectorAll('dialog[open]');
        if (dialogs.length) {
            dialogs[dialogs.length - 1].dispatchEvent(new Event('cancel', { cancelable: true }));
            return;
        }
        const overlay = document.querySelector('.workshop-overlay:not([hidden])');
        if (overlay) {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            return;
        }
        if (canGoBack) window.history.back();
        else App.exitApp();
    });
}

export function initNative() {
    if (!isNativeApp) return;
    document.documentElement.classList.add('native-app');
    initBackButton().catch(err => console.warn('Botón atrás no disponible:', err));
}
