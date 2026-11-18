package com.finanzas.companion

import android.content.ComponentName
import android.content.Intent
import android.provider.Settings
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONObject

@CapacitorPlugin(name = "LocalCaptures")
class LocalCapturesPlugin : Plugin() {
    private val captureStore: CaptureStore by lazy {
        CaptureStore(getContext().applicationContext)
    }

    override fun load() {
        CaptureEvents.onChanged = {
            notifyListeners(
                "capturesChanged",
                JSObject().apply { put("updated", true) }
            )
        }
    }

    override fun handleOnDestroy() {
        CaptureEvents.onChanged = null
        super.handleOnDestroy()
    }

    @PluginMethod
    fun getCaptureState(call: PluginCall) {
        try {
            val context = getContext()
            val enabledListeners = Settings.Secure.getString(
                context.contentResolver,
                "enabled_notification_listeners"
            ).orEmpty()

            val permissionEnabled = enabledListeners
                .split(":")
                .mapNotNull(ComponentName::unflattenFromString)
                .any { it.packageName == context.packageName }

            val rows = JSArray()
            captureStore.readAll().forEach { capture ->
                val sources = JSArray()
                capture.sources.sortedBy { it.ordinal }.forEach { source ->
                    sources.put(source.label)
                }

                val row = JSObject().apply {
                    put("id", capture.id)
                    put("merchant", capture.merchant)
                    put("amountCents", capture.amountCents)
                    put("currencyCode", capture.currencyCode)
                    put("occurredAtMillis", capture.occurredAtMillis)
                    put("accountName", capture.accountName)
                    put("cardLast4", capture.cardLast4 ?: JSONObject.NULL)
                    put("categorySuggestion", capture.categorySuggestion ?: JSONObject.NULL)
                    put("sources", sources)
                    put("isPaired", capture.isPaired)
                }
                rows.put(row)
            }

            val result = JSObject().apply {
                put("available", true)
                put("permissionEnabled", permissionEnabled)
                put("captures", rows)
                put("syncEnabled", true)
            }
            call.resolve(result)
        } catch (error: Exception) {
            call.reject("No se pudieron leer las capturas locales.", error)
        }
    }

    @PluginMethod
    fun openNotificationSettings(call: PluginCall) {
        try {
            getActivity().startActivity(
                Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
            )
            call.resolve()
        } catch (error: Exception) {
            call.reject("No se pudieron abrir los ajustes de notificaciones.", error)
        }
    }

    @PluginMethod
    fun openAppNotificationSettings(call: PluginCall) {
        try {
            val context = getContext()
            val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
            }
            getActivity().startActivity(intent)
            call.resolve()
        } catch (error: Exception) {
            call.reject("No se pudieron abrir los ajustes de notificaciones de Finanzas.", error)
        }
    }

    @PluginMethod
    fun clearCaptures(call: PluginCall) {
        try {
            captureStore.clear()
            call.resolve(JSObject().apply { put("success", true) })
        } catch (error: Exception) {
            call.reject("No se pudieron borrar las capturas locales.", error)
        }
    }
}
