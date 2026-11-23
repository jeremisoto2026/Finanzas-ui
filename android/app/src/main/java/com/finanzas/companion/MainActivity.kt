package com.finanzas.companion

import android.content.Intent
import android.os.Bundle
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import com.getcapacitor.BridgeActivity
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions

class MainActivity : BridgeActivity() {
    private var appLockAuthenticated = false
    private var appLockPromptShowing = false

    override fun onCreate(savedInstanceState: Bundle?) {
        // Ensure Firebase Messaging has a default app before Capacitor can invoke
        // PushNotificationsPlugin.register() on its plugin thread.
        FirebaseApp.initializeApp(this) ?: FirebaseApp.initializeApp(
            this,
            FirebaseOptions.Builder()
                .setApplicationId("1:591403777520:android:63c9929a808049e82b3135")
                .setApiKey("AIzaSyAGTUjB735Hhu7K20i9fe6fDwJtnmPONGs")
                .setProjectId("finanzas-515300")
                .setGcmSenderId("591403777520")
                .build(),
        )

        NotificationNavigationStore.save(this, intent)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        registerPlugin(LocalCapturesPlugin::class.java)
        registerPlugin(BankAppAuthorizationPlugin::class.java)
        registerPlugin(AppLockPlugin::class.java)
        super.onCreate(savedInstanceState)
        WindowCompat.getInsetsController(window, window.decorView).apply {
            isAppearanceLightStatusBars = false
            isAppearanceLightNavigationBars = false
        }
    }

    override fun onResume() {
        super.onResume()
        enforceAppLock()
    }

    override fun onStop() {
        // Require authentication again whenever Finanzas leaves the foreground.
        // Do not reset while Android's biometric / device-credential prompt is open.
        if (!appLockPromptShowing) appLockAuthenticated = false
        super.onStop()
    }

    private fun enforceAppLock() {
        if (!AppLockStore.isEnabled(this)) {
            appLockAuthenticated = true
            return
        }
        val authenticators =
            androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG or
                androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL
        val authenticationStatus = androidx.biometric.BiometricManager.from(this)
            .canAuthenticate(authenticators)
        val deviceSecure = getSystemService(android.app.KeyguardManager::class.java)
            ?.isDeviceSecure == true
        if (!deviceSecure ||
            authenticationStatus == androidx.biometric.BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED ||
            authenticationStatus == androidx.biometric.BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE ||
            authenticationStatus == androidx.biometric.BiometricManager.BIOMETRIC_ERROR_UNSUPPORTED) {
            // Avoid permanently locking the owner out if the device security method
            // was removed after app lock had been enabled. The owner can enable it again.
            AppLockStore.setEnabled(this, false)
            appLockAuthenticated = true
            return
        }
        if (appLockAuthenticated || appLockPromptShowing) return

        appLockPromptShowing = true
        val prompt = BiometricPrompt(
            this,
            ContextCompat.getMainExecutor(this),
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    appLockPromptShowing = false
                    appLockAuthenticated = true
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    appLockPromptShowing = false
                    appLockAuthenticated = false
                    // Keep protected financial screens out of view after cancellation or
                    // an unrecoverable authentication error. Returning to Finanzas prompts again.
                    moveTaskToBack(true)
                }
            },
        )

        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Desbloquear Finanzas")
            .setSubtitle("Confirma tu identidad para acceder a tus datos")
            .setAllowedAuthenticators(
                androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG or
                    androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL,
            )
            .setConfirmationRequired(false)
            .build()

        try {
            prompt.authenticate(promptInfo)
        } catch (_: Exception) {
            appLockPromptShowing = false
            appLockAuthenticated = false
            moveTaskToBack(true)
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        NotificationNavigationStore.save(this, intent)
    }
}
