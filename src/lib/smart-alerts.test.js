import test from 'node:test'
import assert from 'node:assert/strict'
import { buildBudgetThresholdAlerts, buildOverdueInstallmentAlerts, buildUpcomingCommitmentSummary } from './smart-alerts.js'

test('budget alerts count posted expenses only and emit reached thresholds', () => {
  const alerts = buildBudgetThresholdAlerts({
    budgets: [{ id: 'b1', category_id: 'food', period_start: '2026-11-01', planned_amount: 100, category_name: 'Alimentación' }],
    transactions: [
      { kind: 'expense', status: 'posted', category_id: 'food', amount: 50, occurred_on: '2026-11-03' },
      { kind: 'expense', status: 'pending', category_id: 'food', amount: 50, occurred_on: '2026-11-04' },
      { kind: 'income', status: 'posted', category_id: 'food', amount: 500, occurred_on: '2026-11-05' },
    ],
  })
  assert.deepEqual(alerts.map((item) => item.threshold), [50])
  assert.equal(alerts[0].source_type, 'budget_threshold')
})

test('budget reminder keys make each threshold idempotent', () => {
  const input = {
    budgets: [{ id: 'b1', category_id: 'food', period_start: '2026-11-01', planned_amount: 100 }],
    transactions: [{ kind: 'expense', status: 'posted', category_id: 'food', amount: 100, occurred_on: '2026-11-10' }],
  }
  const alerts = buildBudgetThresholdAlerts(input)
  assert.deepEqual(alerts.map((item) => item.threshold), [50, 80, 100])
  assert.deepEqual(buildBudgetThresholdAlerts({ ...input, notifiedKeys: alerts.slice(0, 2).map((item) => item.reminder_key) }).map((item) => item.threshold), [100])
})

test('overdue alerts exclude paid, cancelled and due-today installments', () => {
  const alerts = buildOverdueInstallmentAlerts({
    today: '2026-11-22',
    installments: [
      { id: 'late', status: 'scheduled', due_on: '2026-11-21', amount: 20 },
      { id: 'today', status: 'scheduled', due_on: '2026-11-22', amount: 30 },
      { id: 'paid', status: 'paid', due_on: '2026-11-20', amount: 40 },
    ],
  })
  assert.deepEqual(alerts.map((item) => item.source_id), ['late'])
})

test('upcoming commitment summary respects horizon and chronological order', () => {
  const entries = buildUpcomingCommitmentSummary({
    today: '2026-11-22',
    daysAhead: 7,
    fixedPayments: [
      { id: 'later', name: 'Teléfono', amount: 15, status: 'active', next_due_on: '2026-11-28' },
      { id: 'past', name: 'Alquiler', amount: 385, status: 'active', next_due_on: '2026-11-20' },
    ],
    installments: [{ id: 'soon', plan_name: 'Móvil', amount: 40, status: 'scheduled', due_on: '2026-11-24' }],
  })
  assert.deepEqual(entries.map((item) => item.id), ['soon', 'later'])
})
