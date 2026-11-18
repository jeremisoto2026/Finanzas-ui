# Finanzas · Conector personal Android

## Alcance de esta primera versión

- Prototipo privado para el POCO F8 Pro.
- No se publica en Google Play ni se distribuye a otros usuarios.
- Solo procesa los paquetes Android verificados de Revolut y Google Wallet:
  - Revolut: `com.revolut.revolut`
  - Google Wallet: `com.google.android.apps.walletnfcrel`
- No lee el contenido de notificaciones de otras aplicaciones.
- Reconoce importe, comercio, tarjeta (solo últimos cuatro dígitos) y hora cuando aparecen en el aviso.
- Agrupa los dos avisos de una compra si coinciden comercio, importe y hora dentro de tres minutos.
- Conserva las capturas localmente cifradas con una clave Android Keystore.
- Sincroniza a Finanzas únicamente las capturas ya interpretadas (comercio, importe, fecha, cuenta, origen, últimos cuatro dígitos y categoría sugerida), usando la sesión autenticada de la cuenta.
- No transmite el texto completo de las notificaciones ni notificaciones de otras aplicaciones.
- Las compras se guardan en una bandeja independiente, pendientes de revisión. **No crea gastos ni modifica saldos automáticamente.**

## Inicio de sesión

La pantalla permite iniciar sesión con la cuenta que ya existe en Finanzas. La contraseña solo se usa para el inicio de sesión y no se guarda. Los tokens de sesión se cifran con Android Keystore.

La URL de Supabase y la publishable key son configuración pública del cliente. No hay ninguna clave `service_role` ni secreta en el APK.

## Permiso del teléfono

Android exige que el usuario active manualmente el acceso a notificaciones en Ajustes. El servicio verifica primero el paquete de origen y solo después lee título y texto de los dos paquetes permitidos.

## Compilar APK de prueba

Desde esta carpeta, con JDK 17, Android SDK 35 y Gradle 8.10.2:

```bash
gradle --no-daemon :app:testDebugUnitTest :app:assembleDebug
```

El APK de depuración estará en:

`app/build/outputs/apk/debug/app-debug.apk`

El workflow `Android companion CI` compila y publica el APK como artefacto privado del flujo de GitHub Actions. No crea una versión de Google Play.

## Sincronización de capturas (Preview)

- La APK sincroniza la cola local cifrada al abrir Finanzas, al entrar una captura nueva mientras la app está activa y al volver a primer plano.
- La sincronización llama a la Edge Function autenticada `notification-capture-sync` con JWT y `verify_jwt=true`.
- El servidor valida el usuario y escribe únicamente en `notification_capture_events`, una tabla independiente protegida con RLS por propietario.
- La huella por usuario, captura y aplicación hace que los reintentos sean idempotentes. Si Revolut y Google Wallet se emparejan, se muestran como una sola compra.
- No hay escrituras en `transactions`, `accounts`, ingresos, gastos ni saldos durante la sincronización.
- Las capturas locales se conservan cifradas en el teléfono; no se borran después de sincronizar.
- La bandeja permite revisar lo recibido, pero la confirmación para crear un gasto se implementará y probará en una fase separada.
