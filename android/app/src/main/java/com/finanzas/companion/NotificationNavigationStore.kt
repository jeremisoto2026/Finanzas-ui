package com.finanzas.companion

import android.content.Context
import android.content.Intent
import org.json.JSONObject

/** Stores notification navigation until the authenticated WebView is ready. */
internal object NotificationNavigationStore {
    private const val PREFS = "finanzas_notification_navigation"
    private const val KEY_ROUTE = "route"

    fun save(context: Context, intent: Intent?) {
        val route = intent?.getStringExtra("finanzas_route")?.trim().orEmpty()
        if (route.isBlank()) return
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_ROUTE, route)
            .putString("item_id", intent?.getStringExtra("finanzas_item_id").orEmpty())
            .putString("merchant", intent?.getStringExtra("finanzas_merchant").orEmpty())
            .putLong("amount_cents", intent?.getLongExtra("finanzas_amount_cents", 0L) ?: 0L)
            .apply()
    }

    @Synchronized
    fun consume(context: Context): JSONObject? {
        val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val route = prefs.getString(KEY_ROUTE, null)?.takeIf { it.isNotBlank() } ?: return null
        val payload = JSONObject()
            .put("route", route)
            .put("itemId", prefs.getString("item_id", "").orEmpty())
            .put("merchant", prefs.getString("merchant", "").orEmpty())
            .put("amountCents", prefs.getLong("amount_cents", 0L))
        prefs.edit().clear().apply()
        return payload
    }
}
