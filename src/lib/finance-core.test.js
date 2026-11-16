import test from 'node:test'
import assert from 'node:assert/strict'
import {
  toCents,
  fromCents,
  sumMoney,
  transactionDeltaCents,
  calculateAccountBalance,
  calculateAvailableBalance,
} from './finance-core.js'

test('converts euro amounts to integer cents without float drift', () => {
  assert.equal(toCents('12,34'), 1234)
  assert.equal(toCents(0.1 + 0.2), 30)
  assert.equal(fromCents(1234), 12.34)
})

test('sums money using cents', () => {
  assert.equal(sumMoney([{ amount: 0.1 }, { amount: 0.2 }, { amount: 0.7 }], (item) => item.amount), 1)
})

test('reconciles the confirmed Revolut movements to 0.83 euros', () => {
  const balance = calculateAccountBalance({
    accountId: 'revolut',
    openingBalance: 284,
    transactions: [
      { accountId: 'revolut', type: 'income', amount: 740, status: 'posted' },
      { accountId: 'revolut', type: 'expense', amount: 785, status: 'posted' },
      { accountId: 'revolut', type: 'expense', amount: 9.5, status: 'posted' },
      { accountId: 'revolut', type: 'expense', amount: 200, status: 'posted' },
      { accountId: 'revolut', type: 'expense', amount: 26.91, status: 'posted' },
      { accountId: 'revolut', type: 'expense', amount: 1.76, status: 'posted' },
      { accountId: 'bbva', type: 'expense', amount: 50, status: 'posted' },
    ],
  })

  assert.equal(balance, 0.83)
})

test('pending and void transactions do not affect account balances', () => {
  const balance = calculateAccountBalance({
    accountId: 'revolut',
    openingBalance: 100,
    transactions: [
      { accountId: 'revolut', type: 'expense', amount: 20, status: 'pending' },
      { accountId: 'revolut', type: 'expense', amount: 30, status: 'void' },
      { accountId: 'revolut', type: 'expense', amount: 5, status: 'posted' },
    ],
  })

  assert.equal(balance, 95)
})

test('available balance subtracts only active reservations', () => {
  assert.equal(calculateAvailableBalance(100, [
    { amount: 20, status: 'active' },
    { amount: 15, status: 'released' },
    { amount: 5, status: 'consumed' },
  ]), 80)
})

test('rejects unknown transaction types and invalid amounts', () => {
  assert.throws(() => transactionDeltaCents({ type: 'unknown', amount: 10 }), /Tipo de movimiento/)
  assert.throws(() => toCents('no es un importe'), /número válido/)
})
