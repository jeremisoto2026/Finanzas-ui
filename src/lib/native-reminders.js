import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { localDateInputValue } from '@/lib/finance-core'
import {
  buildBudgetThresholdAlerts,
  buildOverdueInstallmentAlerts,
  buildUpcomingCommitmentSummary,
} from '@/lib/smart-alerts'
import {
  NATIVE_REMINDER_ID_END,
  NATIVE_REMINDER_ID_START,
} from '@/lib/reminder-schedule'

export const DEFAULT_REMINDER_PREFERENCES = Object.freeze({
  fixed_payments_enabled: true,
  installments_enabled: true,
  reminder_days_before: 3,
  reminder_hour: 9,
  same_day_enabled: false,
  budget_alerts_enabled: true,
  overdue_installments_enabled: true,
  balance_alerts_enabled: true,
  commitment_summary_enabled: true,
  commitment_summary_days: 7,
  timezone: 'Europe/Madrid',
})

export function isFinanzasAndroid() {
  return Capacitor.getPlatform() === 'android'
}

export function hasNativeReminderPlugin() {
  // Capacitor's JS availability probe can run before Bridge plugin discovery finishes.
  // The Android module is linked at build time; let the real native call report any integration error.
  return isFinanzasAndroid()
}

export async function getNativeReminderData(supabase, userId) {
  const today = localDateInputValue(new Date())
  const monthStart = today.slice(0, 7) + '-01'
  const [preferencesResult, fixedResult, installmentsResult, budgetsResult, transactionsResult, balancesResult, reservationsResult] = await Promise.all([
    supabase.from('notification_preferences')
      .select('fixed_payments_enabled, installments_enabled, reminder_days_before, reminder_hour, same_day_enabled, timezone, budget_alerts_enabled, overdue_installments_enabled, balance_alerts_enabled, commitment_summary_enabled, commitment_summary_days')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase.from('fixed_payments')
      .select('id, name, amount, currency_code, next_due_on, notification_enabled, status')
      .eq('user_id', userId)
      .eq('status', 'active'),
    supabase.from('installments')
      .select('id, installment_number, amount, due_on, status, installment_plans!inner(name, status)')
      .eq('user_id', userId)
      .eq('status', 'scheduled')
      .eq('installment_plans.status', 'active'),
    supabase.from('budgets')
      .select('id, category_id, period_start, planned_amount, categories(name)')
      .eq('user_id', userId)
      .gte('period_start', monthStart),
    supabase.from('transactions')
      .select('id, category_id, kind, status, amount, occurred_on')
      .eq('user_id', userId)
      .eq('status', 'posted')
      .eq('kind', 'expense')
      .gte('occurred_on', monthStart)
      .lte('occurred_on', today),
    supabase.from('account_balances')
      .select('account_id, currency_code, current_balance')
      .eq('user_id', userId),
    supabase.from('reservations')
      .select('account_id, amount, status')
      .eq('user_id', userId)
      .eq('status', 'active'),
  ])

  for (const result of [preferencesResult, fixedResult, installmentsResult, budgetsResult, transactionsResult, balancesResult, reservationsResult]) {
    if (result.error) throw result.error
  }

  const preferences = { ...DEFAULT_REMINDER_PREFERENCES, ...(preferencesResult.data || {}) }
  const budgets = (budgetsResult.data || []).map((budget) => ({
    ...budget,
    category_name: Array.isArray(budget.categories) ? budget.categories[0]?.name : budget.categories?.name,
  }))
  const installments = (installmentsResult.data || []).map((item) => {
    const plan = Array.isArray(item.installment_plans) ? item.installment_plans[0] : item.installment_plans
    return { ...item, plan_name: plan?.name }
  })

  const balances = balancesResult.data || []
  const reservations = reservationsResult.data || []
  const eurBalanceCents = Math.round(balances.filter((item) => item.currency_code === 'EUR')
    .reduce((sum, item) => sum + Number(item.current_balance || 0), 0) * 100)
  const eurReservedCents = Math.round(reservations.reduce((sum, item) => {
    if (!item.account_id) return sum
    const account = balances.find((balance) => balance.account_id === item.account_id)
    return account?.currency_code === 'EUR' ? sum + Number(item.amount || 0) * 100 : sum
  }, 0))
  const upcoming = buildUpcomingCommitmentSummary({
    fixedPayments: fixedResult.data || [],
    installments,
    today,
    daysAhead: Number(preferences.commitment_summary_days || 7),
  })
  const upcomingEurCents = Math.round(upcoming.reduce((sum, item) => {
    const source = item.kind === 'fixed_payment'
      ? (fixedResult.data || []).find((payment) => payment.id === item.id)
      : installments.find((installment) => installment.id === item.id)
    const currency = source?.currency_code || 'EUR'
    return currency === 'EUR' ? sum + Number(item.amount || 0) * 100 : sum
  }, 0))
  const freeEurCents = eurBalanceCents - eurReservedCents
  const uncoveredEurCents = Math.max(0, upcomingEurCents - eurReservedCents)

  return {
    preferences,
    fixedPayments: fixedResult.data || [],
    installments,
    smartAlerts: {
      today,
      budgetAlerts: preferences.budget_alerts_enabled
        ? buildBudgetThresholdAlerts({ budgets, transactions: transactionsResult.data || [] })
        : [],
      overdueAlerts: preferences.overdue_installments_enabled
        ? buildOverdueInstallmentAlerts({ installments, today })
        : [],
      commitmentSummary: preferences.commitment_summary_enabled ? upcoming : [],
      insufficientBalance: preferences.balance_alerts_enabled && uncoveredEurCents > freeEurCents
        ? { freeEurCents, upcomingEurCents, uncoveredEurCents }
        : null,
    },
  }
}

export async function requestNativeReminderPermission() {
  if (!isFinanzasAndroid()) return { display: 'unsupported' }
  if (!hasNativeReminderPlugin()) throw new Error('El módulo nativo de notificaciones no está integrado en esta APK. Instala la última versión de Finanzas.')
  let permission = await LocalNotifications.checkPermissions()
  if (permission.display !== 'granted') {
    permission = await LocalNotifications.requestPermissions()
  }
  return permission
}

export async function cancelNativeReminders() {
  if (!isFinanzasAndroid()) return
  const pending = await LocalNotifications.getPending()
  const owned = (pending.notifications || [])
    .filter((item) => item.id >= NATIVE_REMINDER_ID_START && item.id < NATIVE_REMINDER_ID_END)
    .map((item) => ({ id: item.id }))
  if (owned.length) await LocalNotifications.cancel({ notifications: owned })
}

export async function syncNativeReminders() {
  if (!isFinanzasAndroid()) return { scheduled: 0, permission: 'unsupported' }
  if (!hasNativeReminderPlugin()) throw new Error('El módulo nativo de notificaciones no está integrado en esta APK.')

  const permission = await LocalNotifications.checkPermissions()
  if (permission.display !== 'granted') {
    return { scheduled: 0, permission: permission.display || 'prompt' }
  }

  // FCM is now the single delivery channel for reminders and smart alerts.
  // Clear legacy local schedules so the same alert is not shown again on app resume.
  await cancelNativeReminders()
  return { scheduled: 0, permission: permission.display }
}
