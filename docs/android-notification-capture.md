# Finanzas-ui: contrato de captura de notificaciones Android

## Estado de Preview

- La APK 1.0.3-preview captura únicamente notificaciones de Revolut y Google Wallet en Android.
- El lector local extrae comercio, importe, moneda EUR, fecha, cuenta Revolut, categoría sugerida y últimos cuatro dígitos si Wallet los incluye.
- La cola local se conserva cifrada con Android Keystore.
- La sincronización autenticada con Finanzas está activa en Preview.
- La tabla remota `notification_capture_events` está separada de las tablas de movimientos y protegida por RLS por usuario.
- La sincronización no crea movimientos financieros ni cambia saldos.

## Ejemplo de referencia validado

La captura muestra dos notificaciones de la misma compra:

- Google Wallet: título `SUPERMERCADO ALTET`; texto `2,50 € con Revolut Visa ••0733`.
- Revolut: título `Supermercado Altet`; texto `Has pagado 2,50 € en Supermercado Altet`, seguido de `Saldo del Pocket EUR: 0,34 €`.

Datos comunes extraídos: comercio Supermercado Altet, importe 2,50 EUR, cuenta Revolut, canal de pago Google Wallet, tarjeta Visa terminada en 0733 y categoría sugerida Alimentación. El saldo de Pocket (0,34 EUR) no es un importe de compra y nunca se importa como gasto.

Los dos avisos se emparejan como un solo pago si coinciden comercio, importe y moneda dentro de una ventana máxima de tres minutos. Aunque se emparejen, permanecen pendientes de revisión y nunca se contabilizan automáticamente.

## Fuentes permitidas

- Revolut: fuente principal del importe, comercio y cuenta.
- Google Wallet: señal complementaria para identificar el canal de pago y los últimos cuatro dígitos de la tarjeta.
- No leer, almacenar ni transmitir notificaciones de otras aplicaciones.

El servicio Android filtra por identificadores de paquete verificados:
- Revolut: `com.revolut.revolut`
- Google Wallet: `com.google.android.apps.walletnfcrel`

## Principios de seguridad

- Usar Android `NotificationListenerService`, con autorización explícita del usuario en Ajustes.
- No solicitar permisos de SMS, contactos, accesibilidad, llamadas ni lectura de otras notificaciones.
- No incluir claves de Supabase de servicio en la aplicación Android.
- Enviar eventos únicamente con la sesión autenticada del propietario de Finanzas.
- Transmitir solo los campos de compra interpretados; no enviar el cuerpo original de la notificación.
- El servidor genera la huella de deduplicación con el identificador del usuario, la captura local y la aplicación de origen.
- Guardar como máximo los últimos cuatro dígitos de la tarjeta; nunca el número completo.
- Las tablas del buzón aplican RLS por usuario.
- No escribir ni actualizar `transactions`, `accounts`, ingresos, gastos ni saldos durante la sincronización.

## Contrato de sincronización

La APK invoca la Edge Function:

`notification-capture-sync`

La función requiere un JWT de usuario válido (`verify_jwt=true`) y comprueba la sesión con Supabase Auth. Las consultas e inserciones utilizan el JWT del usuario; no usan `service_role`.

Cuerpo simplificado:

```json
{
  "captures": [
    {
      "id": "UUID-generado-en-el-teléfono",
      "merchant": "Supermercado Altet",
      "amountCents": 250,
      "currencyCode": "EUR",
      "occurredAtMillis": 1794955320000,
      "accountName": "Revolut",
      "cardLast4": "0733",
      "categorySuggestion": "Alimentación",
      "sources": ["Revolut", "Google Wallet"],
      "isPaired": true
    }
  ]
}
```

No se transmite `notificationKeys`, el identificador interno del aviso de Android, el saldo del Pocket ni el texto completo original. El backend valida los campos, genera huellas SHA-256 y realiza un upsert idempotente en `notification_capture_events`.

## Flujo de una compra

1. Android recibe un aviso de Revolut o Google Wallet.
2. El servicio verifica el paquete de origen antes de leer el aviso.
3. El parser extrae el importe y el comercio; el saldo del Pocket se descarta.
4. Los avisos de ambas aplicaciones se emparejan en el dispositivo si coinciden comercio, importe y moneda dentro de tres minutos.
5. Finanzas sincroniza las capturas al abrir la APK, cuando entra un nuevo aviso mientras está activa y al volver a primer plano.
6. Los avisos de origen se guardan con la misma clave de agrupación y huellas únicas por aplicación.
7. La página Capturas automáticas muestra una sola compra si los dos avisos se han emparejado.
8. La compra queda en la bandeja como pendiente de revisión. No se crea ninguna transacción hasta una futura confirmación explícita.

## Tablas

La migración `20261117180000_merchant_lookup_and_notification_inbox` crea:
- `merchant_category_rules`
- `merchant_lookup_cache`
- `notification_capture_events`

Son tablas aditivas. No modifican registros financieros existentes. La creación de la bandeja se aplicó y verificó en el proyecto Supabase activo conectado a la APK; los registros de pagos nuevos solo se escribirán cuando el usuario use la versión Preview y se produzca una captura válida.
