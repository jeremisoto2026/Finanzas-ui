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

test('lee Google Wallet, detecta la tarjeta Revolut Visa terminada en 0733', () => {
  const parsed = parsePaymentNotification(walletNotification, categories)
  assert.equal(parsed.isPayment, true)
  assert.equal(parsed.amount, 2.5)
  assert.equal(parsed.merchant, 'SUPERMERCADO ALTET')
  assert.equal(parsed.cardLast4, '0733')
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
