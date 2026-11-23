import { toCents, fromCents } from './finance-core.js'

const DEFAULT_THRESHOLDS = [50, 80, 100]

function validDate(value) {
  const text = String(value || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null
  const date = new Date(text + 'T00:00:00.000Z')
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text ? text : null
}

function daysBetween(from, to) {
  return Math.round((Date.parse(to + 'T00:00:00.000Z') - Date.parse(from + 'T00:00:00.000Z')) / 86400000)
}

export function buildBudgetThresholdAlerts({ budgets = [], transactions = [], thresholds = DEFAULT_THRESHOLDS, notifiedKeys = [] }) {
  const validThresholds = [...new Set(thresholds.map(Number))]
    .filter((value) => DEFAULT_THRESHOLDS.includes(value))
    .sort((a, b) => a - b)
  const notified = new Set(notifiedKeys)
  const spentByCategoryAndMonth = new Map()

  for (const transaction of transactions) {
    if (transaction.status !== 'posted' || (transaction.kind || transaction.type) !== 'expense') continue
    const categoryId = transaction.category_id || transaction.categoryId
    const occurredOn = validDate(transaction.occurred_on || transaction.date)
    if (!categoryId || !occurredOn) continue
    const key = occurredOn.slice(0, 7) + ':' + categoryId
    spentByCategoryAndMonth.set(key, (spentByCategoryAndMonth.get(key) || 0) + toCents(transaction.amount))
  }

  const alerts = []
  for (const budget of budgets) {
    const periodStart = validDate(budget.period_start || (String(budget.month || '') + '-01'))
    const categoryId = budget.category_id || budget.categoryId
    const budgetCents = toCents(budget.planned_amount ?? budget.amount ?? 0)
    if (!periodStart || !categoryId || budgetCents <= 0) continue
    const spentCents = spentByCategoryAndMonth.get(periodStart.slice(0, 7) + ':' + categoryId) || 0
    for (const threshold of validThresholds) {
      const reminderKey = 'budget:' + budget.id + ':' + periodStart.slice(0, 7) + ':' + threshold
      if (notified.has(reminderKey) || spentCents < Math.ceil(budgetCents * threshold / 100)) continue
      alerts.push({
        reminder_key: reminderKey,
        source_type: 'budget_threshold',
        source_id: budget.id,
        title: 'Presupuesto al ' + threshold + '%',
        body: (budget.category_name || budget.category || 'Categoría') + ': ' +
          fromCents(spentCents).toFixed(2) + ' € de ' + fromCents(budgetCents).toFixed(2) + ' €.',
        due_on: periodStart,
        amount: fromCents(spentCents),
        currency_code: 'EUR',
        threshold,
      })
    }
  }
  return alerts
}

export function buildOverdueInstallmentAlerts({ installments = [], today }) {
  const currentDate = validDate(today)
  if (!currentDate) return []
  return installments.filter((item) =>
    item.status === 'scheduled' && validDate(item.due_on) && item.due_on < currentDate
  ).map((item) => ({
    reminder_key: 'overdue-installment:' + item.id + ':' + item.due_on,
    source_type: 'overdue_installment',
    source_id: item.id,
    title: 'Cuota vencida',
    body: (item.plan_name || item.name || 'Compra financiada') + ': cuota pendiente de ' + Number(item.amount || 0).toFixed(2) + ' €.',
    due_on: item.due_on,
    amount: Number(item.amount || 0),
    currency_code: 'EUR',
  }))
}

export function buildUpcomingCommitmentSummary({ fixedPayments = [], installments = [], today, daysAhead = 7 }) {
  const currentDate = validDate(today)
  const horizon = Number(daysAhead)
  if (!currentDate || !Number.isInteger(horizon) || horizon < 1 || horizon > 31) return []
  const entries = []
  for (const payment of fixedPayments) {
    if (payment.status !== 'active' || payment.notification_enabled === false) continue
    const dueOn = validDate(payment.next_due_on)
    if (!dueOn) continue
    const days = daysBetween(currentDate, dueOn)
    if (days >= 0 && days <= horizon) entries.push({
      kind: 'fixed_payment', id: payment.id, title: payment.name || 'Pago fijo',
      amount: Number(payment.amount || 0), due_on: dueOn,
    })
  }
  for (const installment of installments) {
    if (installment.status !== 'scheduled') continue
    const dueOn = validDate(installment.due_on)
    if (!dueOn) continue
    const days = daysBetween(currentDate, dueOn)
    if (days >= 0 && days <= horizon) entries.push({
      kind: 'installment', id: installment.id, title: installment.plan_name || installment.name || 'Cuota',
      amount: Number(installment.amount || 0), due_on: dueOn,
    })
  }
  return entries.sort((a, b) => a.due_on.localeCompare(b.due_on) || a.title.localeCompare(b.title))
}
