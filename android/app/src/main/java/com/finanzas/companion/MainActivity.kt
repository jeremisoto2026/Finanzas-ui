package com.finanzas.companion

import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import com.getcapacitor.BridgeActivity
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions

class MainActivity : BridgeActivity() {
    private var appLockAuthenticated = false
    private var appLockPromptShowing = false
    private var appLockCover: View? = null

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

    private fun coverProtectedContent() {
        if (appLockCover != null) return
        val decor = window.decorView as? ViewGroup ?: return
        val density = resources.displayMetrics.density
        fun dp(value: Int) = (value * density).toInt()
        val cover = FrameLayout(this).apply {
            background = GradientDrawable(
                GradientDrawable.Orientation.TL_BR,
                intArrayOf(Color.rgb(8, 15, 28), Color.rgb(10, 25, 39), Color.rgb(8, 15, 28)),
            )
            isClickable = true
            isFocusable = true
            importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
            contentDescription = "Finanzas protegida. Autentícate para continuar."
        }
        val brand = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(dp(28), dp(24), dp(28), dp(24))
        }
        val mark = ImageView(this).apply {
            setImageResource(com.finanzas.companion.R.drawable.finanzas_lock_mark)
            contentDescription = null
            scaleType = ImageView.ScaleType.FIT_CENTER
        }
        brand.addView(mark, LinearLayout.LayoutParams(dp(92), dp(92)).apply {
            bottomMargin = dp(22)
        })
        val name = TextView(this).apply {
            text = "Finanzas"
            setTextColor(Color.WHITE)
            textSize = 29f
            letterSpacing = 0.015f
            typeface = Typeface.create("sans-serif", Typeface.BOLD)
            gravity = Gravity.CENTER
        }
        brand.addView(name, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT,
        ))
        val accent = View(this).apply {
            background = GradientDrawable(
                GradientDrawable.Orientation.LEFT_RIGHT,
                intArrayOf(Color.rgb(110, 231, 183), Color.rgb(16, 185, 129), Color.rgb(251, 191, 36)),
            ).apply { cornerRadius = dp(3).toFloat() }
        }
        brand.addView(accent, LinearLayout.LayoutParams(dp(54), dp(3)).apply {
            topMargin = dp(15)
            bottomMargin = dp(17)
        }.also { it.gravity = Gravity.CENTER_HORIZONTAL })
        val subtitle = TextView(this).apply {
            text = "Tu información financiera, protegida"
            setTextColor(Color.rgb(148, 163, 184))
            textSize = 13f
            gravity = Gravity.CENTER
        }
        brand.addView(subtitle, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT,
        ))
        cover.addView(brand, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
            Gravity.CENTER,
        ))
        appLockCover = cover
        decor.addView(
            cover,
            ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            ),
        )
        cover.bringToFront()
    }

    private fun revealProtectedContent() {
        val decor = window.decorView as? ViewGroup
        appLockCover?.let { decor?.removeView(it) }
        appLockCover = null
    }

    private fun enforceAppLock() {
        if (!AppLockStore.isEnabled(this)) {
            appLockAuthenticated = true
            revealProtectedContent()
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
            revealProtectedContent()
            return
        }
        if (appLockAuthenticated || appLockPromptShowing) return

        // Cover the WebView before Android displays its biometric sheet so no part
        // of the financial dashboard can remain visible behind the system prompt.
        coverProtectedContent()
        appLockPromptShowing = true
        val prompt = BiometricPrompt(
            this,
            ContextCompat.getMainExecutor(this),
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    appLockPromptShowing = false
                    appLockAuthenticated = true
                    revealProtectedContent()
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    appLockPromptShowing = false
                    appLockAuthenticated = false
                    // Keep protected financial screens covered after cancellation or
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
