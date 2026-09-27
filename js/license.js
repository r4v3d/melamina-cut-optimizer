// Licencias Pro sin servidor: el código lleva los datos del cliente firmados con ECDSA P-256.
// La app solo tiene la clave pública (puede verificar, no puede crear códigos).
// Formato: MC1.<datos en base64url>.<firma en base64url>
// Datos: { p: plan, n: nombre del cliente, e: vence 'AAAA-MM-DD', i: emitido 'AAAA-MM-DD', id }
// Nota: la verificación ocurre en el navegador; frena el uso casual, no a alguien que modifique el código.

const PREFIX = 'MC1';

function b64urlToBytes(s) {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

function b64ToBytes(s) {
    return b64urlToBytes(s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''));
}

// Separa el código en sus partes sin verificar la firma (para mostrar mensajes claros)
export function parseLicense(code) {
    const clean = String(code || '').replace(/\s+/g, '');
    const parts = clean.split('.');
    if (parts.length !== 3 || parts[0] !== PREFIX) return null;
    try {
        const json = new TextDecoder().decode(b64urlToBytes(parts[1]));
        const data = JSON.parse(json);
        return { data, signed: `${parts[0]}.${parts[1]}`, signature: parts[2], code: clean };
    } catch (e) {
        return null;
    }
}

// Fin del día de vencimiento en hora local
function expiryTime(dateStr) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || '');
    if (!m) return NaN;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999).getTime();
}

/**
 * Verifica un código. Devuelve:
 * { valid: true, plan, name, expires, issued, id, daysLeft }  o  { valid: false, reason, ... }
 * reason: 'formato' | 'firma' | 'vencida'
 */
export async function verifyLicense(code, publicKeySpkiB64, now = Date.now()) {
    const parsed = parseLicense(code);
    if (!parsed) return { valid: false, reason: 'formato' };

    let ok = false;
    try {
        const key = await crypto.subtle.importKey(
            'spki',
            b64ToBytes(publicKeySpkiB64),
            { name: 'ECDSA', namedCurve: 'P-256' },
            false,
            ['verify']
        );
        ok = await crypto.subtle.verify(
            { name: 'ECDSA', hash: 'SHA-256' },
            key,
            b64urlToBytes(parsed.signature),
            new TextEncoder().encode(parsed.signed)
        );
    } catch (e) {
        ok = false;
    }
    if (!ok) return { valid: false, reason: 'firma' };

    const d = parsed.data;
    const info = {
        plan: d.p,
        name: d.n || '',
        expires: d.e,
        issued: d.i || '',
        id: d.id || '',
        code: parsed.code
    };
    const exp = expiryTime(d.e);
    if (!Number.isFinite(exp)) return { valid: false, reason: 'formato' };
    if (now > exp) return { valid: false, reason: 'vencida', ...info };
    return { valid: true, ...info, daysLeft: Math.ceil((exp - now) / 86400000) };
}
