package com.finanzas.companion

import android.content.Context
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL

data class CompanionUser(
    val id: String,
    val email: String
)

class SupabaseAuthRepository(context: Context) {
    private val secureStore = EncryptedPreferences(
        context = context,
        namespace = "finanzas_companion_auth",
        keyAlias = "finanzas_companion_auth_v1"
    )

    @Synchronized
    @Throws(Exception::class)
    fun signIn(email: String, password: String): CompanionUser {
        require(email.isNotBlank()) { "Escribe el correo de tu cuenta de Finanzas." }
        require(password.isNotBlank()) { "Escribe tu contraseña." }

        val response = request(
            path = "/auth/v1/token?grant_type=password",
            payload = JSONObject()
                .put("email", email.trim())
                .put("password", password)
        )

        val userJson = response.optJSONObject("user")
            ?: throw IllegalStateException("Supabase no devolvió el usuario.")
        val userId = userJson.optString("id")
        val userEmail = userJson.optString("email", email.trim())
        val accessToken = response.optString("access_token")
        val refreshToken = response.optString("refresh_token")
        val expiresIn = response.optLong("expires_in", 3600)

        if (userId.isBlank() || accessToken.isBlank() || refreshToken.isBlank()) {
            throw IllegalStateException("La respuesta de inicio de sesión está incompleta.")
        }

        val stored = JSONObject()
            .put("userId", userId)
            .put("email", userEmail)
            .put("accessToken", accessToken)
            .put("refreshToken", refreshToken)
            .put("expiresAt", System.currentTimeMillis() + expiresIn * 1000L)

        secureStore.putString(SESSION_KEY, stored.toString())
        return CompanionUser(userId, userEmail)
    }

    fun currentUser(): CompanionUser? {
        val session = readSession() ?: return null
        val id = session.optString("userId")
        val email = session.optString("email")
        if (id.isBlank()) return null
        return CompanionUser(id, email)
    }

    @Synchronized
    fun signOut() {
        secureStore.remove(SESSION_KEY)
    }

    /**
     * Reserved for the authenticated sync phase. The current prototype does not
     * send notification contents or financial events to any remote endpoint.
     */
    @Synchronized
    @Throws(Exception::class)
    fun validAccessTokenForFutureSync(): String? {
        val session = readSession() ?: return null
        val accessToken = session.optString("accessToken")
        val expiresAt = session.optLong("expiresAt")
        if (accessToken.isNotBlank() && expiresAt > System.currentTimeMillis() + 60_000L) {
            return accessToken
        }

        val refreshToken = session.optString("refreshToken")
        if (refreshToken.isBlank()) {
            signOut()
            return null
        }

        val refreshed = request(
            path = "/auth/v1/token?grant_type=refresh_token",
            payload = JSONObject().put("refresh_token", refreshToken)
        )
        val newAccess = refreshed.optString("access_token")
        val newRefresh = refreshed.optString("refresh_token")
        if (newAccess.isBlank() || newRefresh.isBlank()) {
            signOut()
            return null
        }

        session.put("accessToken", newAccess)
        session.put("refreshToken", newRefresh)
        session.put(
            "expiresAt",
            System.currentTimeMillis() + refreshed.optLong("expires_in", 3600) * 1000L
        )
        secureStore.putString(SESSION_KEY, session.toString())
        return newAccess
    }

    private fun readSession(): JSONObject? {
        val raw = secureStore.getString(SESSION_KEY) ?: return null
        return try {
            JSONObject(raw)
        } catch (_: Exception) {
            secureStore.remove(SESSION_KEY)
            null
        }
    }

    private fun request(path: String, payload: JSONObject): JSONObject {
        val connection = (URL(BuildConfig.SUPABASE_URL.trimEnd('/') + path)
            .openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 15_000
            readTimeout = 15_000
            doOutput = true
            setRequestProperty("apikey", BuildConfig.SUPABASE_PUBLISHABLE_KEY)
            setRequestProperty("Content-Type", "application/json; charset=utf-8")
            setRequestProperty("Accept", "application/json")
        }

        try {
            connection.outputStream.use { stream ->
                stream.write(payload.toString().toByteArray(Charsets.UTF_8))
            }

            val status = connection.responseCode
            val stream = if (status in 200..299) {
                connection.inputStream
            } else {
                connection.errorStream
            }
            val body = stream?.use { input ->
                BufferedReader(InputStreamReader(input, Charsets.UTF_8)).readText()
            }.orEmpty()

            if (status !in 200..299) {
                val detail = try {
                    val error = JSONObject(body)
                    error.optString("msg").ifBlank {
                        error.optString("message").ifBlank {
                            error.optString("error_description")
                        }
                    }
                } catch (_: Exception) {
                    ""
                }
                throw IllegalStateException(
                    detail.ifBlank { "No se pudo iniciar sesión (HTTP $status)." }
                )
            }

            return JSONObject(body)
        } finally {
            connection.disconnect()
        }
    }

    companion object {
        private const val SESSION_KEY = "supabase_session"
    }
}
