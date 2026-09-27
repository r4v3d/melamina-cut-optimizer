# Vender MelaminaCut Pro (licencias sin servidor)

## 1. Una sola vez
1. Completa tus datos de pago en `js/app/plan-config.js`: Yape, titular, cuenta bancaria y WhatsApp de ventas. Solo se muestran los campos que tengan valor.
2. La clave privada está en `tools/keys/license-private.pem`, que **no se sube a git**. Guarda una copia segura (USB o gestor de contraseñas):
   - si la pierdes, no podrás emitir códigos para esta versión;
   - si se filtra, cualquiera podrá crearlos.

## 2. Cada venta
1. El cliente paga por Yape o transferencia y te envía la captura por WhatsApp.
2. Emite su código:
   ```bash
   npm run licencia -- emitir --nombre "Nombre o taller del cliente" --meses 1
   npm run licencia -- emitir --nombre "Taller Sol" --anual
   npm run licencia -- emitir --nombre "Juan" --hasta 2026-12-31
   ```
3. Envíale el código (empieza con `MC1.`). Lo pega en **Pasar a Pro → Código de licencia → Activar**.
4. Cada código queda anotado en `tools/keys/licencias-emitidas.csv`.

Para revisar un código que te envíen: `npm run licencia -- verificar <código>`.

## Renovaciones
Emite un código nuevo con la nueva fecha. La app avisa 5 días antes del vencimiento y bloquea las funciones Pro cuando vence.

## Límites de este esquema
- La verificación ocurre en el navegador. Frena el uso casual, pero alguien con conocimientos podría modificar la app.
- Un código sirve en varios equipos. Para controlar dispositivos o cobrar automáticamente, más adelante hará falta un backend (por ejemplo Supabase con Mercado Pago).
- `npm run licencia -- claves --forzar` genera claves nuevas e **invalida todos los códigos emitidos**. Úsalo solo si la clave privada se filtró.
