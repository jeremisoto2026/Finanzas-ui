package com.finanzas.companion

/**
 * Conservative direction-first classifier for bank notifications.
 * Outgoing-payment language always wins over generic terms such as "Bizum".
 */
enum class IncomeNoticeDecision { IGNORE, NEEDS_REVIEW, AUTO_INCOME }

data class IncomeNoticeClassification(
    val decision: IncomeNoticeDecision,
    val amountCents: Long? = null,
    val reason: String,
    val suggestedCategory: String? = null,
    val classificationConfidence: Double = 0.0
)

object IncomeNotificationClassifier {
    private val amountPattern = Regex(
        """(?<![\p{L}\d])(?:€|EUR)\s*((?:\d{1,3}(?:[ .\u00A0,]\d{3})+|\d+)(?:[,.]\d{1,2})?)|(?<![\p{L}\d])((?:\d{1,3}(?:[ .\u00A0,]\d{3})+|\d+)(?:[,.]\d{1,2})?)\s*(?:€|EUR)(?![\p{L}])""",
        RegexOption.IGNORE_CASE
    )
    // "Bizum" alone describes a channel, not the direction of money.
    private val inboundSignal = Regex(
        """\b(ingres\w*|abono|abonad\w*|recibid\w*|recibiste|recibimos|te\s+ha[n]?\s+enviado|te\s+ha\s+devuelto|ha\s+devuelto|devuelt\w*|enviado\s+a\s+tu\s+cuenta|a\s+tu\s+favor|transferencia\s+entrante|bizum\s+recibid\w*|n[oó]mina|salario|salary|payroll|cashback|reembolso|devoluci[oó]n|reintegro|recompensa|reward|prestaci[oó]n|pensi[oó]n|inter[eé]s(?:es)?|interest(?:s)?|liquidaci[oó]n|payment\s+received|money\s+received|credit(?:ed)?|deposit(?:ed)?|refund(?:ed)?|返金)\b""",
        RegexOption.IGNORE_CASE
    )
    private val strongAutomaticSignal = Regex(
        """\b(n[oó]mina\s+(?:recibida|ingresada|abonada)|salary\s+(?:received|credited)|payroll\s+credited|abono\s+confirmado|reembolso\s+abonado|devoluci[oó]n\s+abonada)\b""",
        RegexOption.IGNORE_CASE
    )
    private val ambiguousTransferSignal = Regex(
        """\b(transferencia|bizum|te\s+ha[n]?\s+enviado|incoming\s+transfer|payment\s+received)\b""",
        RegexOption.IGNORE_CASE
    )
    // Movements between the user's own accounts (including bank-to-cash).
    // These must never enter the income or expense queues.
    private val ownTransferSignal = Regex(
        """\b(entre\s+(?:mis\s+)?cuentas|traspaso\s+(?:entre\s+)?cuentas|cuenta\s+propia|misma\s+titularidad|transferencia\s+interna|transferencia\s+(?:recibida\s+)?desde\s+tu\s+cuenta|transferencia\s+(?:enviada\s+)?(?:a|hacia)\s+tu\s+cuenta|desde\s+tu\s+cuenta\s+\w+|(?:a|hacia)\s+tu\s+cuenta\s+\w+|ingresad[oa].{0,100}efectivo.{0,100}cuenta|cash\s+deposit|deposited\s+cash|own\s+account|between\s+(?:my\s+)?accounts|internal\s+transfer)\b""",
        RegexOption.IGNORE_CASE
    )
    private val cashWithdrawalSignal = Regex(
        """\b(has\s+retirado|has\s+sacado|retirad[oa]\s+\w*.{0,40}cajero|retirada\s+de\s+efectivo|cajero\s+autom[aá]tico|cash\s+withdrawal|withdrawal\s+at\s+an\s+atm)\b""",
        RegexOption.IGNORE_CASE
    )
    private val explicitRefundSignal = Regex(
        """\b(reembolso|devoluci[oó]n|reintegro|devuelt\w*|refund|returned\s+to\s+your\s+account)\b""",
        RegexOption.IGNORE_CASE
    )
    private val loanReturnSignal = Regex(
        """\b(te\s+ha\s+devuelto|ha\s+devuelto|devuelto\s+de\s+un\s+pr[eé]stamo|devoluci[oó]n\s+de\s+pr[eé]stamo|pr[eé]stamo\s+anterior)\b""",
        RegexOption.IGNORE_CASE
    )
    private val outgoingSignal = Regex(
        """\b(pago\s+aceptado|aceptado\s+el\s+pago|pago\s+(?:realizado|enviado|emitido|con\s+tarjeta)|pago\s+(?:aceptado|de)|has\s+pagado|has\s+gastado|gastad[oa]s?|pagaste|ha[s]?\s+realizado\s+(?:un\s+)?(?:pago|compra)|compra(?:s)?(?:\s+(?:realizada|realizadas|con\s+tarjeta))?|cargo(?:s)?(?:\s+(?:realizado|en\s+tu\s+cuenta))?|se\s+ha\s+cargado|tarjeta\s+(?:utilizada|usada)|retirada(?:s)?|retiraste|has\s+retirado|has\s+sacado|enviaste|has\s+enviado|transferencia\s+enviada|bizum\s+enviado|domiciliaci[oó]n|recibo\s+pagado|debit(?:ed)?|purchase(?:s)?(?:\s+at)?|card\s+(?:payment|purchase|used)|you\s+paid|you\s+spent|spent\s+at|withdrawal|cash\s+withdrawal|payment\s+at|sent\s+(?:a\s+)?payment|money\s+sent|outgoing\s+transfer)\b""",
        RegexOption.IGNORE_CASE
    )
    private val failedSignal = Regex(
        """\b(rechazad[oa]|denegad[oa]|cancelad[oa]|fallid[oa]|failed|rejected|declined|cancelled|canceled|no\s+se\s+ha\s+podido)\b""",
        RegexOption.IGNORE_CASE
    )
    private val informationalSignal = Regex(
        """\b(saldo|balance|disponible|available\s+balance|l[ií]mite|c[oó]digo|verification|security\s+code|otp|publicidad|promoci[oó]n|newsletter|oferta|descuento|promo(?:tion)?)\b""",
        RegexOption.IGNORE_CASE
    )

