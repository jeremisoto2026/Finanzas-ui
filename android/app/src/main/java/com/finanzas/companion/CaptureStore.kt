package com.finanzas.companion

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import kotlin.math.abs

data class LocalCapture(
    val id: String,
    val merchant: String,
    val merchantKey: String,
    val amountCents: Long,
    val currencyCode: String,
    val occurredAtMillis: Long,
    val accountName: String?,
    val cardLast4: String?,
    val categorySuggestion: String?,
    val sources: Set<NotificationSource>,
    val notificationKeys: Set<String>,
    val isPaired: Boolean
)

data class CaptureResult(
    val capture: LocalCapture,
    val wasPaired: Boolean,
    val wasDuplicate: Boolean
)

internal fun isSameSourceDuplicate(item: LocalCapture, payment: ParsedPayment): Boolean {
    val notificationKeyMatches = !payment.notificationKey.isNullOrBlank() &&
        payment.notificationKey in item.notificationKeys
    val samePaymentArrivedAgainImmediately =
        abs(item.occurredAtMillis - payment.occurredAtMillis) <= 2_000L

    return item.merchantKey == payment.merchantKey &&
        item.amountCents == payment.amountCents &&
        item.currencyCode == payment.currencyCode &&
        payment.source in item.sources &&
        (notificationKeyMatches || samePaymentArrivedAgainImmediately)
}

class CaptureStore(context: Context) {
    private val encrypted = EncryptedPreferences(
        context = context,
        namespace = "finanzas_local_captures",
        keyAlias = "finanzas_local_captures_v1"
    )

    @Synchronized
    fun add(payment: ParsedPayment): CaptureResult {
        val items = readAll().toMutableList()

        // Android can repost the same bank alert with a new StatusBarNotification
        // key. Match the same source/merchant/amount in a short window as well
        // as an exact notification-key replay, otherwise one payment can be
        // auto-posted twice before the wallet/bank pair is even considered.
        val duplicate = items.firstOrNull { item ->
            isSameSourceDuplicate(item, payment)
        }

        if (duplicate != null) {
            return CaptureResult(duplicate, wasPaired = false, wasDuplicate = true)
        }

        val possiblePairIndexes = items.indices.filter { index ->
            val item = items[index]
            val crossAppWalletPair =
                (payment.source == NotificationSource.GOOGLE_WALLET && item.sources.any { it.isBank }) ||
                (payment.source.isBank && NotificationSource.GOOGLE_WALLET in item.sources)
            val previousBank = item.sources.firstOrNull { it.isBank }?.accountName
            val conflictingIssuer =
                (previousBank != null && payment.source.isBank && previousBank != payment.accountName) ||
                (payment.source == NotificationSource.GOOGLE_WALLET &&
                    payment.accountName != null && previousBank != null && payment.accountName != previousBank)
            item.merchantKey == payment.merchantKey &&
                item.amountCents == payment.amountCents &&
                item.currencyCode == payment.currencyCode &&
                payment.source !in item.sources &&
                crossAppWalletPair &&
                !conflictingIssuer &&
                abs(item.occurredAtMillis - payment.occurredAtMillis) <= PAIR_WINDOW_MS
        }

        // Pair only when there is exactly one possible counterpart. If two
        // purchases look identical, keep both unmatched for manual review.
        if (possiblePairIndexes.size == 1) {
            val previous = items[possiblePairIndexes.single()]
            val trustedBank = previous.sources.firstOrNull { it.isBank }?.accountName
                ?: payment.source.takeIf { it.isBank }?.accountName
            val merged = previous.copy(
                accountName = trustedBank ?: previous.accountName ?: payment.accountName,
                cardLast4 = previous.cardLast4 ?: payment.cardLast4,
                categorySuggestion = previous.categorySuggestion ?: payment.categorySuggestion,
                sources = previous.sources + payment.source,
                notificationKeys = previous.notificationKeys +
                    listOfNotNull(payment.notificationKey),
                isPaired = true
            )
            items[possiblePairIndexes.single()] = merged
            persist(items)
            return CaptureResult(merged, wasPaired = true, wasDuplicate = false)
        }

        val newItem = LocalCapture(
            id = UUID.randomUUID().toString(),
            merchant = payment.merchant,
            merchantKey = payment.merchantKey,
            amountCents = payment.amountCents,
            currencyCode = payment.currencyCode,
            occurredAtMillis = payment.occurredAtMillis,
            accountName = payment.accountName,
            cardLast4 = payment.cardLast4,
            categorySuggestion = payment.categorySuggestion,
            sources = setOf(payment.source),
            notificationKeys = listOfNotNull(payment.notificationKey).toSet(),
            isPaired = false
        )
        items.add(0, newItem)
        persist(items)
        return CaptureResult(newItem, wasPaired = false, wasDuplicate = false)
    }

