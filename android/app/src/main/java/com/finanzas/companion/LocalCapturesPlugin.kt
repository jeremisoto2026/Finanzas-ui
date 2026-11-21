package com.finanzas.companion

import android.content.ComponentName
import android.content.Intent
import android.provider.Settings
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
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
    private val incomeCaptureStore: IncomeCaptureStore by lazy {
        IncomeCaptureStore(getContext().applicationContext)
    }
    private val authRepository: SupabaseAuthRepository by lazy {
        SupabaseAuthRepository(getContext().applicationContext)
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
                val sourceApps = JSArray()
                val sourceDetails = JSArray()
                capture.sources.sortedBy { it.sourceApp }.forEach { source ->
                    sources.put(source.label)
                    sourceApps.put(source.sourceApp)
                    sourceDetails.put(JSObject().apply {
                        put("sourceApp", source.sourceApp)
                        put("packageName", source.packageName)
                        put("label", source.label)
                        put("isWallet", source.isWallet)
                    })
                }

                val row = JSObject().apply {
                    put("id", capture.id)
                    put("merchant", capture.merchant)
                    put("amountCents", capture.amountCents)
                    put("currencyCode", capture.currencyCode)
                    put("occurredAtMillis", capture.occurredAtMillis)
                    put("accountName", capture.accountName ?: JSONObject.NULL)
                    put("categorySuggestion", capture.categorySuggestion ?: JSONObject.NULL)
                    put("sources", sources)
                    put("sourceApps", sourceApps)
                    put("sourceDetails", sourceDetails)
                    put("isPaired", capture.isPaired)
                }
                rows.put(row)
            }

            val incomeRows = JSArray()
            incomeCaptureStore.readAll().forEach { candidate ->
                incomeRows.put(JSObject().apply {
                    put("id", candidate.id)
                    put("sourceApp", candidate.source.sourceApp)
                    put("sourceLabel", candidate.source.label)
                    put("packageName", candidate.source.packageName)
                    put("amountCents", candidate.amountCents ?: JSONObject.NULL)
                    put("currencyCode", candidate.currencyCode)
                    put("occurredAtMillis", candidate.occurredAtMillis)
                    put("reason", candidate.reason)
                })
            }

            val result = JSObject().apply {
                put("available", true)
                put("permissionEnabled", permissionEnabled)
                put("captures", rows)
                put("incomeCandidates", incomeRows)
                put("syncEnabled", true)
            }
            call.resolve(result)
        } catch (error: Exception) {
            call.reject("No se pudieron leer las capturas locales.", error)
        }
    }

    @PluginMethod
    fun signInWithGoogle(call: PluginCall) {
        val activity = getActivity()
        val googleOption = GetGoogleIdOption.Builder()
            .setFilterByAuthorizedAccounts(false)
            .setServerClientId(BuildConfig.GOOGLE_WEB_CLIENT_ID)
            .build()
        val request = GetCredentialRequest.Builder()
            .addCredentialOption(googleOption)
            .build()

        CoroutineScope(SupervisorJob() + Dispatchers.Main).launch {
            try {
                val result = CredentialManager.create(activity).getCredential(
                    context = activity,
                    request = request
                )
                val credential = result.credential
                if (credential !is CustomCredential ||
                    credential.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
                ) {
                    call.reject("Google no devolvió una credencial de inicio de sesión válida.")
                    return@launch
                }

                val googleCredential = GoogleIdTokenCredential.createFrom(credential.data)
                val idToken = googleCredential.idToken
                if (idToken.isBlank()) {
                    call.reject("Google devolvió un token vacío.")
                    return@launch
                }
                // The ID token is passed directly to Supabase Auth and is never logged or stored.
                call.resolve(JSObject().apply { put("idToken", idToken) })
            } catch (error: Exception) {
                call.reject(
                    error.message?.takeIf { it.isNotBlank() }
                        ?: "No se pudo iniciar sesión con Google en este dispositivo.",
                    error
                )
            }
        }
    }

    @PluginMethod
    fun updateAuthSession(call: PluginCall) {
        try {
            authRepository.persistSession(
                userId = call.getString("userId").orEmpty(),
                email = call.getString("email").orEmpty(),
                accessToken = call.getString("accessToken").orEmpty(),
                refreshToken = call.getString("refreshToken").orEmpty(),
                expiresAtMillis = call.getLong("expiresAtMillis") ?: 0L
            )
            CaptureSyncScheduler.enqueue(getContext().applicationContext)
            call.resolve(JSObject().apply { put("success", true) })
        } catch (error: Exception) {
            call.reject("No se pudo preparar la sincronización segura.", error)
        }
    }

    @PluginMethod
    fun clearAuthSession(call: PluginCall) {
        try {
            authRepository.signOut()
            CaptureSyncScheduler.cancel(getContext().applicationContext)
            call.resolve(JSObject().apply { put("success", true) })
        } catch (error: Exception) {
            call.reject("No se pudo cerrar la sesión nativa.", error)
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
    fun showRegisteredExpenses(call: PluginCall) {
        try {
            val expenses = call.getArray("expenses")
            var processed = 0
            if (expenses != null) {
                for (index in 0 until expenses.length()) {
                    val expense = expenses.optJSONObject(index) ?: continue
                    ExpenseRegisteredNotifier.show(getContext().applicationContext, expense)
                    processed += 1
                }
            }
            call.resolve(JSObject().apply { put("processed", processed) })
        } catch (error: Exception) {
            call.reject("No se pudieron mostrar las confirmaciones de gastos.", error)
        }
    }

    @PluginMethod
    fun clearCaptures(call: PluginCall) {
        try {
            captureStore.clear()
            incomeCaptureStore.clear()
            call.resolve(JSObject().apply { put("success", true) })
        } catch (error: Exception) {
            call.reject("No se pudieron borrar las capturas locales.", error)
        }
    }
}
