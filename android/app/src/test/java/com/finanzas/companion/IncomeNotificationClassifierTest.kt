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
    fun ignoresNotificationsWithoutAnExplicitInboundSignal() {
        val result = IncomeNotificationClassifier.classify(
            "BBVA",
            "Se ha actualizado la información de tu cuenta"
        )
        assertEquals(IncomeNoticeDecision.IGNORE, result.decision)
    }
}
