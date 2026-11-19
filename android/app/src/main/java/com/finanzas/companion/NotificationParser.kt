package com.finanzas.companion

import java.util.Locale

enum class NotificationSource(
    val packageName: String,
    val label: String,
    val accountName: String?,
    val isBank: Boolean
) {
    REVOLUT("com.revolut.revolut", "Revolut", "Revolut", true),
    BBVA("com.bbva.bbvacontigo", "BBVA", "BBVA", true),
    GOOGLE_WALLET("com.google.android.apps.walletnfcrel", "Google Wallet", null, false);

    companion object {
        fun fromPackage(packageName: String): NotificationSource? =
            entries.firstOrNull { it.packageName == packageName }
    }
}

data class ParsedPayment(
    val source: NotificationSource,
    val merchant: String,
    val merchantKey: String,
    val amountCents: Long,
    val currencyCode: String = "EUR",
    val occurredAtMillis: Long,
    val accountName: String?,
    val cardLast4: String? = null,
    val categorySuggestion: String? = null,
    val notificationKey: String? = null
)

object NotificationParser {
    private val revolutPayment = Regex(
        """has\s+pagado\s+([\d.,]+)\s*(?:€|EUR)\s+en\s+(.+?)(?=\r?\n|saldo del pocket|saldo disponible|⚠|🔨|⚒|$)""",
        RegexOption.IGNORE_CASE
    )
    private val walletPayment = Regex(
        """([\d.,]+)\s*(?:€|EUR)\s+(?:con\s+.+|en\s+.+)""",
        RegexOption.IGNORE_CASE
    )
    private val walletIssuer = Regex(
        """\bcon\s+(Revolut|BBVA)\b""",
        RegexOption.IGNORE_CASE
    )
    private val amountPattern = Regex(
        """([\d.,]+)\s*(?:€|EUR)""",
        RegexOption.IGNORE_CASE
    )
    private val bbvaPurchaseSignal = Regex(
        """\b(compra|compraste|pago con tarjeta|pago realizado|compra realizada|operaci[oó]n de tarjeta)\b""",
        RegexOption.IGNORE_CASE
    )
    private val bbvaMerchant = Regex(
        """\b(?:en|a)\s+(.+?)(?=\r?\n|saldo|\s+tarjeta|$)""",
        RegexOption.IGNORE_CASE
    )
    private val genericNotificationTitle = Regex(
        """^(bbva|notificaci[oó]n|compra|pago|google wallet|wallet|revolut)$""",
        RegexOption.IGNORE_CASE
    )
    private val cardEnding = Regex(
        """(?:visa|mastercard|maestro|amex)\s*[•·*\s]*([0-9]{4})""",
        RegexOption.IGNORE_CASE
    )

