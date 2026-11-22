package com.finanzas.companion

import android.content.Intent
import android.os.Bundle
import androidx.core.view.WindowCompat
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
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