    @Synchronized
    fun readAll(): List<LocalCapture> {
        val raw = encrypted.getString(KEY) ?: return emptyList()
        return try {
            val array = JSONArray(raw)
            buildList {
                for (index in 0 until array.length()) {
                    val item = array.optJSONObject(index) ?: continue
                    val sourceArray = item.optJSONArray("sources") ?: JSONArray()
                    val sources = buildSet {
                        for (sourceIndex in 0 until sourceArray.length()) {
                            NotificationSource.entries.firstOrNull {
                                it.name == sourceArray.optString(sourceIndex)
                            }?.let(::add)
                        }
                    }
                    add(
                        LocalCapture(
                            id = item.optString("id"),
                            merchant = item.optString("merchant"),
                            merchantKey = item.optString("merchantKey"),
                            amountCents = item.optLong("amountCents"),
                            currencyCode = item.optString("currencyCode", "EUR"),
                            occurredAtMillis = item.optLong("occurredAtMillis"),
                            accountName = run {
                                val stored = item.optString("accountName").takeIf { it.isNotBlank() && it != "null" }
                                if (sources.any { it.isBank }) {
                                    stored ?: sources.firstOrNull { it.isBank }?.accountName
                                } else if (NotificationSource.GOOGLE_WALLET in sources) {
                                    // Older builds incorrectly labeled Wallet-only captures as Revolut.
                                    null
                                } else stored
                            },
                            cardLast4 = if (item.isNull("cardLast4")) null else item.optString("cardLast4").takeIf { it.isNotBlank() },
                            categorySuggestion = if (item.isNull("categorySuggestion")) null else item.optString("categorySuggestion").takeIf { it.isNotBlank() },
                            sources = sources,
                            notificationKeys = item.optJSONArray("notificationKeys").toStringSet(),
                            isPaired = item.optBoolean("isPaired")
                        )
                    )
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

    private fun persist(items: List<LocalCapture>) {
        val array = JSONArray()
        items.sortedByDescending { it.occurredAtMillis }
            .take(MAX_LOCAL_CAPTURES)
            .forEach { item ->
                val sources = JSONArray()
                item.sources.forEach { sources.put(it.name) }
                val keys = JSONArray()
                item.notificationKeys.forEach { keys.put(it) }

                array.put(
                    JSONObject()
                        .put("id", item.id)
                        .put("merchant", item.merchant)
                        .put("merchantKey", item.merchantKey)
                        .put("amountCents", item.amountCents)
                        .put("currencyCode", item.currencyCode)
                        .put("occurredAtMillis", item.occurredAtMillis)
                        .put("accountName", item.accountName ?: JSONObject.NULL)
                        .put("cardLast4", item.cardLast4 ?: JSONObject.NULL)
                        .put("categorySuggestion", item.categorySuggestion ?: JSONObject.NULL)
                        .put("sources", sources)
                        .put("notificationKeys", keys)
                        .put("isPaired", item.isPaired)
                )
            }
        encrypted.putString(KEY, array.toString())
    }

    private fun JSONArray?.toStringSet(): Set<String> {
        if (this == null) return emptySet()
        return buildSet {
            for (index in 0 until this@toStringSet.length()) {
                this@toStringSet.optString(index).takeIf { it.isNotBlank() }?.let(::add)
            }
        }
    }

    companion object {
        private const val KEY = "captures"
        private const val MAX_LOCAL_CAPTURES = 100
        private const val PAIR_WINDOW_MS = 3 * 60 * 1000L
        private const val SAME_SOURCE_DUPLICATE_WINDOW_MS = 2 * 1000L
    }
}
