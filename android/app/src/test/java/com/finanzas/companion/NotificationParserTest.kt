package com.finanzas.companion

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
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
    fun doesNotUseVirtualWalletCardEndingForBankAccountMatching() {
        val result = NotificationParser.parse(
            source = NotificationSource.GOOGLE_WALLET,
            title = "SUPERMERCADO ALTET",
            text = "2,50 € con Revolut Visa ••0733",
            occurredAtMillis = 1794958925000L
        )

        assertNotNull(result)
        assertEquals("SUPERMERCADO ALTET", result?.merchant)
        assertEquals(250L, result?.amountCents)
        assertNull(result?.cardLast4)
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

    @Test
    fun deduplicatesSameBankPaymentEvenWhenAndroidRepostsWithNewNotificationKey() {
        val item = LocalCapture(
            id = "capture-1",
            merchant = "Mercadona",
            merchantKey = "MERCADONA",
            amountCents = 2580L,
            currencyCode = "EUR",
            occurredAtMillis = 1795033320000L,
            accountName = "BBVA",
            cardLast4 = "1234",
            categorySuggestion = "Alimentación",
            sources = setOf(NotificationSource.BBVA),
            notificationKeys = setOf("old-notification-key"),
            isPaired = false
        )
        val repost = ParsedPayment(
            source = NotificationSource.BBVA,
            merchant = "Mercadona",
            merchantKey = "MERCADONA",
            amountCents = 2580L,
            occurredAtMillis = 1795033321500L,
            accountName = "BBVA",
            cardLast4 = "1234",
            categorySuggestion = "Alimentación",
            notificationKey = "new-notification-key"
        )

        assertTrue(isSameSourceDuplicate(item, repost))
    }

    @Test
    fun doesNotMergeSameMerchantAndAmountWhenNotificationsAreFarApart() {
        val item = LocalCapture(
            id = "capture-1",
            merchant = "Mercadona",
            merchantKey = "MERCADONA",
            amountCents = 2580L,
            currencyCode = "EUR",
            occurredAtMillis = 1795033320000L,
            accountName = "BBVA",
            cardLast4 = "1234",
            categorySuggestion = "Alimentación",
            sources = setOf(NotificationSource.BBVA),
            notificationKeys = setOf("old-notification-key"),
            isPaired = false
        )
        val laterPurchase = ParsedPayment(
            source = NotificationSource.BBVA,
            merchant = "Mercadona",
            merchantKey = "MERCADONA",
            amountCents = 2580L,
            occurredAtMillis = 1795033340000L,
            accountName = "BBVA",
            notificationKey = "new-notification-key"
        )

        assertFalse(isSameSourceDuplicate(item, laterPurchase))
    }

    @Test
    fun parsesBbvaPurchaseAndIdentifiesBbvaAccount() {
        val result = NotificationParser.parse(
            source = NotificationSource.BBVA,
            title = "BBVA",
            text = "Compra realizada con tarjeta: 25,80 € en Mercadona",
            occurredAtMillis = 1795033320000L
        )
        assertNotNull(result)
        assertEquals("Mercadona", result?.merchant)
        assertEquals(2580L, result?.amountCents)
        assertEquals("BBVA", result?.accountName)
    }

    @Test
    fun walletWithoutIssuerDoesNotGuessBank() {
        val result = NotificationParser.parse(
            source = NotificationSource.GOOGLE_WALLET,
            title = "Mercadona",
            text = "25,80 € con Visa ••1234",
            occurredAtMillis = 1795033320000L
        )
        assertNotNull(result)
        assertNull(result?.accountName)
        assertNull(result?.cardLast4)
    }

    @Test
    fun walletCanIdentifyAnExplicitBbvaIssuer() {
        val result = NotificationParser.parse(
            source = NotificationSource.GOOGLE_WALLET,
            title = "Mercadona",
            text = "25,80 € con BBVA Visa ••1234",
            occurredAtMillis = 1795033320000L
        )
        assertNotNull(result)
        assertEquals("BBVA", result?.accountName)
    }
}
