package com.finanzas.companion

import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "BankAppAuthorization")
class BankAppAuthorizationPlugin : Plugin() {
    private val store by lazy { BankAppAuthorizationStore(context.applicationContext) }

    @PluginMethod fun getApps(call: PluginCall) {
        try {
            val pm = context.packageManager
            val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
            val resolved = if (Build.VERSION.SDK_INT >= 33) {
                pm.queryIntentActivities(intent, PackageManager.ResolveInfoFlags.of(0))
            } else {
                @Suppress("DEPRECATION")
                pm.queryIntentActivities(intent, 0)
            }
            val authorized = store.authorizedPackages()
            val rows = JSArray()
            resolved.mapNotNull { item ->
                val app = item.activityInfo?.applicationInfo ?: return@mapNotNull null
                if (app.packageName == context.packageName) return@mapNotNull null
                val label = pm.getApplicationLabel(app)?.toString()?.trim().orEmpty()
                if (label.isBlank()) null else Triple(app.packageName, label, app.packageName in authorized)
            }.distinctBy { it.first }.sortedBy { it.second.lowercase(java.util.Locale.ROOT) }
                .forEach { (pkg, label, enabled) -> rows.put(JSObject().apply {
                    put("packageName", pkg); put("label", label); put("authorized", enabled)
                }) }
            call.resolve(JSObject().apply {
                put("apps", rows)
                put("authorizedPackages", JSArray().apply { authorized.sorted().forEach(::put) })
            })
        } catch (error: Exception) { call.reject("No se pudieron consultar las aplicaciones visibles.", error) }
    }

    @PluginMethod fun setAuthorizedPackages(call: PluginCall) {
        try {
            val input = call.getArray("packages") ?: throw IllegalArgumentException("Falta la lista de aplicaciones.")
            val selected = buildSet { for (i in 0 until input.length()) {
                val pkg = input.optString(i).trim(); if (pkg.isNotBlank()) add(pkg)
            } }
            store.setAuthorizedPackages(selected)
            call.resolve(JSObject().apply {
                put("success", true)
                put("authorizedPackages", JSArray().apply { store.authorizedPackages().sorted().forEach(::put) })
            })
        } catch (error: Exception) { call.reject("No se pudieron guardar las autorizaciones.", error) }
    }
}