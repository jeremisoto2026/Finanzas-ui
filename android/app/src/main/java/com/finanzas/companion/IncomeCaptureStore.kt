package com.finanzas.companion

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

data class LocalIncomeCandidate(
    val id: String,
    val source: NotificationSource,
    val amountCents: Long?,
    val currencyCode: String,
    val occurredAtMillis: Long,
    val reason: String,
    val notificationKey: String?,
    val suggestedCategory: String?,
    val classificationConfidence: Double
)

class IncomeCaptureStore(context: Context) {
    private val encrypted = EncryptedPreferences(
        context = context,
        namespace = "finanzas_local_income_candidates",
        keyAlias = "finanzas_local_income_candidates_v1"
    )

    @Synchronized
    fun add(
        source: NotificationSource,
        classification: IncomeNoticeClassification,
        occurredAtMillis: Long,
        notificationKey: String?
    ): Boolean {
        val items = readAll().toMutableList()
        val duplicate = items.any { item ->
            item.source.sourceApp == source.sourceApp &&
                ((!notificationKey.isNullOrBlank() && item.notificationKey == notificationKey) ||
                    (item.amountCents == classification.amountCents &&
                        kotlin.math.abs(item.occurredAtMillis - occurredAtMillis) <= DUPLICATE_WINDOW_MS))
        }
        if (duplicate) return false

        items.add(0, LocalIncomeCandidate(
            id = UUID.randomUUID().toString(),
            source = source,
            amountCents = classification.amountCents,
            currencyCode = "EUR",
            occurredAtMillis = occurredAtMillis,
            reason = classification.reason.take(240),
            notificationKey = notificationKey,
            suggestedCategory = classification.suggestedCategory,
            classificationConfidence = classification.classificationConfidence.coerceIn(0.0, 1.0)
        ))
        persist(items)
        return true
    }

    @Synchronized
    fun readAll(): List<LocalIncomeCandidate> {
        val raw = encrypted.getString(KEY) ?: return emptyList()
        return try {
            val array = JSONArray(raw)
            buildList {
                for (index in 0 until array.length()) {
                    val item = array.optJSONObject(index) ?: continue
                    val source = NotificationSource.fromPersisted(
                        sourceApp = item.optString("sourceApp"),
                        packageName = item.optString("packageName"),
                        label = item.optString("label")
                    ) ?: continue
                    add(LocalIncomeCandidate(
                        id = item.optString("id"),
                        source = source,
                        amountCents = if (item.isNull("amountCents")) null else item.optLong("amountCents"),
                        currencyCode = item.optString("currencyCode", "EUR"),
                        occurredAtMillis = item.optLong("occurredAtMillis"),
                        reason = item.optString("reason", "Posible ingreso pendiente de revisión"),
                        notificationKey = item.optString("notificationKey").takeIf { it.isNotBlank() && it != "null" },
                        suggestedCategory = item.optString("suggestedCategory").takeIf { it.isNotBlank() && it != "null" },
                        classificationConfidence = item.optDouble("classificationConfidence", 0.0).coerceIn(0.0, 1.0)
                    ))
                }
            }.sortedByDescending { it.occurredAtMillis }
        } catch (_: Exception) {
            emptyList()
        }
    }

    @Synchronized
    fun clear() {
        encrypted.remove(KEY)
    }

    private fun persist(items: List<LocalIncomeCandidate>) {
        val array = JSONArray()
        items.sortedByDescending { it.occurredAtMillis }.take(MAX_LOCAL_CANDIDATES).forEach { item ->
            array.put(JSONObject()
                .put("id", item.id)
                .put("sourceApp", item.source.sourceApp)
                .put("packageName", item.source.packageName)
                .put("label", item.source.label)
                .put("amountCents", item.amountCents ?: JSONObject.NULL)
                .put("currencyCode", item.currencyCode)
                .put("occurredAtMillis", item.occurredAtMillis)
                .put("reason", item.reason)
                .put("notificationKey", item.notificationKey ?: JSONObject.NULL)
                .put("suggestedCategory", item.suggestedCategory ?: JSONObject.NULL)
                .put("classificationConfidence", item.classificationConfidence))
        }
        encrypted.putString(KEY, array.toString())
    }

    companion object {
        private const val KEY = "income_candidates"
        private const val MAX_LOCAL_CANDIDATES = 100
        // Covers Android reposts that arrive with a refreshed notification key/post time.
        private const val DUPLICATE_WINDOW_MS = 2 * 60 * 1000L
    }
}
