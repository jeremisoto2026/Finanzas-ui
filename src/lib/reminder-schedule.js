const RESERVED_ID_START = 1_400_000_000
const RESERVED_ID_RANGE = 600_000_000

export const NATIVE_REMINDER_ID_START = RESERVED_ID_START
export const NATIVE_REMINDER_ID_END = RESERVED_ID_START + RESERVED_ID_RANGE

function dateParts(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').slice(0, 10))
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth) return null
  return { year, month, day }
}

function addCalendarDays(value, days) {
  const parts = dateParts(value)
  if (!parts) return null
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days))
  return date.toISOString().slice(0, 10)
}

function zonedParts(date, timeZone) {
  const values = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date).map((part) => [part.type, part.value]))
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
  }
}

export function localDateTimeToUtc(dateOnly, hour, timeZone = 'Europe/Madrid') {
  const parts = dateParts(dateOnly)
  if (!parts || !Number.isInteger(hour) || hour < 0 || hour > 23) return null
  const targetUtc = Date.UTC(parts.year, parts.month - 1, parts.day, hour, 0, 0)
  let guess = targetUtc
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const actual = zonedParts(new Date(guess), timeZone)
    const actualUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, 0)
    const delta = targetUtc - actualUtc
    if (delta === 0) break
    guess += delta
  }
  return new Date(guess)
}

function stableNotificationId(key) {
  let hash = 2166136261
  for (const char of String(key)) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return RESERVED_ID_START + ((hash >>> 0) % RESERVED_ID_RANGE)
}

function currencyLabel(amount, currencyCode = 'EUR') {
  try {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: currencyCode || 'EUR' }).format(Number(amount || 0))
  } catch {
    return Number(amount || 0).toFixed(2) + ' ' + (currencyCode || 'EUR')
  }
}

function reminderCandidate({ sourceType, sourceId, dueOn, title, amount, currencyCode, daysBefore, reminderHour, timezone, now }) {
  const triggerDate = addCalendarDays(dueOn, -daysBefore)
  if (!triggerDate) return null
  const at = localDateTimeToUtc(triggerDate, reminderHour, timezone)
  if (!at || at.getTime() <= now.getTime()) return null

  const isSameDay = daysBefore === 0
  const reminderKey = [sourceType, sourceId, dueOn, isSameDay ? 'same-day' : 'before-' + daysBefore].join(':')
  const amountText = currencyLabel(amount, currencyCode)
  const body = isSameDay
    ? 'Hoy vence ' + amountText + '. Revisa este compromiso en Finanzas.'
    : 'Vence en ' + daysBefore + ' días: ' + amountText + '. Revisa este compromiso en Finanzas.'

  return {
    id: stableNotificationId(reminderKey),
    title: isSameDay ? title.replace(/^Próximo pago:/, 'Hoy vence:').replace(/^Próxima cuota:/, 'Hoy vence:') : title,
    body,
    schedule: { at, allowWhileIdle: false },
    channelId: 'finanzas-reminders',
    smallIcon: 'ic_stat_finanzas',
    iconColor: '#18B887',
    isExactNotification: false,
    extra: { sourceType, sourceId, dueOn, reminderKey },
  }
}

/**
 * Builds only future reminders. Native notifications are a local convenience;
 * the server-side reminder history remains the source of truth.
 */
export function buildLocalReminderSchedule({
  fixedPayments = [],
  installments = [],
  preferences = {},
  now = new Date(),
}) {
  const enabledFixed = preferences.fixed_payments_enabled !== false
  const enabledInstallments = preferences.installments_enabled !== false
  const daysBefore = Number(preferences.reminder_days_before ?? 3)
  const reminderHour = Number(preferences.reminder_hour ?? 9)
  const timezone = preferences.timezone || 'Europe/Madrid'
  if (!Number.isInteger(daysBefore) || daysBefore < 1 || daysBefore > 30) return []
  if (!Number.isInteger(reminderHour) || reminderHour < 0 || reminderHour > 23) return []

  const candidates = []
  const add = (entry) => {
    const candidate = reminderCandidate({ ...entry, daysBefore, reminderHour, timezone, now })
    if (candidate) candidates.push(candidate)
    if (preferences.same_day_enabled) {
      const sameDay = reminderCandidate({ ...entry, daysBefore: 0, reminderHour, timezone, now })
      if (sameDay) candidates.push(sameDay)
    }
  }

  if (enabledFixed) {
    for (const payment of fixedPayments) {
      if (payment.status !== 'active' || payment.notification_enabled !== true || !payment.next_due_on) continue
      add({
        sourceType: 'fixed_payment',
        sourceId: payment.id,
        dueOn: String(payment.next_due_on).slice(0, 10),
        title: 'Próximo pago: ' + (payment.name || 'Pago fijo'),
        amount: payment.amount,
        currencyCode: payment.currency_code || 'EUR',
      })
    }
  }

  if (enabledInstallments) {
    for (const installment of installments) {
      if (installment.status !== 'scheduled' || !installment.due_on) continue
      const planRelation = installment.installment_plans
      const plan = Array.isArray(planRelation) ? planRelation[0] : planRelation
      if (plan && plan.status !== 'active') continue
      add({
        sourceType: 'installment',
        sourceId: installment.id,
        dueOn: String(installment.due_on).slice(0, 10),
        title: 'Próxima cuota: ' + (plan?.name || 'Compra financiada'),
        amount: installment.amount,
        currencyCode: 'EUR',
      })
    }
  }

  const unique = new Map()
  for (const item of candidates) unique.set(item.id, item)
  return [...unique.values()]
    .sort((a, b) => a.schedule.at.getTime() - b.schedule.at.getTime())
    .slice(0, 100)
}
