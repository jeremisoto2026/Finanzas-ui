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
- **No envía notificaciones a Internet, no crea gastos y no modifica saldos en esta fase.**

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

## Próxima fase (no incluida en el modo local)

Después de validar el filtro y el reconocimiento en el POCO, se diseñará la sincronización autenticada con Finanzas. Esa fase necesitará una migración y un endpoint del backend; no está activada ahora para mantener intactos los datos financieros existentes.