    fun parse(
        source: NotificationSource,
        title: String?,
        text: String?,
        occurredAtMillis: Long,
        notificationKey: String? = null
    ): ParsedPayment? {
        val heading = title.orEmpty().trim()
        val body = text.orEmpty().trim()
        if (heading.isBlank() && body.isBlank()) return null

        val amountText: String
        val merchant: String
        val cardLast4: String?

        val accountName: String?

        when (source) {
            NotificationSource.REVOLUT -> {
                val match = revolutPayment.find(body) ?: return null
                amountText = match.groupValues[1]
                merchant = cleanMerchant(match.groupValues[2])
                cardLast4 = null
                accountName = "Revolut"
            }
            NotificationSource.BBVA -> {
                val combined = "$heading\n$body"
                if (!bbvaPurchaseSignal.containsMatchIn(combined)) return null
                val match = amountPattern.find(body) ?: return null
                amountText = match.groupValues[1]
                val merchantMatch = bbvaMerchant.find(body)
                val headingMerchant = heading.takeIf {
                    it.isNotBlank() && !genericNotificationTitle.matches(it.trim())
                }
                merchant = cleanMerchant(merchantMatch?.groupValues?.getOrNull(1) ?: headingMerchant.orEmpty())
                cardLast4 = cardEnding.find(combined)?.groupValues?.getOrNull(1)
                accountName = "BBVA"
            }
            NotificationSource.GOOGLE_WALLET -> {
                val combined = "$heading\n$body"
                val match = walletPayment.find(combined) ?: return null
                amountText = match.groupValues[1]
                val walletMerchant = Regex(
                    """\b(?:en|at)\s+(.+?)(?=\r?\n|$)""",
                    RegexOption.IGNORE_CASE
                ).find(combined)?.groupValues?.getOrNull(1)
                merchant = cleanMerchant(heading.takeIf {
                    it.isNotBlank() && !genericNotificationTitle.matches(it.trim())
                } ?: walletMerchant.orEmpty())
                cardLast4 = cardEnding.find(combined)?.groupValues?.getOrNull(1)
                accountName = walletIssuer.find(combined)?.groupValues?.getOrNull(1)?.let {
                    if (it.equals("BBVA", true)) "BBVA" else "Revolut"
                }
            }
        }

        val cents = parseAmountToCents(amountText) ?: return null
        val key = normalizeMerchantKey(merchant)
        if (merchant.length < 2 || key.isBlank()) return null

        return ParsedPayment(
            source = source,
            merchant = merchant,
            merchantKey = key,
            amountCents = cents,
            occurredAtMillis = occurredAtMillis,
            accountName = accountName,
            cardLast4 = cardLast4,
            categorySuggestion = suggestCategory(merchant),
            notificationKey = notificationKey
        )
    }

    fun normalizeMerchantKey(value: String): String {
        return value
            .uppercase(Locale.ROOT)
            .replace(
                Regex("\\b(?:COMPRA|TARJETA|PAGO|PAGADO|PAYMENT|CONTACTLESS|TPV|POS|REVOLUT|GOOGLE|WALLET)\\b"),
                " "
            )
            .replace(Regex("[^\\p{L}\\p{N}]+"), " ")
            .replace(Regex("\\b\\d{2,}\\b"), " ")
            .trim()
            .replace(Regex("\\s+"), " ")
    }

    private fun cleanMerchant(value: String): String {
        return value
            .lineSequence()
            .firstOrNull()
            .orEmpty()
            .replace(Regex("(?i)^(?:compra|pago|has pagado|pago con tarjeta|compra realizada)(?:\\s+(?:en|de))?\\s*"), "")
            .replace(Regex("[^\\p{L}\\p{N} .&'’()-]"), " ")
            .replace(Regex("\\s+"), " ")
            .trim()
            .take(160)
    }

    private fun parseAmountToCents(value: String): Long? {
        val source = value.replace(" ", "")
        if (source.isBlank()) return null

        val normalized = when {
            source.contains(',') -> source.replace(".", "").replace(',', '.')
            source.count { it == '.' } > 1 -> {
                val lastDot = source.lastIndexOf('.')
                source.substring(0, lastDot).replace(".", "") + source.substring(lastDot)
            }
            else -> source
        }

        val amount = normalized.toBigDecimalOrNull() ?: return null
        if (amount <= java.math.BigDecimal.ZERO) return null
        return try {
            amount.movePointRight(2).setScale(0, java.math.RoundingMode.HALF_UP).longValueExact()
        } catch (_: ArithmeticException) {
            null
        }
    }

    private fun suggestCategory(merchant: String): String? {
        val normalized = normalizeMerchantKey(merchant)
        val supermarketTerms = listOf(
            "SUPERMERCADO", "HIPERMERCADO", "MERCADONA", "LIDL", "ALDI",
            "CONSUM", "CARREFOUR", "EROSKI", "ALCAMPO", " DIA ", "SPAR"
        )
        if (supermarketTerms.any { term ->
                if (term.startsWith(" ") || term.endsWith(" ")) {
                    " $normalized ".contains(term)
                } else {
                    normalized.contains(term)
                }
            }) return "Alimentación"

        if (normalized.contains("FARMACIA") || normalized.contains("PHARMACY")) {
            return "Salud e higiene"
        }
        return null
    }
}