    fun shouldSkipExpense(title: String?, text: String?): Boolean {
        val combined = combine(title, text)
        return ownTransferSignal.containsMatchIn(combined) ||
            cashWithdrawalSignal.containsMatchIn(combined)
    }

    fun classify(title: String?, text: String?): IncomeNoticeClassification =
        classify(title, text, isFinancialSource = true)

    fun classify(title: String?, text: String?, isFinancialSource: Boolean): IncomeNoticeClassification {
        val combined = combine(title, text)
        if (combined.isBlank()) return ignored("Notificación vacía")
        if (ownTransferSignal.containsMatchIn(combined)) {
            return ignored("Movimiento entre cuentas propias o ingreso/retirada de efectivo")
        }
        if (cashWithdrawalSignal.containsMatchIn(combined)) {
            return ignored("Retirada de efectivo: no es un gasto")
        }

        // An explicit refund takes priority over the word "cancelled" in a
        // notice that confirms the amount was actually returned.
        if (explicitRefundSignal.containsMatchIn(combined) &&
            (inboundSignal.containsMatchIn(combined) || loanReturnSignal.containsMatchIn(combined))
        ) {
            val amount = extractAmountCents(combined)
            val loanReturn = loanReturnSignal.containsMatchIn(combined)
            val strongRefund = amount != null && strongAutomaticSignal.containsMatchIn(combined)
            return IncomeNoticeClassification(
                if (strongRefund) IncomeNoticeDecision.AUTO_INCOME else IncomeNoticeDecision.NEEDS_REVIEW,
                amountCents = amount,
                reason = if (loanReturn) "Devolución de préstamo recibida: confirmar origen"
                    else "Reembolso o devolución recibida: confirmar movimiento",
                suggestedCategory = if (loanReturn) "Devolución de préstamo" else "Devoluciones",
                classificationConfidence = if (amount != null) 0.94 else 0.0
            )
        }
        if (failedSignal.containsMatchIn(combined)) return ignored("Operación fallida o cancelada")

        // Direction is resolved before amount or generic financial-channel words.
        // This prevents "Pago aceptado ... con Bizum" becoming an income candidate.
        if (outgoingSignal.containsMatchIn(combined)) return ignored("Movimiento de dinero saliente")
        if (informationalSignal.containsMatchIn(combined) &&
            !inboundSignal.containsMatchIn(combined)
        ) return ignored("Aviso informativo, no un ingreso")

        val amount = extractAmountCents(combined)
        val explicitInbound = inboundSignal.containsMatchIn(combined)
        val categorySuggestion = when {
            Regex("\\b(n[oó]mina|salario|salary|payroll)\\b", RegexOption.IGNORE_CASE).containsMatchIn(combined) ->
                "Nómina" to 0.97
            loanReturnSignal.containsMatchIn(combined) ->
                "Devolución de préstamo" to 0.94
            Regex("\\b(cashback|reembolso|devoluci[oó]n|refund)\\b", RegexOption.IGNORE_CASE).containsMatchIn(combined) ->
                "Devoluciones" to 0.94
            Regex("\\b(inter[eé]s(?:es)?|interest(?:s)?)\\b", RegexOption.IGNORE_CASE).containsMatchIn(combined) ->
                "Ingresos financieros" to 0.94
            Regex("\\b(pensi[oó]n|prestaci[oó]n|subsidio)\\b", RegexOption.IGNORE_CASE).containsMatchIn(combined) ->
                "Prestaciones" to 0.90
            else -> null
        }
        // An amount from a bank app is not enough to infer an incoming movement.
        // Only explicit inbound wording can enter the income-review queue.
        if (!explicitInbound) {
            return ignored("No hay señales suficientes de una entrada monetaria")
        }
        if (amount == null) {
            return IncomeNoticeClassification(
                IncomeNoticeDecision.NEEDS_REVIEW,
                reason = "Posible ingreso: revisar importe y origen manualmente",
                suggestedCategory = categorySuggestion?.first,
                classificationConfidence = categorySuggestion?.second ?: 0.0
            )
        }

        return if (strongAutomaticSignal.containsMatchIn(combined) &&
            !ambiguousTransferSignal.containsMatchIn(combined)
        ) {
            IncomeNoticeClassification(
                IncomeNoticeDecision.AUTO_INCOME,
                amountCents = amount,
                reason = "Posible abono explícito; requiere confirmación",
                suggestedCategory = categorySuggestion?.first,
                classificationConfidence = categorySuggestion?.second ?: 0.0
            )
        } else {
            IncomeNoticeClassification(
                IncomeNoticeDecision.NEEDS_REVIEW,
                amountCents = amount,
                reason = if (explicitInbound) "Posible entrada de dinero: confirmar origen"
                    else "Movimiento monetario de origen no identificado: revisar manualmente",
                suggestedCategory = categorySuggestion?.first,
                classificationConfidence = categorySuggestion?.second ?: 0.0
            )
        }
    }

