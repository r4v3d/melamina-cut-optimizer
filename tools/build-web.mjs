// Copia la app web a www/ para empaquetarla en Android con Capacitor (npm run android:sync).
// La app no usa bundler: solo se copian los archivos que se publican.
import { cpSync, rmSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'www');

const FILES = ['index.html', 'style.css', 'manifest.webmanifest', 'sw.js'];
const DIRS = ['icons', 'js', 'vendor'];

rmSync(out, { recursive: true, force: true });
mkdirSync(out);
for (const f of FILES) cpSync(join(root, f), join(out, f));
for (const d of DIRS) {
    cpSync(join(root, d), join(out, d), {
        recursive: true,
        filter: src => !src.endsWith('.test.js') && !src.endsWith('README.md')
    });
}
console.log('App web copiada a www/');
