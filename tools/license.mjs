#!/usr/bin/env node
// Herramienta PRIVADA para emitir licencias Pro de MelaminaCut.
//
//   npm run licencia -- claves                      Genera el par de claves (una sola vez)
//   npm run licencia -- emitir --nombre "Ana Pérez" --meses 1
//   npm run licencia -- emitir --nombre "Taller Sol" --anual
//   npm run licencia -- emitir --nombre "Juan" --hasta 2026-12-31
//   npm run licencia -- verificar <código>
//
// La clave privada queda en tools/keys/ (ignorada por git). Si la pierdes no podrás emitir
// códigos válidos para esta versión; si se filtra, cualquiera podrá crearlos. Haz una copia segura.

import { generateKeyPairSync, createPrivateKey, sign, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyLicense } from '../js/license.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const KEYS_DIR = join(ROOT, 'tools', 'keys');
const PRIVATE_KEY = join(KEYS_DIR, 'license-private.pem');
const LEDGER = join(KEYS_DIR, 'licencias-emitidas.csv');
const PUBLIC_KEY_JS = join(ROOT, 'js', 'license-key.js');

const b64url = buf => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const isoDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function arg(name) {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? process.argv[i + 1] : undefined;
}

function fail(msg) {
    console.error(`Error: ${msg}`);
    process.exit(1);
}

function writePublicKeyModule(spkiB64) {
    writeFileSync(PUBLIC_KEY_JS,
        `// Clave pública para verificar licencias Pro (generada con: npm run licencia -- claves).\n` +
        `// Es pública a propósito: solo sirve para verificar, no para crear códigos.\n` +
        `export const LICENSE_PUBLIC_KEY = '${spkiB64}';\n`);
}

function keygen() {
    if (existsSync(PRIVATE_KEY) && !process.argv.includes('--forzar')) {
        fail(`ya existe ${PRIVATE_KEY}. Regenerar invalida TODAS las licencias emitidas; si es lo que quieres usa --forzar.`);
    }
    const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    mkdirSync(KEYS_DIR, { recursive: true });
    writeFileSync(PRIVATE_KEY, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
    writePublicKeyModule(publicKey.export({ type: 'spki', format: 'der' }).toString('base64'));
    console.log(`Clave privada: ${PRIVATE_KEY}  (NO la subas a git; guarda una copia segura)`);
    console.log(`Clave pública escrita en: ${PUBLIC_KEY_JS}`);
}

function expiryFromArgs() {
    const hasta = arg('hasta');
    if (hasta) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(hasta)) fail('--hasta debe tener formato AAAA-MM-DD');
        return hasta;
    }
    const meses = process.argv.includes('--anual') ? 12 : Number(arg('meses') || 1);
    if (!(meses >= 1 && meses <= 60)) fail('--meses debe estar entre 1 y 60');
    const d = new Date();
    d.setMonth(d.getMonth() + meses);
    return isoDate(d);
}

async function issue() {
    if (!existsSync(PRIVATE_KEY)) fail('primero genera las claves: npm run licencia -- claves');
    const nombre = (arg('nombre') || '').trim();
    if (!nombre) fail('falta --nombre "Nombre del cliente"');

    const data = { p: 'pro', n: nombre, e: expiryFromArgs(), i: isoDate(new Date()), id: randomBytes(4).toString('hex') };
    const signed = `MC1.${b64url(JSON.stringify(data))}`;
    const key = createPrivateKey(readFileSync(PRIVATE_KEY));
    // ieee-p1363 = firma r||s de 64 bytes, el formato que verifica WebCrypto en el navegador
    const signature = sign('sha256', Buffer.from(signed), { key, dsaEncoding: 'ieee-p1363' });
    const code = `${signed}.${b64url(signature)}`;

    const { LICENSE_PUBLIC_KEY } = await import(`../js/license-key.js?t=${Date.now()}`);
    const check = await verifyLicense(code, LICENSE_PUBLIC_KEY);
    if (!check.valid) fail(`el código no verifica con js/license-key.js (${check.reason}). ¿Cambiaste las claves?`);

    if (!existsSync(LEDGER)) appendFileSync(LEDGER, 'emitida;cliente;vence;id\n');
    appendFileSync(LEDGER, `${data.i};${nombre.replace(/;/g, ',')};${data.e};${data.id}\n`);

    console.log(`\nLicencia Pro para ${nombre} — vence ${data.e}\n`);
    console.log(code);
    console.log(`\nEl cliente la pega en "Pasar a Pro" → "Activar código". Registro: ${LEDGER}`);
}

async function verify() {
    const code = process.argv[3];
    if (!code) fail('uso: npm run licencia -- verificar <código>');
    const { LICENSE_PUBLIC_KEY } = await import('../js/license-key.js');
    console.log(await verifyLicense(code, LICENSE_PUBLIC_KEY));
}

const cmd = process.argv[2];
if (cmd === 'claves') keygen();
else if (cmd === 'emitir') await issue();
else if (cmd === 'verificar') await verify();
else {
    console.log('Comandos: claves | emitir --nombre "..." [--meses N | --anual | --hasta AAAA-MM-DD] | verificar <código>');
}
