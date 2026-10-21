# MelaminaCut para Android

La app Android es la misma app web empaquetada con [Capacitor](https://capacitorjs.com):
funciona sin conexión (los archivos van dentro del APK) y guarda los datos en el teléfono.

## Obtener el APK sin instalar nada

Cada push a `main` (o "Run workflow" en la pestaña **Actions → Android** de GitHub) compila
el APK. Descárgalo desde la ejecución, en **Artifacts → melaminacut-debug-apk**, pásalo al
celular y ábrelo (Android pedirá permitir "instalar apps de origen desconocido").

## Compilar en tu PC

Requiere Node 22, **JDK 21** y Android Studio (Android SDK 36).

```bash
npm install
npm run android:sync   # copia la app web a www/ y la sincroniza con android/
npm run android:open   # abre Android Studio: Run ▶ para instalar en el celular
```

Después de cambiar algo en la app web, vuelve a ejecutar `npm run android:sync`.

## Publicar en Google Play

1. Crea la clave de firma (una sola vez; guárdala bien, sin ella no se puede actualizar la app):
   `keytool -genkeypair -v -keystore melaminacut.keystore -alias melaminacut -keyalg RSA -keysize 2048 -validity 10000`
2. En GitHub → Settings → Secrets and variables → Actions, crea:
   `ANDROID_KEYSTORE_BASE64` (el archivo en base64: `base64 -w0 melaminacut.keystore`),
   `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
3. El workflow generará también **melaminacut-release** con el `.aab` para subir a Play Console.
4. Antes de cada versión nueva sube `versionCode` y `versionName` en `app/build.gradle`.

El identificador de la app es `com.melaminacut.app` (`capacitor.config.json`); no se puede
cambiar después de publicarla.

## Diferencias con la versión web

- "Descargar PDF/CSV/imagen" abre el menú **Compartir** de Android (Guardar en Drive/Archivos,
  WhatsApp, correo...).
- "Imprimir reporte" genera el PDF (el WebView de Android no imprime directamente).
- El botón **Atrás** cierra ventanas y el Modo Taller antes de salir de la app.
