package com.finanzas.companion

import android.content.Intent
import android.os.Bundle
import androidx.core.view.WindowCompat
import com.getcapacitor.BridgeActivity
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions

class MainActivity : BridgeActivity() {
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
        super.onCreate(savedInstanceState)
        WindowCompat.getInsetsController(window, window.decorView).apply {
            isAppearanceLightStatusBars = false
            isAppearanceLightNavigationBars = false
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        NotificationNavigationStore.save(this, intent)
    }
}
