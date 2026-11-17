# Finanzas-ui: contrato de captura de notificaciones Android

## Estado

Preparación de Preview. Todavía no existe un APK instalado ni se leen notificaciones del teléfono. La captura real se habilitará después de inspeccionar una notificación de Revolut y otra de Google Wallet en el POCO F8 Pro.

## Fuentes permitidas

- Revolut: fuente principal del importe y del comercio.
- Google Wallet: señal complementaria para reconocer que el pago se hizo desde el móvil.
- No leer, almacenar ni transmitir notificaciones de otras aplicaciones.

El servicio Android deberá filtrar por los identificadores de paquete verificados en el dispositivo, no por el texto visible o el nombre del icono.

## Principios de seguridad

- Usar Android NotificationListenerService, con autorización explícita del usuario en Ajustes.
- No solicitar permisos de SMS, contactos, accesibilidad, llamadas ni lectura de otras notificaciones.
- No incluir claves de Supabase de servicio en la aplicación Android.
- Enviar eventos únicamente con la sesión autenticada del propietario de Finanzas.
- Limitar el contenido conservado al título, texto, aplicación y hora de la notificación.
- La captura no crea por sí sola un gasto contabilizado ni cambia saldos.
- Deduplicar notificaciones repetidas de una misma aplicación y después reconciliar Revolut/Wallet por importe, comercio y proximidad temporal.

## Contrato previsto

La aplicación Android enviará un POST autenticado a:

`/api/gastos?resource=notification-captures`

Cuerpo:

```json
{
  "sourceApp": "revolut",
  "packageName": "identificador.verificado.de.la.app",
  "title": "Título de la notificación",
  "text": "Texto completo de la notificación",
  "occurredAt": "2026-11-17T18:00:00.000Z"
}
```

`sourceApp` solo admite `revolut` o `google_wallet`. El backend genera la huella de deduplicación; no se confía en una huella calculada por el teléfono.

## Flujo de un pago

1. El servicio recibe una notificación de Revolut y una de Wallet.
2. Envía los dos eventos permitidos.
3. Finanzas intenta extraer comercio, importe, moneda y hora.
4. Busca una regla de comercio propia.
5. Si no existe, permite una búsqueda manual en OpenStreetMap con atribución y caché.
6. Un comercio desconocido queda para revisión y aprendizaje.
7. Los eventos no se contabilizan automáticamente hasta que se valide el formato y la regla de confirmación del usuario.

## Dependencia de datos

La migración `20261117180000_merchant_lookup_and_notification_inbox.sql` añade tablas nuevas, con RLS por usuario. La migración se deja pendiente y no se aplica durante esta fase de Preview para no modificar el esquema de la base activa.
