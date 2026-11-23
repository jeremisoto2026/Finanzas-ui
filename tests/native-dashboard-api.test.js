import test from 'node:test'
import assert from 'node:assert/strict'
import { getAndroidCreateKind, getReadOnlyFinanceResource } from '../src/lib/native-dashboard-api.js'

test('maps Dashboard read routes to the secure snapshot fields', () => {
  assert.equal(getReadOnlyFinanceResource('/api/cuentas'), 'accounts')
  assert.equal(getReadOnlyFinanceResource('/api/gastos'), 'expenses')
  assert.equal(getReadOnlyFinanceResource('/api/ingresos'), 'incomes')
  assert.equal(getReadOnlyFinanceResource('/api/presupuestos'), 'budgets')
  assert.equal(getReadOnlyFinanceResource('/api/compras-cuotas'), 'installmentPlans')
  assert.equal(getReadOnlyFinanceResource('/api/pagos-fijos'), 'fixedPayments')
  assert.equal(getReadOnlyFinanceResource('/api/deudas'), 'debts')
  assert.equal(getReadOnlyFinanceResource('/api/compromisos'), 'replenishments')
})

test('maps expense category lookups and rejects unknown API routes', () => {
  assert.equal(getReadOnlyFinanceResource('/api/gastos', '?resource=categories'), 'expenseCategories')
  assert.equal(getReadOnlyFinanceResource('/api/no-disponible'), null)
})


test('allows only expense and income creation from Android', () => {
  assert.equal(getAndroidCreateKind('/api/gastos'), 'expense')
  assert.equal(getAndroidCreateKind('/api/ingresos'), 'income')
  assert.equal(getAndroidCreateKind('/api/cuentas'), null)
  assert.equal(getAndroidCreateKind('/api/transferencias'), null)
})
