// Plan Gratis / Pro: licencia guardada, verificación, pantalla "Pasar a Pro" y bloqueo de funciones

import { escapeHtml } from '../utils.js';
import { verifyLicense } from '../license.js';
import { LICENSE_PUBLIC_KEY } from '../license-key.js';
import { PLAN_CONFIG, PRO_FEATURES } from './plan-config.js';
import { openModal } from './modal.js';
import { toast, confirmDialog } from './ui-feedback.js';
import { openExternal } from './native.js';

const LICENSE_STORAGE = 'melaminacut_license';
const RENEW_WARNING_DAYS = 5;

let license = null; // resultado de verifyLicense del código guardado
const listeners = [];

export function isPro() {
    return !!(license && license.valid);
}

export function currentLicense() {
    return license;
}

// Se llama cuando cambia el plan (activar / quitar licencia)
export function onPlanChange(fn) {
    listeners.push(fn);
}

function fmtDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

function renderPlanBadge() {
    document.body.classList.toggle('is-pro', isPro());
    const btn = document.getElementById('btn-plan');
    if (!btn) return;
    if (isPro()) {
        btn.textContent = `Pro · vence ${fmtDate(license.expires)}`;
        btn.classList.remove('btn-upgrade');
        btn.title = `Licencia de ${license.name}`;
    } else {
        btn.textContent = license && license.reason === 'vencida' ? 'Renovar Pro' : 'Pasar a Pro';
        btn.classList.add('btn-upgrade');
        btn.title = 'Ver beneficios y activar el plan Pro';
    }
    listeners.forEach(fn => fn(isPro()));
}

async function activateCode(code) {
    const result = await verifyLicense(code, LICENSE_PUBLIC_KEY);
    if (!result.valid) {
        const msg = {
            formato: 'El código no tiene el formato correcto. Cópielo completo, sin cortar.',
            firma: 'El código no es válido. Verifique que lo copió completo o pida uno nuevo.',
            vencida: `Ese código venció el ${fmtDate(result.expires)}. Pida la renovación.`
        }[result.reason] || 'No se pudo validar el código.';
        toast(msg, { type: 'error' });
        return false;
    }
    try {
        localStorage.setItem(LICENSE_STORAGE, result.code);
    } catch (e) { /* sin almacenamiento: queda activa solo en esta sesión */ }
    license = result;
    renderPlanBadge();
    toast(`¡Plan Pro activado para ${result.name}! Vence el ${fmtDate(result.expires)}.`, { type: 'success', duration: 7000 });
    return true;
}

function paymentHtml() {
    const c = PLAN_CONFIG;
    const rows = [];
    if (c.yapeNumero) rows.push(`<li><strong>Yape / Plin:</strong> ${escapeHtml(c.yapeNumero)}${c.yapeTitular ? ` (${escapeHtml(c.yapeTitular)})` : ''}</li>`);
    if (c.cuentaBancaria) rows.push(`<li><strong>Transferencia:</strong> ${escapeHtml(c.cuentaBancaria)}</li>`);
    if (!rows.length) {
        return '<p class="muted">Pronto publicaremos los medios de pago. Si ya tienes un código de licencia, actívalo abajo.</p>';
    }
    return `<ol class="plan-steps">
        <li>Paga el plan que elijas:<ul>${rows.join('')}</ul></li>
        <li>Envía la captura del pago${c.whatsappVentas ? ' por WhatsApp con el botón de abajo' : ''} indicando tu nombre o el de tu taller.</li>
        <li>Recibirás un <strong>código de licencia</strong>: pégalo abajo y presiona <em>Activar</em>.</li>
    </ol>`;
}

