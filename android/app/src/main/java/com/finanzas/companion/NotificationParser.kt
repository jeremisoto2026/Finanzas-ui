package com.finanzas.companion

import java.util.Locale

data class NotificationSource(
    val sourceApp: String,
    val packageName: String,
    val label: String,
    val isBank: Boolean
) {
    val isWallet: Boolean
        get() = sourceApp == GOOGLE_WALLET_KEY

    companion object {
        const val GOOGLE_WALLET_KEY = "google_wallet"

        val REVOLUT = NotificationSource(
            "revolut", "com.revolut.revolut", "Revolut", true
        )
        val BBVA = NotificationSource(
            "bbva", "com.bbva.bbvacontigo", "BBVA", true
        )
        val GOOGLE_WALLET = NotificationSource(
            GOOGLE_WALLET_KEY,
            "com.google.android.apps.walletnfcrel",
            "Google Wallet",
            false
        )

        private val excludedPackages = setOf(
            "com.finanzas.mobile",
            "com.android.systemui",
            "com.android.providers.downloads",
            "com.google.android.gms",
            "com.google.android.googlequicksearchbox",
            "com.google.android.apps.messaging",
            "com.whatsapp"
        )

        /**
         * Known sources keep their historical keys so existing account links keep working.
         * Any other non-system app gets a stable key based on its Android package.
         * The parser decides whether a notification from that package is financial.
         */
        fun fromPackage(packageName: String, applicationLabel: String? = null): NotificationSource? {
            val normalizedPackage = packageName.trim()
            if (normalizedPackage.isBlank()) return null

            when (normalizedPackage) {
                REVOLUT.packageName -> return REVOLUT
                BBVA.packageName -> return BBVA
                GOOGLE_WALLET.packageName -> return GOOGLE_WALLET
            }

            if (
                normalizedPackage in excludedPackages ||
                normalizedPackage.startsWith("com.android.") ||
                normalizedPackage.startsWith("android.") ||
                normalizedPackage.startsWith("com.google.android.")
            ) return null

            if (!PACKAGE_PATTERN.matches(normalizedPackage)) return null

            val label = applicationLabel
                ?.replace(Regex("\\s+"), " ")
                ?.trim()
                ?.takeIf { it.isNotBlank() }
                ?.take(100)
                ?: normalizedPackage.substringAfterLast('.')
                    .replace(Regex("[_-]+"), " ")
                    .replaceFirstChar { if (it.isLowerCase()) it.titlecase(Locale.ROOT) else it.toString() }

            return NotificationSource(
                sourceApp = "android:$normalizedPackage",
                packageName = normalizedPackage,
                label = label,
                isBank = true
            )
        }

        fun fromPersisted(
            sourceApp: String,
            packageName: String?,
            label: String?
        ): NotificationSource? {
            val key = sourceApp.trim()
            return when (key) {
                "REVOLUT", "revolut" -> REVOLUT
                "BBVA", "bbva" -> BBVA
                "GOOGLE_WALLET", "google_wallet" -> GOOGLE_WALLET
                else -> {
                    val pkg = packageName.orEmpty().ifBlank {
                        key.removePrefix("android:")
                    }
                    if (key.startsWith("android:") && pkg.isNotBlank()) {
                        fromPackage(pkg, label) ?: NotificationSource(
                            key,
                            pkg,
                            label?.takeIf { it.isNotBlank() } ?: pkg.substringAfterLast('.'),
                            true
                        )
                    } else null
                }
            }
        }

        private val PACKAGE_PATTERN = Regex(
            "^[A-Za-z][A-Za-z0-9_]*(\\.[A-Za-z0-9_]+)+$"
        )
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
    val categorySuggestion: String? = null,
    val notificationKey: String? = null
)

object NotificationParser {
    private val amountPattern = Regex(
        """(?<![\p{L}\d])([−-])?\s*(?:€\s*)?((?:\d{1,3}(?:[ .\u00A0]\d{3})+|\d+)(?:[,.]\d{1,2})?)\s*(€|EUR)(?![\p{L}])""",
        RegexOption.IGNORE_CASE
    )

    private val transactionSignal = Regex(
        """\b(pago|pagado|pagada|compra|compraste|cargo|cargado|cargada|cobro|debit|debited|debitado|debitada|purchase|paid|payment|charge|charged|card|tarjeta|aceptado|aceptada|autorizado|autorizada|approved|settled|transaction|transacci[oó]n|operaci[oó]n|gasto|withdrawal|contactless|contactless|transferencia)\b""",
        RegexOption.IGNORE_CASE
    )

    private val excludedInformational = Regex(
        """\b(otp|one[- ]time password|verification code|security code|codigo de verificacion|c[oó]digo de acceso|clave de un solo uso|token de seguridad|confirmar inicio de sesi[oó]n|iniciar sesi[oó]n|login code|password reset)\b""",
        RegexOption.IGNORE_CASE
    )

    private val marketingSignal = Regex(
        """\b(publicidad|anuncio|newsletter|oferta exclusiva|promo(?:ci[oó]n)?|sorteo|descubre nuestras|new features)\b""",
        RegexOption.IGNORE_CASE
    )

    private val balanceContext = Regex(
        """\b(saldo|balance|disponible|available balance|saldo actual|account balance|l[ií]mite disponible)\b""",
        RegexOption.IGNORE_CASE
    )

    private val merchantCue = Regex(
        """\b(?:en|at|from|merchant|comercio|establecimiento|terminal)\s*[:\-]?\s*(.{2,120}?)(?=\s+(?:con\s+(?:tu\s+)?(?:tarjeta|card)|tarjeta\b|card\b|saldo\b|balance\b|referencia\b|reference\b|autorizaci[oó]n\b)|[\r\n]|$)""",
        RegexOption.IGNORE_CASE
    )

    private val genericTitle = Regex(
        """^(bbva|revolut|caixabank|santander|bankinter|ing|openbank|n26|wise|bunq|pago|pago aceptado|pago autorizado|compra|compra aceptada|compra realizada|cargo|movimiento|notificaci[oó]n|google wallet|wallet|payment|purchase|transaction|card payment)$""",
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

        // Never retain or interpret OTPs, login/security notices or obvious advertising.
        val combined = "$heading\n$body".take(4_000)
        if (excludedInformational.containsMatchIn(combined)) return null

        val amountMatch = amountPattern.findAll(combined)
            .filterNot { match ->
                val start = (match.range.first - 45).coerceAtLeast(0)
                val end = (match.range.last + 46).coerceAtMost(combined.length)
                balanceContext.containsMatchIn(combined.substring(start, end))
            }
            .maxByOrNull { match ->
                val start = (match.range.first - 55).coerceAtLeast(0)
                val end = (match.range.last + 56).coerceAtMost(combined.length)
                val context = combined.substring(start, end)
                (if (transactionSignal.containsMatchIn(context)) 10 else 0) +
                    (if (match.groupValues[1].isNotBlank()) 4 else 0)
            } ?: return null

        val amountText = amountMatch.groupValues[2]
        val isNegativeMovement = amountMatch.groupValues[1].isNotBlank()
        val amountCents = parseAmountToCents(amountText) ?: return null
        if (amountCents <= 0L) return null

        // Wallet emits dedicated payment alerts. Other apps must contain a broad
        // debit/purchase signal or an explicitly negative monetary movement.
        if (!source.isWallet &&
            !transactionSignal.containsMatchIn(combined) &&
            !isNegativeMovement
        ) return null

        if (marketingSignal.containsMatchIn(combined) &&
            !transactionSignal.containsMatchIn(combined) &&
            !isNegativeMovement
        ) return null

        val merchant = extractMerchant(heading, body, source, amountMatch) ?: return null
        val merchantKey = normalizeMerchantKey(merchant)
        if (merchant.length < 2 || merchantKey.isBlank()) return null

        return ParsedPayment(
            source = source,
            merchant = merchant,
            merchantKey = merchantKey,
            amountCents = amountCents,
            currencyCode = "EUR",
            occurredAtMillis = occurredAtMillis,
            accountName = source.label.takeIf { source.isBank },
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
            .replace(Regex("(?<=\\p{L})-(?=\\p{L})"), "")
            .replace(Regex("[^\\p{L}\\p{N}]+"), " ")
            .replace(Regex("\\b\\d{2,}\\b"), " ")
            .trim()
            .replace(Regex("\\s+"), " ")
    }

    private fun extractMerchant(
        heading: String,
        body: String,
        source: NotificationSource,
        amountMatch: MatchResult
    ): String? {
        val combined = "$heading\n$body"
        val cueMatch = merchantCue.find(combined)
        val fromCue = cueMatch?.groupValues?.getOrNull(1)?.let(::cleanMerchant)
        if (isUsableMerchant(fromCue, source)) return fromCue

        val cleanHeading = cleanMerchant(heading)
        if (isUsableMerchant(cleanHeading, source)) return cleanHeading

        // Some apps put the merchant after the amount without a literal "at/en".
        val afterAmount = combined.substring(amountMatch.range.last + 1)
            .lineSequence()
            .firstOrNull()
            .orEmpty()
            .replace(Regex("""(?i)^\s*(?:de|from|en|at)\s+"""), "")
        val trailingMerchant = cleanMerchant(afterAmount)
        if (isUsableMerchant(trailingMerchant, source)) return trailingMerchant

        // Last conservative fallback: use a short, non-generic line from the body.
        val candidate = body.lineSequence()
            .map(::cleanMerchant)
            .firstOrNull { isUsableMerchant(it, source) }
        return candidate
    }

    private fun isUsableMerchant(value: String?, source: NotificationSource): Boolean {
        if (value.isNullOrBlank() || value.length < 2) return false
        if (genericTitle.matches(value)) return false
        if (value.equals(source.label, ignoreCase = true)) return false
        if (value.startsWith("saldo", ignoreCase = true) ||
            value.startsWith("balance", ignoreCase = true)
        ) return false
        return normalizeMerchantKey(value).length >= 2
    }

    private fun cleanMerchant(value: String): String {
        return value
            .replace(Regex("""(?i)\s+(?:con\s+(?:tu\s+)?(?:tarjeta|card)|tarjeta\s+(?:terminada|acabada)|card\s+ending).*$"""), "")
            .replace(Regex("""(?i)\s+(?:saldo|balance|referencia|reference|autorizaci[oó]n).*$"""), "")
            .replace(Regex("""(?i)^(?:compra|pago|pago aceptado|pago autorizado|cargo|has pagado|payment|purchase|card payment)(?:\s+(?:en|de|at|from))?\s*"""), "")
            .replace(amountPattern, " ")
            .replace(Regex("""[•|·,:;]+$"""), "")
            .replace(Regex("""[^\p{L}\p{N} .&'’()/_-]"""), " ")
            .replace(Regex("""\s+"""), " ")
            .trim(' ', '-', ':', ';', ',')
            .take(120)
    }

    private fun parseAmountToCents(value: String): Long? {
        var normalized = value
            .replace(" ", "")
            .replace("\u00A0", "")
        if (normalized.isBlank()) return null

        val comma = normalized.lastIndexOf(',')
        val dot = normalized.lastIndexOf('.')
        normalized = when {
            comma >= 0 && dot >= 0 -> {
                val decimalSeparator = if (comma > dot) ',' else '.'
                val thousandsSeparator = if (decimalSeparator == ',') '.' else ','
                normalized.replace(thousandsSeparator.toString(), "")
                    .replace(decimalSeparator, '.')
            }
            comma >= 0 -> {
                val decimals = normalized.length - comma - 1
                if (decimals in 1..2) normalized.replace(',', '.')
                else normalized.replace(",", "")
            }
            dot >= 0 -> {
                val decimals = normalized.length - dot - 1
                if (decimals in 1..2) normalized
                else normalized.replace(".", "")
            }
            else -> normalized
        }

        val amount = normalized.toBigDecimalOrNull() ?: return null
        if (amount <= java.math.BigDecimal.ZERO) return null
        return try {
            amount.movePointRight(2)
                .setScale(0, java.math.RoundingMode.HALF_UP)
                .longValueExact()
        } catch (_: ArithmeticException) {
            null
        }
    }

    private fun suggestCategory(merchant: String): String? {
        val normalized = normalizeMerchantKey(merchant)
        val supermarketTerms = listOf(
            "SUPERMERCADO", "HIPERMERCADO", "MERCADONA", "LIDL", "ALDI",
            "CONSUM", "CARREFOUR", "EROSKI", "ALCAMPO", "DIA", "SPAR",
            "GROCERY", "SUPERMARKET"
        )
        if (supermarketTerms.any(normalized::contains)) return "Alimentación"

        if (normalized.contains("FARMACIA") || normalized.contains("PHARMACY")) {
            return "Salud e higiene"
        }
        return null
    }
}
