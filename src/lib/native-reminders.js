import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import {
  buildLocalReminderSchedule,
  NATIVE_REMINDER_ID_END,
  NATIVE_REMINDER_ID_START,
} from '@/lib/reminder-schedule'

export const DEFAULT_REMINDER_PREFERENCES = Object.freeze({
  fixed_payments_enabled: true,
  installments_enabled: true,
  reminder_days_before: 3,
  reminder_hour: 9,
  same_day_enabled: false,
  timezone: 'Europe/Madrid',
})

export function isFinanzasAndroid() {
  return Capacitor.getPlatform() === 'android'
}

export async function getNativeReminderData(supabase, userId) {
  const [preferencesResult, fixedResult, installmentsResult] = await Promise.all([
    supabase.from('notification_preferences')
      .select('fixed_payments_enabled, installments_enabled, reminder_days_before, reminder_hour, same_day_enabled, timezone')
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
  ])

  for (const result of [preferencesResult, fixedResult, installmentsResult]) {
    if (result.error) throw result.error
  }

  return {
    preferences: { ...DEFAULT_REMINDER_PREFERENCES, ...(preferencesResult.data || {}) },
    fixedPayments: fixedResult.data || [],
    installments: installmentsResult.data || [],
  }
}

export async function requestNativeReminderPermission() {
  if (!isFinanzasAndroid()) return { display: 'unsupported' }
  let permission = await LocalNotifications.checkPermissions()
  if (permission.display !== 'granted') {
    permission = await LocalNotifications.requestPermissions()
  }
  return permission
}

export async function syncNativeReminders(data) {
  if (!isFinanzasAndroid()) return { scheduled: 0, permission: 'unsupported' }

  const permission = await LocalNotifications.checkPermissions()
  if (permission.display !== 'granted') {
    return { scheduled: 0, permission: permission.display || 'prompt' }
  }

  await LocalNotifications.createChannel({
    id: 'finanzas-reminders',
    name: 'Recordatorios financieros',
    description: 'Avisos de pagos fijos y cuotas pendientes',
    importance: 4,
    vibration: true,
  })

  const pending = await LocalNotifications.getPending()
  const owned = (pending.notifications || [])
    .filter((item) => item.id >= NATIVE_REMINDER_ID_START && item.id < NATIVE_REMINDER_ID_END)
    .map((item) => ({ id: item.id }))
  if (owned.length) await LocalNotifications.cancel({ notifications: owned })

  const notifications = buildLocalReminderSchedule(data)
  if (notifications.length) {
    await LocalNotifications.schedule({ notifications })
  }

  return { scheduled: notifications.length, permission: permission.display }
}
