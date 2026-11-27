package com.finanzas.companion

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NotificationParserTest {

    @Test
    fun bbvaAcceptedBizumTaxPaymentRoutesToExpenseParserNotIncomeReview() {
        val title = "Pago aceptado ✅"
        val text = "Aceptado el pago de 8,67 EUR en PAGO DE IMPUESTOS AEAT con Bizum"
        val income = IncomeNotificationClassifier.classify(title, text)
        val expense = NotificationParser.parse(
            source = NotificationSource.BBVA,
            title = title,
            text = text,
            occurredAtMillis = 1794958920000L
        )

        assertEquals(IncomeNoticeDecision.IGNORE, income.decision)
        assertNotNull(expense)
        assertEquals(867L, expense?.amountCents)
    }

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
    }

    @Test
    fun doesNotParsePocketBalanceAloneAsPurchase() {
        val result = NotificationParser.parse(
            source = NotificationSource.REVOLUT,
            title = "Revolut",
            text = "Saldo del Pocket EUR: 0,34 €",
            occurredAtMillis = 1794958920000L
        )
        assertNull(result)
    }

    @Test
    fun excludesGoogleWalletFromKnownAndPersistedSources() {
        assertNull(NotificationSource.fromPackage(
            NotificationSource.GOOGLE_WALLET_PACKAGE,
            "Google Wallet"
        ))
        assertNull(NotificationSource.fromPersisted(
            "google_wallet",
            NotificationSource.GOOGLE_WALLET_PACKAGE,
            "Google Wallet"
        ))
    }

    @Test
    fun rejectsUnknownMessagingNotificationPackage() {
        assertNull(NotificationSource.fromPackage("com.whatsapp", "WhatsApp"))
    }

    @Test
    fun ignoresUnknownAndPersonalAppsBeforeNotificationParsing() {
        assertNull(NotificationSource.fromPackage("com.example.game", "Juego"))
        assertNull(NotificationSource.fromPackage("org.telegram.messenger", "Telegram"))
        assertNull(NotificationSource.fromPackage("com.whatsapp", "WhatsApp"))
        assertNotNull(NotificationSource.fromPackage("es.example.mobile", "Banco Ejemplo"))
    }

    @Test
    fun recognizesBankPackagesByFinancialAppLabel() {
        val source = NotificationSource.fromPackage(
            "es.caixabank.mobile.android",
            "CaixaBank"
        )
        assertNotNull(source)
        assertEquals("android:es.caixabank.mobile.android", source?.sourceApp)
        assertEquals("CaixaBank", source?.label)
        assertTrue(source?.isBank == true)
    }

    @Test
    fun parsesFlexibleCaixaBankPurchaseAndSuggestsCategory() {
        val source = NotificationSource.fromPackage(
            "es.caixabank.mobile.android",
            "CaixaBank"
        )!!
        val result = NotificationParser.parse(
            source = source,
            title = "Pago con tarjeta",
            text = "Compra realizada de 14,25 EUR en FARMACIA CENTRAL con tu tarjeta",
            occurredAtMillis = 1794958920000L
        )

        assertNotNull(result)
        assertEquals("FARMACIA CENTRAL", result?.merchant)
        assertEquals(1425L, result?.amountCents)
        assertEquals("Salud e higiene", result?.categorySuggestion)
        assertEquals("CaixaBank", result?.accountName)
    }

    @Test
    fun parsesNegativeMovementWithCurrencyEvenWithoutExactPhrase() {
        val source = NotificationSource.fromPackage(
            "es.bancosantander.app",
            "Santander"
        )!!
        val result = NotificationParser.parse(
            source = source,
            title = "Santander",
            text = "−12,50 € en PANADERIA CENTRAL",
            occurredAtMillis = 1794958920000L
        )

        assertNotNull(result)
        assertEquals("PANADERIA CENTRAL", result?.merchant)
        assertEquals(1250L, result?.amountCents)
    }

    @Test
    fun parsesEuropeanAndInternationalThousandsSeparators() {
        val source = NotificationSource.fromPackage(
            "com.example.bank",
            "My Bank"
        )!!
        val european = NotificationParser.parse(
            source,
            "Pago aceptado",
            "Pago de 1.234,56 EUR en COMERCIO UNO",
            1794958920000L
        )
        val international = NotificationParser.parse(
            source,
            "Card payment",
            "Card payment of EUR 1,234.56 at MERCHANT TWO",
            1794958920000L
        )

        assertEquals(123456L, european?.amountCents)
        assertEquals(123456L, international?.amountCents)
    }

    @Test
    fun rejectsDeclinedFailedCancelledAndInsufficientFundsPayments() {
        val failedNotifications = listOf(
            "Pago rechazado de 14,25 EUR en FARMACIA CENTRAL",
            "Compra denegada de 14,25 EUR en FARMACIA CENTRAL",
            "No se pudo completar el pago de 14,25 EUR en FARMACIA CENTRAL",
            "Pago no autorizado de 14,25 EUR en FARMACIA CENTRAL",
            "Fondos insuficientes para el pago de 14,25 EUR en FARMACIA CENTRAL",
            "Payment declined: EUR 14.25 at CENTRAL STORE",
            "Card payment failed: EUR 14.25 at CENTRAL STORE",
            "Transaction was cancelled: EUR 14.25 at CENTRAL STORE",
            "Payment could not be processed: EUR 14.25 at CENTRAL STORE"
        )

        failedNotifications.forEachIndexed { index, notification ->
            val result = NotificationParser.parse(
                source = NotificationSource.BBVA,
                title = "BBVA",
                text = notification,
                occurredAtMillis = 1794958920000L
            )
            assertNull("A rejected or failed payment must not be captured (#$index)", result)
        }
    }

    @Test
    fun rejectsOtpAndSecurityCodeNotificationsEvenWhenTheyMentionAnAmount() {
        val source = NotificationSource.fromPackage(
            "com.example.bank",
            "Example Bank"
        )!!
        val result = NotificationParser.parse(
            source,
            "Código de seguridad",
            "Código de verificación para autorizar el pago de 2,50 EUR en TIENDA",
            1794958920000L
        )
        assertNull(result)
    }

    @Test
    fun rejectsAdvertisingWithoutARealMovementSignal() {
        val source = NotificationSource.fromPackage(
            "com.example.bank",
            "Example Bank"
        )!!
        val result = NotificationParser.parse(
            source,
            "Oferta exclusiva",
            "Descubre esta promoción especial de 2,50 EUR en TIENDA",
            1794958920000L
        )
        assertNull(result)
    }

    @Test
    fun rejectsPositiveAmountWithoutTransactionSignalOrMerchant() {
        val source = NotificationSource.fromPackage(
            "com.example.bank",
            "Example Bank"
        )!!
        val result = NotificationParser.parse(
            source,
            "Example Bank",
            "Tu saldo disponible es 2,50 EUR",
            1794958920000L
        )
        assertNull(result)
    }

    @Test
    fun normalizesHyphenatedMerchantSoWalletAndBankCanMatch() {
        assertEquals(
            NotificationParser.normalizeMerchantKey("SUPERMER-CADO ALTET"),
            NotificationParser.normalizeMerchantKey("SUPERMERCADO ALTET")
        )
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
    fun parsesLegacyBbvaPurchase() {
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
    fun parsesBbvaAcceptedPaymentFormatFromPreviousTestPurchase() {
        val result = NotificationParser.parse(
            source = NotificationSource.BBVA,
            title = "Pago aceptado",
            text = "Pago aceptado de 2,50 EUR en SUPERMER-CADO ALTET con tu tarjeta terminada en 3684",
            occurredAtMillis = 1795033320000L
        )

        assertNotNull(result)
        assertEquals("SUPERMER-CADO ALTET", result?.merchant)
        assertEquals(250L, result?.amountCents)
        assertEquals("BBVA", result?.accountName)
        assertEquals("Alimentación", result?.categorySuggestion)
    }

    @Test
    fun parsesMerchantWrappedAcrossNotificationLineBreak() {
        val source = NotificationSource.BBVA
        val result = NotificationParser.parse(
            source = source,
            title = "Pago aceptado",
            text = "Pago aceptado de 2,50 EUR en SUPERMER-\nCADO ALTET con tu tarjeta",
            occurredAtMillis = 1795033320000L
        )

        assertNotNull(result)
        assertEquals("SUPERMERCADO ALTET", result?.merchant)
        assertEquals(250L, result?.amountCents)
        assertEquals("Alimentación", result?.categorySuggestion)
    }

    @Test
    fun readsLegacySourceNamesFromStoredCaptures() {
        assertEquals(
            NotificationSource.REVOLUT,
            NotificationSource.fromPersisted("REVOLUT", null, null)
        )
        assertNull(NotificationSource.fromPersisted("GOOGLE_WALLET", null, null))
    }
}
