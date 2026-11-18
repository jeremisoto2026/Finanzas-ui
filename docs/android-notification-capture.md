# Finanzas-ui: contrato de captura de notificaciones Android

## Estado

Preparación de Preview. El formato de las notificaciones reales ya se ha identificado con una captura del teléfono del 17 de noviembre de 2026. Todavía no hay un lector Android instalado ni se reciben eventos directamente desde el dispositivo.

## Ejemplo de referencia validado

La captura muestra dos notificaciones de la misma compra:

- Google Wallet: título `SUPERMERCADO ALTET`; texto `2,50 € con Revolut Visa ••0733`.
- Revolut: título `Supermercado Altet`; texto `Has pagado 2,50 € en Supermercado Altet`, seguido de `Saldo del Pocket EUR: 0,34 €`.

Datos comunes extraídos: comercio Supermercado Altet, importe 2,50 EUR, cuenta Revolut, canal de pago Google Wallet, tarjeta Visa terminada en 0733 y categoría sugerida Alimentación. El saldo de Pocket (0,34 EUR) no es un importe de compra y nunca se debe importar como gasto.

Los dos avisos deben emparejarse como un solo pago si coinciden comercio, importe, moneda y hora (ventana máxima de tres minutos). Aunque se emparejen, permanecen pendientes de revisión y no crean automáticamente un movimiento del libro mayor.

## Fuentes permitidas

- Revolut: fuente principal del importe, comercio y cuenta.
- Google Wallet: señal complementaria para identificar el canal de pago y los últimos cuatro dígitos de la tarjeta.
- No leer, almacenar ni transmitir notificaciones de otras aplicaciones.

El servicio Android deberá filtrar por identificadores de paquete verificados en el dispositivo, no por el texto visible o el nombre del icono. La captura de pantalla no muestra esos identificadores técnicos; se deberán comprobar en el lector Android.

## Principios de seguridad

- Usar Android NotificationListenerService, con autorización explícita del usuario en Ajustes.
- No solicitar permisos de SMS, contactos, accesibilidad, llamadas ni lectura de otras notificaciones.
- No incluir claves de Supabase de servicio en la aplicación Android.
- Enviar eventos únicamente con la sesión autenticada del propietario de Finanzas.
- Limitar el contenido conservado al título, texto, aplicación y hora de la notificación.
- El servidor genera la huella de deduplicación.
- No registrar el saldo del Pocket como movimiento ni gasto.
- No crear gastos ni cambiar saldos a partir de una notificación pendiente.
- Guardar como máximo los últimos cuatro dígitos de la tarjeta; nunca el número completo.

## Contrato previsto

La aplicación Android enviará un POST autenticado a:

`/api/gastos?resource=notification-captures`

Cuerpo:

```json
{
  "sourceApp": "revolut",
  "packageName": "identificador.verificado.de.la.app",
  "title": "Supermercado Altet",
  "text": "Has pagado 2,50 € en Supermercado Altet",
  "occurredAt": "2026-11-17T22:42:00.000Z"
}
```

`sourceApp` solo admite `revolut` o `google_wallet`. El paquete debe corresponder realmente a la aplicación de origen. El cliente envía la fecha/hora del aviso y el backend calcula la huella y los campos interpretados.

## Flujo de un pago

1. El servicio recibe una notificación de Revolut y otra de Google Wallet.
2. Envía ambos eventos por separado.
3. Finanzas extrae comercio, importe, moneda, hora, cuenta, canal y últimos cuatro dígitos cuando existan.
4. Busca primero una regla de comercio confirmada.
5. Si no existe una regla, puede consultar una ficha de OpenStreetMap desde el buscador manual.
6. Una coincidencia entre avisos de apps distintas se une por comercio, importe, moneda y proximidad temporal.
7. El evento conjunto queda como `paired`; un evento aislado reconocido queda como `needs_review`.
8. Ningún evento crea por sí solo una transacción `posted`.

## Dependencia de datos

La migración `20261117180000_merchant_lookup_and_notification_inbox.sql` añade las tablas de memoria, caché y buzón de notificaciones con RLS por usuario. Durante la preparación de Preview la migración queda pendiente y no se aplica a la base activa para no modificar el esquema de los datos financieros existentes.
