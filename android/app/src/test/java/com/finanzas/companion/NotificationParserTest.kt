package com.finanzas.companion

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class NotificationParserTest {
    private val revolutText =
        "Has pagado 2,50 € en Supermercado Altet\n⚒️\n⚠️ Saldo del Pocket EUR: 0,34 €"

    @Test
    fun parsesRevolutPurchaseAndIgnoresPocketBalance() {
        val result = NotificationParser.parse(
            source = NotificationSource.REVOLUT,
            title = "Supermercado Altet",
            text = revolutText,
            occurredAtMillis = 1794958920000L
        )

        assertNotNull(result)
        assertEquals("Supermercado Altet", result?.merchant)
        assertEquals(250L, result?.amountCents)
        assertEquals("Alimentación", result?.categorySuggestion)
        assertEquals("Revolut", result?.accountName)
        assertNull(result?.cardLast4)
    }

    @Test
    fun parsesWalletCardEnding() {
        val result = NotificationParser.parse(
            source = NotificationSource.GOOGLE_WALLET,
            title = "SUPERMERCADO ALTET",
            text = "2,50 € con Revolut Visa ••0733",
            occurredAtMillis = 1794958925000L
        )

        assertNotNull(result)
        assertEquals("SUPERMERCADO ALTET", result?.merchant)
        assertEquals(250L, result?.amountCents)
        assertEquals("0733", result?.cardLast4)
        assertEquals("Alimentación", result?.categorySuggestion)
    }

    @Test
    fun doesNotParsePocketBalanceAloneAsPurchase() {
        val result = NotificationParser.parse(
            source = NotificationSource.REVOLUT,
            title = "Supermercado Altet",
            text = "⚠️ Saldo del Pocket EUR: 0,34 €",
            occurredAtMillis = 1794958920000L
        )
        assertNull(result)
    }

    @Test
    fun rejectsUnknownNotificationPackage() {
        assertNull(NotificationSource.fromPackage("com.whatsapp"))
    }

    @Test
    fun normalizesMerchantBranchNumber() {
        assertEquals(
            NotificationParser.normalizeMerchantKey("MERCADONA 0421 TPV"),
            NotificationParser.normalizeMerchantKey("Mercadona")
        )
    }
}