    private fun combine(title: String?, text: String?): String =
        (title.orEmpty() + "\n" + text.orEmpty()).trim().take(4_000)

    private fun ignored(reason: String) = IncomeNoticeClassification(
        IncomeNoticeDecision.IGNORE, reason = reason
    )

    private fun extractAmountCents(value: String): Long? {
        val matches = amountPattern.findAll(value).toList()
        if (matches.size != 1) return null
        val raw = matches.single().groupValues.drop(1).firstOrNull { it.isNotBlank() }
            ?: return null
        var normalized = raw.replace(" ", "").replace("\u00A0", "")
        val comma = normalized.lastIndexOf(',')
        val dot = normalized.lastIndexOf('.')
        normalized = when {
            comma >= 0 && dot >= 0 -> {
                val decimal = if (comma > dot) ',' else '.'
                val thousands = if (decimal == ',') '.' else ','
                normalized.replace(thousands.toString(), "").replace(decimal, '.')
            }
            comma >= 0 && normalized.length - comma - 1 in 1..2 -> normalized.replace(',', '.')
            dot >= 0 && normalized.length - dot - 1 !in 1..2 -> normalized.replace(".", "")
            comma >= 0 -> normalized.replace(",", "")
            else -> normalized
        }
        return try {
            normalized.toBigDecimal()
                .takeIf { it > java.math.BigDecimal.ZERO }
                ?.movePointRight(2)
                ?.setScale(0, java.math.RoundingMode.UNNECESSARY)
                ?.longValueExact()
        } catch (_: Exception) { null }
    }
}
