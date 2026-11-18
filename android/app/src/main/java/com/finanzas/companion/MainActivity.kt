package com.finanzas.companion

import android.os.Bundle
import androidx.activity.EdgeToEdge
import androidx.core.view.WindowCompat
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        EdgeToEdge.enable(this)
        registerPlugin(LocalCapturesPlugin::class.java)
        super.onCreate(savedInstanceState)
        WindowCompat.getInsetsController(window, window.decorView).apply {
            isAppearanceLightStatusBars = false
            isAppearanceLightNavigationBars = false
        }
    }
}
