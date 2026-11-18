package com.finanzas.companion

import android.os.Bundle
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(LocalCapturesPlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
