# Finanzas · Conector personal Android

## Alcance

- Aplicación privada de Preview para Android.
- Reconoce Revolut, BBVA y Google Wallet con identificadores históricos estables.
- Acepta como fuentes bancarias candidatas las aplicaciones Android no pertenecientes al sistema y excluye una lista de paquetes no financieros conocidos.
- Las fuentes desconocidas se identifican con `android:<package>` y la etiqueta visible de la aplicación; no necesitan una plantilla de frases específica del banco.
- El parser busca importes EUR, señales de cargo/compra/pago y el comercio; descarta OTP, avisos de seguridad y publicidad. Los avisos ambiguos o sin comercio se descartan o quedan para revisión, según el caso.
- El usuario vincula una aplicación bancaria con una única cuenta por defecto de Finanzas.
- Extrae localmente importe, comercio, moneda y hora. No extrae ni conserva datos de tarjetas.
- Empareja avisos de banco y Google Wallet por importe exacto, comercio y cercanía temporal (hasta tres minutos).
- Conserva las capturas localmente cifradas con Android Keystore.
- No transmite el texto original de las notificaciones ni lee avisos de otras aplicaciones.

## Asignación automática

- Un aviso de una app bancaria vinculada se registra en la cuenta configurada para esa app, incluidas futuras fuentes `android:<package>`.
- Si llega también Google Wallet, ambas notificaciones se emparejan por importe exacto, comercio normalizado y proximidad de hasta tres minutos, y se contabilizan como un solo gasto.
- Si solo llega Wallet, se usa el banco emisor cuando está identificado o la única vinculación bancaria configurada.
- Cuando el banco no puede determinarse de forma única, la compra queda pendiente de revisión.
- Los gastos automáticos usan una clave idempotente para evitar duplicados.

## Inicio de sesión y permisos

La pantalla permite iniciar sesión con la cuenta existente de Finanzas. Los tokens de sesión se cifran con Android Keystore. Android exige que el usuario active manualmente el acceso a notificaciones en Ajustes.

La URL de Supabase y la publishable key son configuración pública del cliente. No se incluye ninguna clave `service_role` o secreta en el APK.

## Compilar APK de prueba

Desde esta carpeta, con JDK 17, Android SDK 35 y Gradle 8.10.2:

```bash
gradle --no-daemon :app:testDebugUnitTest :app:assembleDebug
```

El APK de depuración estará en:

`app/build/outputs/apk/debug/app-debug.apk`

El workflow Android de GitHub Actions compila y publica el APK como artefacto del flujo. No crea una versión de Google Play.

## Sincronización de Preview

- La APK sincroniza la cola local cifrada al abrir Finanzas, al recibir avisos nuevos y al volver a primer plano.
- La Edge Function `notification-capture-sync` valida el JWT del usuario y aplica RLS.
- Las capturas tienen una huella por usuario, identificador local y app emisora.
- Los avisos compatibles se asignan directamente a la cuenta vinculada; los ambiguos pasan a la bandeja de revisión.
- La persistencia no contiene números o sufijos de tarjetas ni el texto original de las notificaciones.