// Pantalla de beneficios, pago y activación. featureKey resalta la función que se intentó usar.
export function openUpgrade(featureKey = null) {
    const c = PLAN_CONFIG;
    const body = document.createElement('div');
    const proInfo = isPro()
        ? `<div class="plan-active">Tienes <strong>Pro</strong> activo a nombre de <strong>${escapeHtml(license.name)}</strong> hasta el <strong>${fmtDate(license.expires)}</strong> (${license.daysLeft} días).</div>`
        : '';
    const blocked = featureKey && !isPro()
        ? `<div class="plan-blocked">«${escapeHtml(PRO_FEATURES[featureKey] || 'Esta función')}» es parte del plan Pro.</div>`
        : '';
    body.innerHTML = `
        ${proInfo}${blocked}
        <div class="plan-grid">
            <div class="plan-card">
                <h4>Gratis</h4>
                <p class="plan-price">${escapeHtml(c.moneda)} 0</p>
                <ul>
                    <li>Optimizador de cortes completo</li>
                    <li>Mapa, secuencia de sierra y Modo Taller</li>
                    <li>Reporte de corte en PDF e impresión</li>
                    <li>Importar piezas desde Excel/CSV</li>
                    <li>Cotización básica (con marca de agua)</li>
                </ul>
            </div>
            <div class="plan-card plan-card-pro">
                <h4>Pro</h4>
                <p class="plan-price">${escapeHtml(c.moneda)} ${c.precioMensual}<span>/mes</span></p>
                <p class="plan-annual">o ${escapeHtml(c.moneda)} ${c.precioAnual} al año (2 meses gratis)</p>
                <ul>
                    <li>Todo lo del plan Gratis</li>
                    ${Object.entries(PRO_FEATURES).map(([k, v]) => `<li class="${k === featureKey ? 'plan-highlight' : ''}">${escapeHtml(v)}</li>`).join('')}
                </ul>
            </div>
        </div>
        ${isPro() ? '' : `<h4 class="plan-subtitle">Cómo activar Pro</h4>${paymentHtml()}`}
        <form class="plan-activate">
            <label for="plan-code">Código de licencia</label>
            <textarea id="plan-code" class="form-input" rows="3" placeholder="MC1.xxxxx.xxxxx" spellcheck="false" autocomplete="off"></textarea>
            <div class="modal-inline-actions">
                <button type="submit" class="btn btn-primary btn-sm">${isPro() ? 'Cambiar código' : 'Activar'}</button>
                ${c.whatsappVentas && !isPro() ? '<button type="button" class="btn btn-secondary btn-sm" data-act="whatsapp">Enviar comprobante por WhatsApp</button>' : ''}
                ${isPro() ? '<button type="button" class="btn btn-secondary btn-sm" data-act="remove">Quitar licencia de este equipo</button>' : ''}
            </div>
        </form>
    `;

    const modal = openModal({ title: isPro() ? 'Tu plan Pro' : 'Pasar a Pro', body, wide: true, actions: [{ label: 'Cerrar' }] });

    body.querySelector('form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const code = body.querySelector('#plan-code').value;
        if (!code.trim()) {
            toast('Pegue el código de licencia.', { type: 'warn' });
            return;
        }
        if (await activateCode(code)) modal.close();
    });
    body.addEventListener('click', async (e) => {
        const act = e.target.dataset.act;
        if (act === 'whatsapp') {
            const text = `Hola, quiero activar MelaminaCut Pro (${c.moneda} ${c.precioMensual}/mes o ${c.moneda} ${c.precioAnual}/año). Adjunto el comprobante de pago. Mi nombre / taller: `;
            openExternal(`https://wa.me/${c.whatsappVentas.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`);
        } else if (act === 'remove') {
            const ok = await confirmDialog('Se quitará la licencia de este equipo. Podrás volver a activarla con el mismo código.', { title: 'Quitar licencia', okLabel: 'Quitar' });
            if (!ok) return;
            try { localStorage.removeItem(LICENSE_STORAGE); } catch (err) { /* sin almacenamiento */ }
            license = null;
            renderPlanBadge();
            modal.close();
        }
    });
}

// Devuelve true si se puede usar la función; si no, muestra la pantalla de Pro
export function requirePro(featureKey) {
    if (isPro()) return true;
    openUpgrade(featureKey);
    return false;
}

export async function initPlan() {
    const btn = document.getElementById('btn-plan');
    if (btn) btn.addEventListener('click', () => openUpgrade());

    let code = null;
    try { code = localStorage.getItem(LICENSE_STORAGE); } catch (e) { code = null; }
    if (code) {
        license = await verifyLicense(code, LICENSE_PUBLIC_KEY);
        if (license.valid && license.daysLeft <= RENEW_WARNING_DAYS) {
            toast(`Tu plan Pro vence en ${license.daysLeft} día(s) (${fmtDate(license.expires)}).`, {
                type: 'warn',
                action: { label: 'Renovar', onClick: () => openUpgrade() }
            });
        } else if (!license.valid && license.reason === 'vencida') {
            toast(`Tu plan Pro venció el ${fmtDate(license.expires)}. Las funciones Pro quedaron bloqueadas.`, {
                type: 'warn',
                action: { label: 'Renovar', onClick: () => openUpgrade() }
            });
        }
    }
    renderPlanBadge();
}
