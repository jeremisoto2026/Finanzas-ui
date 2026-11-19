package com.finanzas.companion

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit

class NotificationCaptureSyncWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        try {
            val captures = CaptureStore(applicationContext).readAll()
            if (captures.isEmpty()) return@withContext Result.success()

            val token = SupabaseAuthRepository(applicationContext).validAccessTokenForFutureSync()
                ?: return@withContext Result.success()

            val payload = JSONObject().put("captures", JSONArray().apply {
                captures.forEach { capture ->
                    put(JSONObject()
                        .put("id", capture.id)
                        .put("merchant", capture.merchant)
                        .put("merchantKey", capture.merchantKey)
                        .put("amountCents", capture.amountCents)
                        .put("currencyCode", capture.currencyCode)
                        .put("occurredAtMillis", capture.occurredAtMillis)
                        .put("accountName", capture.accountName ?: JSONObject.NULL)
                        .put("cardLast4", capture.cardLast4 ?: JSONObject.NULL)
                        .put("categorySuggestion", capture.categorySuggestion ?: JSONObject.NULL)
                        .put("sources", JSONArray().apply {
                            capture.sources.sortedBy { it.ordinal }.forEach { put(it.name) }
                        })
                        .put("isPaired", capture.isPaired))
                }
            })

            val connection = (URL(BuildConfig.SUPABASE_URL.trimEnd('/') +
                "/functions/v1/notification-capture-sync").openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 20_000
                readTimeout = 30_000
                doOutput = true
                setRequestProperty("apikey", BuildConfig.SUPABASE_PUBLISHABLE_KEY)
                setRequestProperty("Authorization", "Bearer $token")
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
                setRequestProperty("Accept", "application/json")
            }

            try {
                connection.outputStream.use { stream ->
                    stream.write(payload.toString().toByteArray(Charsets.UTF_8))
                }
                val status = connection.responseCode
                val responseStream = if (status in 200..299) connection.inputStream else connection.errorStream
                responseStream?.use { it.readBytes() }

                when {
                    status in 200..299 -> Result.success()
                    status == 408 || status == 429 || status >= 500 -> Result.retry()
                    else -> {
                        android.util.Log.w(
                            "FinanzasCaptureSync",
                            "La sincronización fue rechazada (HTTP $status)."
                        )
                        Result.failure()
                    }
                }
            } finally {
                connection.disconnect()
            }
        } catch (error: Exception) {
            android.util.Log.w(
                "FinanzasCaptureSync",
                "La sincronización en segundo plano se reintentará.",
                error
            )
            Result.retry()
        }
    }
}

object CaptureSyncScheduler {
    const val WORK_NAME = "finanzas-notification-capture-sync"

    fun enqueue(context: Context) {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()
        val request = OneTimeWorkRequestBuilder<NotificationCaptureSyncWorker>()
            .setConstraints(constraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context.applicationContext).enqueueUniqueWork(
            WORK_NAME,
            ExistingWorkPolicy.APPEND_OR_REPLACE,
            request
        )
    }

    fun cancel(context: Context) {
        WorkManager.getInstance(context.applicationContext).cancelUniqueWork(WORK_NAME)
    }
}
