package com.finanzas.companion

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class IncomeNotificationClassifierTest {
    @Test
    fun classifiesExplicitPayrollCreditAsAutomaticCandidate() {
        val result = IncomeNotificationClassifier.classify(
            "Nómina abonada",
            "Hemos recibido tu nómina de 1.234,56 EUR"
        )
        assertEquals(IncomeNoticeDecision.AUTO_INCOME, result.decision)
        assertEquals(123456L, result.amountCents)
    }

    @Test
    fun keepsGenericIncomingTransferForManualReview() {
        val result = IncomeNotificationClassifier.classify(
            "Transferencia recibida",
            "Has recibido una transferencia de 75,00 EUR"
        )
        assertEquals(IncomeNoticeDecision.NEEDS_REVIEW, result.decision)
        assertEquals(7500L, result.amountCents)
    }

    @Test
    fun ignoresTransfersBetweenOwnAccounts() {
        val result = IncomeNotificationClassifier.classify(
            "Transferencia recibida",
            "Transferencia de 10,00 EUR entre mis cuentas BBVA y Revolut"
        )
        assertEquals(IncomeNoticeDecision.IGNORE, result.decision)
        assertNull(result.amountCents)
    }

    @Test
    fun incomingTransferWithoutArticleStillRequiresManualReview() {
        val result = IncomeNotificationClassifier.classify(
            "BBVA",
            "Has recibido transferencia de 25,00 EUR"
        )
        assertEquals(IncomeNoticeDecision.NEEDS_REVIEW, result.decision)
        assertEquals(2500L, result.amountCents)
    }

    @Test
    fun ownAccountTransfersAreAlsoBlockedFromExpenseParser() {
        assertEquals(
            true,
            IncomeNotificationClassifier.shouldSkipExpense(
                "Transferencia recibida",
                "Traspaso de 10,00 EUR entre mis cuentas"
            )
        )
    }

    @Test
    fun ignoresBalanceAndAvailableFundsNotifications() {
        val result = IncomeNotificationClassifier.classify(
            "Saldo actualizado",
            "Tu saldo disponible es 1.234,56 EUR"
        )
        assertEquals(IncomeNoticeDecision.IGNORE, result.decision)
    }

    @Test
    fun doesNotTreatFailedCreditAsIncome() {
        val result = IncomeNotificationClassifier.classify(
            "Ingreso rechazado",
            "El abono recibido de 50,00 EUR ha sido cancelado"
        )
        assertEquals(IncomeNoticeDecision.IGNORE, result.decision)
    }

    @Test
    fun requiresOneUnambiguousAmount() {
        val result = IncomeNotificationClassifier.classify(
            "Nómina abonada",
            "Hemos recibido tu nómina. Saldo: 1.500,00 EUR. Abono: 1.200,00 EUR"
        )
        assertEquals(IncomeNoticeDecision.NEEDS_REVIEW, result.decision)
        assertNull(result.amountCents)
    }

    @Test
    fun keepsIncomingTransferWithoutAmountForReviewRatherThanInventingOne() {
        val result = IncomeNotificationClassifier.classify(
            "Transferencia recibida",
            "Has recibido una transferencia"
        )
        assertEquals(IncomeNoticeDecision.NEEDS_REVIEW, result.decision)
        assertNull(result.amountCents)
    }

    @Test
    fun revolutSenderNotificationIsCapturedForManualReview() {
        val result = IncomeNotificationClassifier.classify(
            "José S.G.",
            "Te ha enviado 1€"
        )
        assertEquals(IncomeNoticeDecision.NEEDS_REVIEW, result.decision)
        assertEquals(100L, result.amountCents)
    }

    @Test
    fun ignoresNotificationsWithoutAnExplicitInboundSignal() {
        val result = IncomeNotificationClassifier.classify(
            "BBVA",
            "Se ha actualizado la información de tu cuenta"
        )
        assertEquals(IncomeNoticeDecision.IGNORE, result.decision)
    }

    @Test
    fun unfamiliarPositiveBankMovementWithoutInboundWordingIsIgnored() {
        val result = IncomeNotificationClassifier.classify(
            "BBVA", "Movimiento a tu favor: 42,50 EUR", isFinancialSource = true
        )
        assertEquals(IncomeNoticeDecision.NEEDS_REVIEW, result.decision)
        assertEquals(4250L, result.amountCents)
    }

    @Test
    fun capturesBizumAndRefundLikeCreditsForReview() {
        val bizum = IncomeNotificationClassifier.classify("Bizum", "Has recibido un Bizum de 18,00 EUR")
        assertEquals(IncomeNoticeDecision.NEEDS_REVIEW, bizum.decision)
        assertEquals(1800L, bizum.amountCents)

        val refund = IncomeNotificationClassifier.classify("Revolut", "Devolución completada: 12,99 EUR")
        assertEquals(IncomeNoticeDecision.NEEDS_REVIEW, refund.decision)
        assertEquals(1299L, refund.amountCents)
    }

    @Test
    fun ignoresOutgoingCardPurchaseAndFailedCredit() {
        val purchase = IncomeNotificationClassifier.classify("BBVA", "Compra realizada: 25,00 EUR")
        assertEquals(IncomeNoticeDecision.IGNORE, purchase.decision)

        val failed = IncomeNotificationClassifier.classify("BBVA", "Abono rechazado: 25,00 EUR")
        assertEquals(IncomeNoticeDecision.IGNORE, failed.decision)
    }

    @Test
    fun unknownNonFinancialAppDoesNotBecomeIncomeFromAmountAlone() {
        val result = IncomeNotificationClassifier.classify(
            "Juego", "Has conseguido 10 EUR de puntos", isFinancialSource = false
        )
        assertEquals(IncomeNoticeDecision.IGNORE, result.decision)
    }
    @Test
    fun bbvaAcceptedBizumPaymentIsOutgoingNeverIncome() {
        val result = IncomeNotificationClassifier.classify(
            "Pago aceptado ✅",
            "Aceptado el pago de 8,67 EUR en PAGO DE IMPUESTOS AEAT con Bizum"
        )
        assertEquals(IncomeNoticeDecision.IGNORE, result.decision)
        assertNull(result.amountCents)
    }

    @Test
    fun outgoingBizumAndSentTransferAreNeverIncome() {
        val bizum = IncomeNotificationClassifier.classify(
            "Bizum", "Has enviado un Bizum de 18,00 EUR"
        )
        val transfer = IncomeNotificationClassifier.classify(
            "Transferencia", "Transferencia enviada de 75,00 EUR"
        )
        assertEquals(IncomeNoticeDecision.IGNORE, bizum.decision)
        assertEquals(IncomeNoticeDecision.IGNORE, transfer.decision)
    }

    @Test
    fun receivedBizumRemainsManualIncomeReview() {
        val result = IncomeNotificationClassifier.classify(
            "Bizum recibido", "Has recibido un Bizum de 18,00 EUR"
        )
        assertEquals(IncomeNoticeDecision.NEEDS_REVIEW, result.decision)
        assertEquals(1800L, result.amountCents)
    }

    @Test
    fun genericBizumWithoutDirectionIsNotIncome() {
        val result = IncomeNotificationClassifier.classify(
            "Bizum", "Operación Bizum de 18,00 EUR"
        )
        assertEquals(IncomeNoticeDecision.IGNORE, result.decision)
        assertNull(result.amountCents)
    }

    @Test
    fun suggestsPayrollCategoryForExplicitPayrollCredit() {
        val result = IncomeNotificationClassifier.classify(
            "Nómina abonada",
            "Hemos recibido tu nómina de 1.234,56 EUR"
        )
        assertEquals("Nómina", result.suggestedCategory)
        assertEquals(true, result.classificationConfidence >= 0.9)
    }

    @Test
    fun doesNotSuggestIncomeCategoryForAmbiguousTransfer() {
        val result = IncomeNotificationClassifier.classify(
            "Transferencia recibida",
            "Has recibido una transferencia de 75,00 EUR"
        )
        assertNull(result.suggestedCategory)
        assertEquals(0.0, result.classificationConfidence, 0.0)
    }

    @Test
    fun suggestsRefundCategoryWithoutAutoPostingIt() {
        val result = IncomeNotificationClassifier.classify(
            "Devolución completada",
            "Devolución abonada: 12,99 EUR"
        )
        assertEquals(IncomeNoticeDecision.NEEDS_REVIEW, result.decision)
        assertEquals("Devoluciones", result.suggestedCategory)
        assertEquals(true, result.classificationConfidence >= 0.9)
    }

}
