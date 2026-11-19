# Finanzas-ui: captura automática de notificaciones Android

## Funcionamiento en Preview

Finanzas reconoce avisos compatibles de Revolut, BBVA y Google Wallet mediante el identificador del paquete de Android. El usuario concede el permiso de notificaciones del sistema y después vincula cada aplicación bancaria con una cuenta de Finanzas.

La configuración es directa: **una aplicación bancaria → una cuenta de Finanzas por defecto**. No se solicitan ni se guardan datos de tarjetas bancarias. El sistema interpreta localmente el aviso y sincroniza únicamente el comercio, importe, moneda, fecha, aplicación de origen y categoría sugerida. El texto original del aviso no se transmite ni se conserva en el buzón remoto.

## Identificación de la aplicación

El servicio Android comprueba el paquete de origen antes de leer el aviso:

- Revolut: `com.revolut.revolut`
- BBVA: `com.bbva.bbvacontigo`
- Google Wallet: `com.google.android.apps.walletnfcrel`

Las aplicaciones no incluidas en esta lista se ignoran. Google Wallet es una fuente complementaria; las apps bancarias son las que determinan la cuenta de destino.

## Emparejamiento y registro

Dos avisos representan la misma compra cuando coinciden el importe exacto, el comercio normalizado y la moneda, y llegan dentro de una ventana máxima de tres minutos. Si hay más de una coincidencia posible, no se elige al azar: la compra queda pendiente de revisión.

El comportamiento de asignación es:

1. Aviso bancario de Revolut o BBVA: se registra directamente en la cuenta vinculada a esa aplicación.
2. Aviso de banco y Google Wallet: se agrupan como una compra y se usa la cuenta de la aplicación bancaria.
3. Aviso de Wallet sin aviso bancario: se usa el emisor explícito si Wallet lo identifica; si no, solo se asigna automáticamente cuando existe una única aplicación bancaria vinculada.
4. Si hay varias cuentas bancarias vinculadas y Wallet no permite identificar el banco, la compra queda pendiente de revisión para evitar asignaciones incorrectas.

La creación del gasto requiere una cuenta activa y una categoría válida. Se usa la categoría sugerida cuando existe; en caso contrario se utiliza una categoría de gastos disponible, como «Otros». La clave idempotente impide que una repetición del mismo aviso cree otro gasto.

## Privacidad y seguridad

- El permiso de lectura de notificaciones lo concede el usuario desde los ajustes de Android.
- Se procesan únicamente los paquetes de Revolut, BBVA y Google Wallet.
- El texto original de la notificación se interpreta localmente y no se sincroniza.
- No se extraen, solicitan, envían ni almacenan sufijos o números de tarjetas.
- La cola local permanece cifrada con Android Keystore. Al leer capturas guardadas por versiones anteriores, la APK nueva reescribe la cola sin el campo retirado.
- La Edge Function valida la sesión del usuario y usa su JWT con RLS; no usa la clave `service_role`.
- Los gastos automáticos se insertan en el libro de movimientos con una clave idempotente. Las capturas ambiguas permanecen en la bandeja de revisión.

## Contrato de sincronización

La APK invoca la Edge Function autenticada:

`notification-capture-sync`

El cuerpo contiene únicamente campos interpretados:

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
      "categorySuggestion": "Alimentación",
      "sources": ["revolut", "google_wallet"],
      "isPaired": true
    }
  ]
}
```

No se transmite el título o cuerpo original, identificadores internos de Android ni datos de tarjetas. El backend genera huellas SHA-256 por usuario, captura y aplicación, y actualiza los eventos de forma idempotente.

## Persistencia

- `account_notification_sources`: una vinculación por usuario y aplicación bancaria.
- `notification_capture_events`: bandeja y trazabilidad mínima de origen, comercio, importe y hora.
- `transactions`: gastos contabilizados cuando la cuenta y categoría se resuelven automáticamente o tras revisión del usuario.

Las tablas están protegidas mediante RLS por usuario. La migración de retirada de datos antiguos elimina los campos heredados de sufijos y limpia el texto completo que pudiera haberse almacenado en capturas históricas.
