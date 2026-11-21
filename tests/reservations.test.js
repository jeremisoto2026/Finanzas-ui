import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateAvailableBalance, sumMoneyBy } from '../src/lib/finance-core.js'

test('solo las reservas activas reducen el dinero libre de una cuenta', () => {
  const reservations = [
    { amount: 80, status: 'active' },
    { amount: 25.5, status: 'active' },
    { amount: 40, status: 'released' },
    { amount: 10, status: 'consumed' },
  ]
  assert.equal(calculateAvailableBalance(250, reservations), 144.5)
})

test('las reservas se agrupan por moneda y nunca se mezclan EUR y USD', () => {
  const reservations = [
    { amount: 50, status: 'active', currencyCode: 'EUR' },
    { amount: 20, status: 'active', currencyCode: 'USD' },
    { amount: 12.35, status: 'released', currencyCode: 'EUR' },
  ]
  assert.deepEqual(
    sumMoneyBy(
      reservations.filter((item) => item.status === 'active'),
      (item) => item.currencyCode,
      (item) => item.amount
    ),
    { EUR: 50, USD: 20 }
  )
})

test('liberar una reserva devuelve el importe al dinero libre sin alterar el saldo bancario', () => {
  const active = [{ amount: 75, status: 'active' }]
  const released = [{ amount: 75, status: 'released' }]
  assert.equal(calculateAvailableBalance(200, active), 125)
  assert.equal(calculateAvailableBalance(200, released), 200)
})
