import test from 'node:test'
import assert from 'node:assert/strict'
import {
  toCents,
  fromCents,
  sumMoney,
  transactionDeltaCents,
  calculateAccountBalance,
  calculateAvailableBalance,
  monthlyEquivalentAmount,
  sumMonthlyEquivalent,
  addMonthsClamped,
  sumMoneyBy,
  addDaysClamped,
  addInstallmentDate,
  distributeInstallmentAmounts,
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


test('normaliza pagos recurrentes a su equivalente mensual', () => {
  assert.equal(monthlyEquivalentAmount(120, 'monthly'), 120)
  assert.equal(monthlyEquivalentAmount(60, 'biweekly'), 130)
  assert.equal(monthlyEquivalentAmount(12, 'weekly'), 52)
  assert.equal(monthlyEquivalentAmount(90, 'quarterly'), 30)
  assert.equal(monthlyEquivalentAmount(1200, 'yearly'), 100)
  assert.equal(monthlyEquivalentAmount(50, 'custom'), null)
})

test('suma importes recurrentes sin mezclar frecuencias', () => {
  assert.equal(sumMonthlyEquivalent([
    { amount: 385, frequency: 'mensual' },
    { amount: 300, frequency: 'monthly' },
    { amount: 120, frequency: 'yearly' },
    { amount: 60, frequency: 'biweekly' },
  ]), 825)
})


test('adds months without overflowing the end of short months', () => {
  assert.equal(addMonthsClamped('2027-01-31', 1), '2027-02-28')
  assert.equal(addMonthsClamped('2028-01-31', 1), '2028-02-29')
  assert.equal(addMonthsClamped('2027-03-31', -1), '2027-02-28')
  assert.throws(() => addMonthsClamped('bad-date', 1), /fecha YYYY-MM-DD/)
  assert.throws(() => addMonthsClamped('2027-02-31', 1), /fecha no es válida/)
})

test('groups category totals without floating-point drift', () => {
  assert.deepEqual(sumMoneyBy([
    { category: 'Comida', amount: 0.1 },
    { category: 'Comida', amount: 0.2 },
    { category: 'Transporte', amount: 0.7 },
  ], (item) => item.category), {
    Comida: 0.3,
    Transporte: 0.7,
  })
})


test('calculates weekly, fortnightly and quarterly installment dates', () => {
  assert.equal(addInstallmentDate('2026-11-16', 'semanal', 2), '2026-11-30')
  assert.equal(addInstallmentDate('2026-11-16', 'quincenal', 2), '2026-12-14')
  assert.equal(addInstallmentDate('2026-11-16', 'trimestral', 2), '2027-05-16')
  assert.equal(addInstallmentDate('2026-01-31', 'mensual', 1), '2026-02-28')
  assert.equal(addDaysClamped('2026-12-31', 1), '2027-01-01')
  assert.throws(() => addInstallmentDate('2026-11-16', 'personalizado', 1), /frecuencia/)
})

test('distributes installment totals exactly in cents', () => {
  const amounts = distributeInstallmentAmounts(100, 3)
  assert.deepEqual(amounts, [33.34, 33.33, 33.33])
  assert.equal(sumMoney(amounts), 100)
  const custom = distributeInstallmentAmounts(100, 3, 40, 20)
  assert.deepEqual(custom, [40, 40, 20])
  assert.equal(sumMoney(custom), 100)
  assert.deepEqual(distributeInstallmentAmounts(0.05, 3), [0.02, 0.02, 0.01])
})

test('rejects installment schedules that cannot reconcile to the total', () => {
  assert.throws(() => distributeInstallmentAmounts(100, 2, 70, 40), /superan/)
  assert.throws(() => distributeInstallmentAmounts(100, 2, 40, 40), /no coincide/)
  assert.throws(() => distributeInstallmentAmounts(0.01, 2), /demasiado pequeño/)
})
