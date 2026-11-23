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
        item.sources.any { it.sourceApp == payment.source.sourceApp } &&
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

        // Android may repost the same notice with a new notification key.
        val duplicate = items.firstOrNull { item ->
            isSameSourceDuplicate(item, payment)
        }
        if (duplicate != null) {
            return CaptureResult(duplicate, wasPaired = false, wasDuplicate = true)
        }

        val possiblePairIndexes = items.indices.filter { index ->
            val item = items[index]
            val hasWallet = item.sources.any { it.isWallet } || payment.source.isWallet
            val hasBank = item.sources.any { it.isBank } || payment.source.isBank
            val isCrossAppPair = hasWallet && hasBank &&
                item.sources.none { it.sourceApp == payment.source.sourceApp }

            // A capture may contain only one bank source; never combine two banks.
            val existingBanks = item.sources.filter { it.isBank }
            val hasConflictingBank = payment.source.isBank && existingBanks.isNotEmpty()
            item.merchantKey == payment.merchantKey &&
                item.amountCents == payment.amountCents &&
                item.currencyCode == payment.currencyCode &&
                payment.source !in item.sources &&
                isCrossAppPair &&
                !hasConflictingBank &&
                abs(item.occurredAtMillis - payment.occurredAtMillis) <= PAIR_WINDOW_MS
        }

        // Only a unique wallet/bank counterpart is paired. Identical purchases
        // close together remain separate so we never join the wrong transaction.
        if (possiblePairIndexes.size == 1) {
            val index = possiblePairIndexes.single()
            val previous = items[index]
            val walletPayment = if (payment.source.isWallet) {
                payment
            } else {
                null
            }
            val walletAlreadyStored = previous.sources.any { it.isWallet }
            val selectedMerchant = when {
                walletPayment != null -> walletPayment.merchant
                walletAlreadyStored -> previous.merchant
                else -> payment.merchant
            }
            val bankSource = previous.sources.firstOrNull { it.isBank }
                ?: payment.source.takeIf { it.isBank }
            val merged = previous.copy(
                merchant = selectedMerchant,
                merchantKey = NotificationParser.normalizeMerchantKey(selectedMerchant),
                accountName = bankSource?.label,
                categorySuggestion = payment.categorySuggestion ?: previous.categorySuggestion,
                sources = previous.sources + payment.source,
                notificationKeys = previous.notificationKeys +
                    listOfNotNull(payment.notificationKey),
                isPaired = true
            )
            items[index] = merged
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
        val captures = try {
            val array = JSONArray(raw)
            buildList {
                for (index in 0 until array.length()) {
                    val item = array.optJSONObject(index) ?: continue
                    val sourceArray = item.optJSONArray("sources") ?: JSONArray()
                    val sources = buildSet {
                        for (sourceIndex in 0 until sourceArray.length()) {
                            val sourceItem = sourceArray.opt(sourceIndex)
                            val source = when (sourceItem) {
                                is JSONObject -> NotificationSource.fromPersisted(
                                    sourceApp = sourceItem.optString("sourceApp"),
                                    packageName = sourceItem.optString("packageName").takeIf { it.isNotBlank() },
                                    label = sourceItem.optString("label").takeIf { it.isNotBlank() }
                                )
                                is String -> NotificationSource.fromPersisted(
                                    sourceApp = sourceItem,
                                    packageName = null,
                                    label = null
                                )
                                else -> null
                            }
                            source?.let(::add)
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
                                val stored = item.optString("accountName")
                                    .takeIf { it.isNotBlank() && it != "null" }
                                sources.firstOrNull { it.isBank }?.label ?: stored
                            },
                            categorySuggestion = if (item.isNull("categorySuggestion")) null
                                else item.optString("categorySuggestion").takeIf { it.isNotBlank() },
                            sources = sources,
                            notificationKeys = item.optJSONArray("notificationKeys").toStringSet(),
                            isPaired = item.optBoolean("isPaired")
                        )
                    )
                }
            }
        } catch (_: Exception) {
            emptyList()
        }

        // Rewriting also migrates old enum-name records to package-aware source records.
        persist(captures)
        return captures.sortedByDescending { it.occurredAtMillis }
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
                item.sources.forEach { source ->
                    sources.put(
                        JSONObject()
                            .put("sourceApp", source.sourceApp)
                            .put("packageName", source.packageName)
                            .put("label", source.label)
                            .put("isBank", source.isBank)
                    )
                }
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
    }
}
