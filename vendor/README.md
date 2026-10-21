# Dependencias locales (sin CDN)

Copias locales para que la app funcione sin conexión en el taller.

| Archivo | Origen | Versión | Licencia |
|---|---|---|---|
| `jspdf/jspdf.umd.min.js` | paquete npm `jspdf` (`dist/`) | 2.5.1 | MIT (`jspdf/LICENSE`) |
| `fonts/outfit-*.woff2` | Google Fonts, Outfit (fuente variable, subconjuntos latin y latin-ext) | v15 | SIL Open Font License 1.1 |
| `fonts/plus-jakarta-sans-*.woff2` | Google Fonts, Plus Jakarta Sans (fuente variable, subconjuntos latin y latin-ext) | v12 | SIL Open Font License 1.1 |

Texto de la licencia OFL: https://openfontlicense.org

Para actualizar jsPDF: `npm pack jspdf@<versión>` y copiar `package/dist/jspdf.umd.min.js`.
| `capacitor/core.js` | paquete npm `@capacitor/core` (`dist/index.js`) | 8.5.3 | MIT |

`capacitor/core.js` solo se carga dentro de la app Android (ver `js/app/native.js`).
Al actualizar Capacitor: `cp node_modules/@capacitor/core/dist/index.js vendor/capacitor/core.js`.
