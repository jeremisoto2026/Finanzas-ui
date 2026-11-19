import test from 'node:test'
import assert from 'node:assert/strict'
import { canPairPaymentNotifications, parsePaymentNotification } from '../src/lib/notification-parser.js'

const categories = ['Alimentación', 'Otros']

const revolutNotification = {
  sourceApp: 'revolut',
  title: 'Supermercado Altet',
  text: 'Has pagado 2,50 € en Supermercado Altet\n⚒️\n⚠️ Saldo del Pocket EUR: 0,34 €',
  occurredAt: '2026-11-17T22:42:00.000Z',
}

const walletNotification = {
  sourceApp: 'google_wallet',
  title: 'SUPERMERCADO ALTET',
  text: '2,50 € con Revolut Visa ••0733',
  occurredAt: '2026-11-17T22:42:05.000Z',
}

test('lee el aviso de Revolut y no confunde el saldo del Pocket con otro gasto', () => {
  const parsed = parsePaymentNotification(revolutNotification, categories)
  assert.equal(parsed.isPayment, true)
  assert.equal(parsed.amount, 2.5)
  assert.equal(parsed.merchant, 'Supermercado Altet')
  assert.equal(parsed.categorySuggestion, 'Alimentación')
  assert.equal(parsed.accountLabel, 'Revolut')
  assert.equal(parsed.cardLast4, null)
})

test('no usa los últimos dígitos de la tarjeta virtual de Google Wallet para identificar la cuenta bancaria', () => {
  const parsed = parsePaymentNotification(walletNotification, categories)
  assert.equal(parsed.isPayment, true)
  assert.equal(parsed.amount, 2.5)
  assert.equal(parsed.merchant, 'SUPERMERCADO ALTET')
  assert.equal(parsed.cardLast4, null)
  assert.equal(parsed.paymentChannel, 'google_wallet')
})

test('no empareja si el importe es distinto', () => {
  const revolut = parsePaymentNotification(revolutNotification, categories)
  const wallet = parsePaymentNotification({ ...walletNotification, text: '2,60 € con Revolut Visa ••0733' }, categories)
  assert.equal(canPairPaymentNotifications(
    { source_app: 'revolut', parsed_amount: revolut.amount, parsed_merchant: revolut.merchant, currency_code: 'EUR', occurred_at: revolutNotification.occurredAt },
    { source_app: 'google_wallet', parsed_amount: wallet.amount, parsed_merchant: wallet.merchant, currency_code: 'EUR', occurred_at: walletNotification.occurredAt },
  ), false)
})

test('empareja Wallet y Revolut como una misma compra cuando coinciden', () => {
  const revolut = parsePaymentNotification(revolutNotification, categories)
  const wallet = parsePaymentNotification(walletNotification, categories)
  assert.equal(canPairPaymentNotifications(
    { source_app: 'revolut', parsed_amount: revolut.amount, parsed_merchant: revolut.merchant, currency_code: 'EUR', occurred_at: revolutNotification.occurredAt },
    { source_app: 'google_wallet', parsed_amount: wallet.amount, parsed_merchant: wallet.merchant, currency_code: 'EUR', occurred_at: walletNotification.occurredAt },
  ), true)
})

test('no empareja la misma aplicación ni eventos separados por más de tres minutos', () => {
  const first = {
    source_app: 'revolut', parsed_amount: 2.5, parsed_merchant: 'Supermercado Altet',
    currency_code: 'EUR', occurred_at: '2026-11-17T22:42:00.000Z',
  }
  assert.equal(canPairPaymentNotifications(first, { ...first, source_app: 'revolut' }), false)
  assert.equal(canPairPaymentNotifications(first, {
    ...first, source_app: 'google_wallet', occurred_at: '2026-11-17T22:46:00.000Z',
  }), false)
})


test('BBVA identifies its own notification as the issuing bank', () => {
  const parsed = parsePaymentNotification({
    sourceApp: 'bbva',
    title: 'BBVA',
    text: 'Compra realizada con tarjeta Visa ••5678: 25,80 € en Mercadona',
    occurredAt: '2026-11-18T17:42:00.000Z',
  }, categories)
  assert.equal(parsed.isPayment, true)
  assert.equal(parsed.accountLabel, 'BBVA')
  assert.equal(parsed.merchant, 'Mercadona')
  assert.equal(parsed.amount, 25.8)
  assert.equal(parsed.cardLast4, '5678')
})

test('Wallet without an explicit issuer never guesses the bank', () => {
  const parsed = parsePaymentNotification({
    sourceApp: 'google_wallet',
    title: 'Mercadona',
    text: '25,80 € con Visa ••1234',
    occurredAt: '2026-11-18T17:42:00.000Z',
  }, categories)
  assert.equal(parsed.isPayment, true)
  assert.equal(parsed.accountLabel, null)
})

test('BBVA pairs with Wallet but two different bank apps are not paired', () => {
  const bbva = {
    source_app: 'bbva',
    parsed_amount: 25.8,
    parsed_merchant: 'Mercadona',
    currency_code: 'EUR',
    occurred_at: '2026-11-18T17:42:00.000Z',
  }
  const wallet = {
    ...bbva,
    source_app: 'google_wallet',
    occurred_at: '2026-11-18T17:42:20.000Z',
  }
  assert.equal(canPairPaymentNotifications(bbva, wallet), true)
  assert.equal(canPairPaymentNotifications(bbva, { ...bbva, source_app: 'revolut' }), false)
})
