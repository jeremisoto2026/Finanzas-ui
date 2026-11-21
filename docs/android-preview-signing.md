# Firma estable de APKs de Preview para Finanzas

## Por qué se requiere

Las APKs de CI ya no deben usar la clave Android Debug que GitHub Actions genera automáticamente en cada runner. Esa clave cambia entre ejecuciones y Android rechaza una actualización cuando el certificado de la APK nueva no coincide con el de la instalada.

El repositorio no guarda el keystore ni su contraseña. La clave privada se conserva únicamente en los secretos de GitHub Actions.

## Crear una clave persistente una sola vez en Windows

Abre PowerShell en un equipo con JDK instalado (Android Studio incluye uno) y ejecuta:

```powershell
keytool -genkeypair -v `
  -keystore "$HOME\finanzas-preview-signing.jks" `
  -storetype JKS `
  -alias finanzas-preview `
  -keyalg RSA -keysize 3072 -validity 10000 `
  -dname "CN=Finanzas Preview, OU=Android, O=Finanzas, C=ES"
```

Guarda la contraseña del almacén y la contraseña de la clave en un gestor seguro. Se puede utilizar la misma para ambas cuando keytool lo solicite. No compartas el archivo JKS ni su contraseña.

Convierte el archivo a Base64 para crear el secreto correspondiente:

```powershell
$bytes = [System.IO.File]::ReadAllBytes("$HOME\finanzas-preview-signing.jks")
[System.Convert]::ToBase64String($bytes) | Set-Clipboard
```

## Crear secretos de GitHub Actions

En GitHub abre el repositorio **Finanzas-ui** → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**. Crea:

| Secret | Valor |
|---|---|
| `FINANZAS_PREVIEW_KEYSTORE_BASE64` | El Base64 copiado en el portapapeles |
| `FINANZAS_PREVIEW_KEYSTORE_PASSWORD` | Contraseña del almacén JKS |
| `FINANZAS_PREVIEW_KEY_ALIAS` | `finanzas-preview` |
| `FINANZAS_PREVIEW_KEY_PASSWORD` | Contraseña de la clave |

No introduzcas esos valores en archivos del repositorio ni en el código fuente. Cuando estén configurados, vuelve a ejecutar el workflow **Android APK CI** desde Actions o sube un nuevo commit a la rama Preview.

## Primera instalación después del cambio

La clave antigua de las APKs generadas en runners temporales ya no está disponible. Por eso no se puede firmar una APK nueva con el certificado antiguo. Para cambiar a la nueva clave persistente habrá que desinstalar una sola vez la APK antigua e instalar la nueva APK firmada con esta identidad.

Antes de desinstalar:

1. En Finanzas → Ajustes → Compras pendientes, pulsa **Sincronizar ahora**.
2. Comprueba que aparece el mensaje **Sincronización completada** y que las compras pendientes de revisión siguen visibles en la bandeja.
3. Verifica que los movimientos registrados aparecen en Gastos.

Los movimientos, cuentas y demás datos que ya se sincronizaron están en Supabase Preview. La desinstalación sí borra los datos locales cifrados del teléfono, incluida cualquier captura que todavía no haya llegado al servidor; por eso es importante sincronizar antes.

A partir de la primera instalación firmada con el nuevo JKS, las siguientes APKs de Preview usarán el mismo certificado y podrán actualizarse encima sin desinstalar.
