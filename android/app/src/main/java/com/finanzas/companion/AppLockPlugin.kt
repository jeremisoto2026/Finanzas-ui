package com.finanzas.companion

import android.app.KeyguardManager
import android.os.Build
import androidx.biometric.BiometricManager
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "AppLock")
class AppLockPlugin : Plugin() {
    private val authenticators: Int
        get() = BiometricManager.Authenticators.BIOMETRIC_STRONG or
            BiometricManager.Authenticators.DEVICE_CREDENTIAL

    @PluginMethod
    fun getStatus(call: PluginCall) {
        val manager = BiometricManager.from(context)
        val keyguard = context.getSystemService(KeyguardManager::class.java)
        val secureDevice = keyguard?.isDeviceSecure == true
        val result = manager.canAuthenticate(authenticators)
        val supported = secureDevice && result == BiometricManager.BIOMETRIC_SUCCESS
        val biometricAvailable = manager.canAuthenticate(
            BiometricManager.Authenticators.BIOMETRIC_STRONG
        ) == BiometricManager.BIOMETRIC_SUCCESS

        call.resolve(JSObject().apply {
            put("enabled", AppLockStore.isEnabled(context))
            put("supported", supported)
            put("biometricAvailable", biometricAvailable)
            put("deviceCredentialAvailable", secureDevice)
            put("reason", when {
                !secureDevice -> "Configura primero un PIN, patrón o contraseña de bloqueo en Android."
                result == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED ->
                    "Registra una huella en los ajustes de Android o utiliza el bloqueo del dispositivo."
                result == BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE ->
                    "Este dispositivo no dispone de un autenticador compatible."
                result == BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE ->
                    "El autenticador no está disponible en este momento."
                !supported -> "El dispositivo no permite activar el bloqueo seguro."
                else -> ""
            })
        })
    }

    @PluginMethod
    fun setEnabled(call: PluginCall) {
        val enabled = call.getBoolean("enabled")
            ?: return call.reject("Falta indicar si el bloqueo estará activado.")

        if (enabled) {
            val manager = BiometricManager.from(context)
            val keyguard = context.getSystemService(KeyguardManager::class.java)
            val secureDevice = keyguard?.isDeviceSecure == true
            val result = manager.canAuthenticate(authenticators)
            if (!secureDevice || result != BiometricManager.BIOMETRIC_SUCCESS) {
                return call.reject(
                    "No se puede activar el bloqueo. Configura un PIN, patrón o contraseña del dispositivo y registra una huella si está disponible."
                )
            }
        }

        AppLockStore.setEnabled(context, enabled)
        call.resolve(JSObject().apply {
            put("enabled", enabled)
            put("success", true)
        })
    }
}
