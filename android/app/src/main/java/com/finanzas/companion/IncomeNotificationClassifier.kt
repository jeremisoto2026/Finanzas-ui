package com.finanzas.companion

/**
 * Conservative first-pass classification for bank credit notifications.
 * This classifier never creates transactions; AUTO_INCOME is only a candidate.
 */
enum class IncomeNoticeDecision {
    IGNORE,
    NEEDS_REVIEW,
    AUTO_INCOME
}

data class IncomeNoticeClassification(
    val decision: IncomeNoticeDecision,
    val amountCents: Long? = null,
    val reason: String
)

object IncomeNotificationClassifier {
    private val amountPattern = Regex(
        """(?<![\p{L}\d])(?:€|EUR)\s*((?:\d{1,3}(?:[ .\u00A0,]\d{3})+|\d+)(?:[,.]\d{1,2})?)|(?<![\p{L}\d])((?:\d{1,3}(?:[ .\u00A0,]\d{3})+|\d+)(?:[,.]\d{1,2})?)\s*(?:€|EUR)(?![\p{L}])""",
        RegexOption.IGNORE_CASE
    )

    private val inboundSignal = Regex(
        """\b(ingreso\s+recibido|abono\s+(?:recibido|en\s+cuenta|confirmado)|has\s+recibido|hemos\s+recibido|dinero\s+recibido|money\s+received|received\s+(?:a\s+)?payment|payment\s+received|transferencia\s+recibida|transferencia\s+entrante|incoming\s+transfer|deposit\s+(?:received|completed)|n[oó]mina\s+(?:recibida|ingresada|abonada)|salary\s+(?:received|credited)|cashback\s+(?:recibido|received)|reembolso\s+(?:recibido|abonado)|devoluci[oó]n\s+(?:recibida|abonada))\b""",
        RegexOption.IGNORE_CASE
    )

    private val strongAutomaticSignal = Regex(
        """\b(ingreso\s+recibido|abono\s+(?:recibido|en\s+cuenta|confirmado)|has\s+recibido|hemos\s+recibido|dinero\s+recibido|money\s+received|received\s+(?:a\s+)?payment|payment\s+received|n[oó]mina\s+(?:recibida|ingresada|abonada)|salary\s+(?:received|credited)|cashback\s+(?:recibido|received)|reembolso\s+(?:recibido|abonado)|devoluci[oó]n\s+(?:recibida|abonada))\b""",
        RegexOption.IGNORE_CASE
    )

    private val ambiguousTransferSignal = Regex(
        """\b(transferencia\s+recibida|transferencia\s+entrante|incoming\s+transfer|has\s+recibido\s+una?\s+transferencia|hemos\s+recibido\s+una?\s+transferencia)\b""",
        RegexOption.IGNORE_CASE
    )

    private val ownTransferSignal = Regex(
        """\b(entre\s+(?:mis\s+)?cuentas|traspaso\s+(?:entre\s+)?cuentas|cuenta\s+propia|misma\s+titularidad|transferencia\s+interna|own\s+account|between\s+(?:my\s+)?accounts|internal\s+transfer)\b""",
        RegexOption.IGNORE_CASE
    )

    private val failedSignal = Regex(
        """\b(rechazad[oa]|denegad[oa]|cancelad[oa]|fallid[oa]|failed|rejected|declined|cancelled|canceled)\b""",
        RegexOption.IGNORE_CASE
    )

    private val informationalSignal = Regex(
        """\b(saldo|balance|disponible|available balance|l[ií]mite|l[ií]mite de cr[eé]dito|c[oó]digo|verification|security code|otp|publicidad|promoci[oó]n|newsletter)\b""",
        RegexOption.IGNORE_CASE
    )

    fun classify(title: String?, text: String?): IncomeNoticeClassification {
        val combined = (title.orEmpty() + "\n" + text.orEmpty()).trim().take(4_000)
        if (combined.isBlank()) return ignored("Notificación vacía")
        if (failedSignal.containsMatchIn(combined)) return ignored("Operación fallida o cancelada")
        if (ownTransferSignal.containsMatchIn(combined)) return ignored("Transferencia entre cuentas propias")
        if (informationalSignal.containsMatchIn(combined) &&
            !inboundSignal.containsMatchIn(combined)
        ) return ignored("Aviso informativo, no un ingreso")

        if (!inboundSignal.containsMatchIn(combined)) {
            return ignored("No hay una señal explícita de entrada de dinero")
        }

        val amount = extractAmountCents(combined)
        if (amount == null) {
            return IncomeNoticeClassification(
                IncomeNoticeDecision.NEEDS_REVIEW,
                reason = "Aviso de posible ingreso sin importe inequívoco"
            )
        }

        return if (strongAutomaticSignal.containsMatchIn(combined) &&
            !ambiguousTransferSignal.containsMatchIn(combined)
        ) {
            IncomeNoticeClassification(
                IncomeNoticeDecision.AUTO_INCOME,
                amountCents = amount,
                reason = "Entrada de dinero explícita con importe"
            )
        } else {
            IncomeNoticeClassification(
                IncomeNoticeDecision.NEEDS_REVIEW,
                amountCents = amount,
                reason = "Transferencia recibida: confirmar origen y titularidad"
            )
        }
    }

    private fun ignored(reason: String) = IncomeNoticeClassification(
        IncomeNoticeDecision.IGNORE,
        reason = reason
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
        } catch (_: Exception) {
            null
        }
    }
}
