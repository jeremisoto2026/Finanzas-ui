import test from 'node:test'
import assert from 'node:assert/strict'
import { buildLocalReminderSchedule, localDateTimeToUtc } from '../src/lib/reminder-schedule.js'

test('converts reminder time using Europe/Madrid winter time', () => {
  const at = localDateTimeToUtc('2026-11-18', 9, 'Europe/Madrid')
  assert.equal(at.toISOString(), '2026-11-18T08:00:00.000Z')
})

test('respects the autumn daylight-saving change in Europe/Madrid', () => {
  const before = localDateTimeToUtc('2026-10-24', 9, 'Europe/Madrid')
  const after = localDateTimeToUtc('2026-10-25', 9, 'Europe/Madrid')
  assert.equal(before.toISOString(), '2026-10-24T07:00:00.000Z')
  assert.equal(after.toISOString(), '2026-10-25T08:00:00.000Z')
})

test('schedules only enabled upcoming payments and optional same-day reminders', () => {
  const schedule = buildLocalReminderSchedule({
    now: new Date('2026-11-17T06:00:00.000Z'),
    preferences: {
      fixed_payments_enabled: true,
      installments_enabled: true,
      reminder_days_before: 3,
      reminder_hour: 9,
      same_day_enabled: true,
      timezone: 'Europe/Madrid',
    },
    fixedPayments: [
      { id: 'fixed-1', name: 'Alquiler', amount: 300, currency_code: 'EUR', next_due_on: '2026-11-20', notification_enabled: true, status: 'active' },
      { id: 'fixed-2', name: 'Pausado', amount: 25, next_due_on: '2026-11-20', notification_enabled: true, status: 'paused' },
      { id: 'fixed-3', name: 'Sin avisos', amount: 20, next_due_on: '2026-11-20', notification_enabled: false, status: 'active' },
    ],
    installments: [
      { id: 'installment-1', amount: 9.85, due_on: '2026-11-21', status: 'scheduled', installment_plans: { name: 'Equipamiento', status: 'active' } },
      { id: 'installment-2', amount: 40, due_on: '2026-11-21', status: 'paid', installment_plans: { name: 'Teléfono', status: 'active' } },
      { id: 'installment-3', amount: 15, due_on: '2026-11-21', status: 'scheduled', installment_plans: { name: 'Cancelado', status: 'cancelled' } },
    ],
  })

  assert.equal(schedule.length, 4)
  assert.deepEqual(
    schedule.map((item) => item.schedule.at.toISOString()),
    [
      '2026-11-17T08:00:00.000Z',
      '2026-11-20T08:00:00.000Z',
      '2026-11-18T08:00:00.000Z',
      '2026-11-21T08:00:00.000Z',
    ].sort()
  )
  assert.equal(new Set(schedule.map((item) => item.id)).size, schedule.length)
  assert.ok(schedule.every((item) => item.isExactNotification === false))
  assert.ok(schedule.every((item) => item.schedule.allowWhileIdle === true))
})

test('does not recreate reminders whose local reminder time has already passed', () => {
  const schedule = buildLocalReminderSchedule({
    now: new Date('2026-11-18T09:30:00.000Z'),
    preferences: { reminder_days_before: 3, reminder_hour: 9, timezone: 'Europe/Madrid' },
    fixedPayments: [
      { id: 'fixed-1', name: 'Pago', amount: 20, next_due_on: '2026-11-21', notification_enabled: true, status: 'active' },
    ],
  })
  assert.equal(schedule.length, 0)
})

import { buildSmartLocalNotifications } from '../src/lib/reminder-schedule.js'

test('builds smart alerts once per stable key and daily summary', () => {
  const data = {
    today: '2026-11-22',
    budgetAlerts: [{ reminder_key: 'budget:b1:2026-11:80', source_type: 'budget_threshold', source_id: 'b1', title: 'Presupuesto al 80%', body: 'Alimentación: 80 € de 100 €.' }],
    overdueAlerts: [{ reminder_key: 'overdue-installment:i1:2026-11-20', source_type: 'overdue_installment', source_id: 'i1', title: 'Cuota vencida', body: 'Móvil: 40 €.' }],
    commitmentSummary: [{ title: 'Teléfono' }, { title: 'Alquiler' }],
    insufficientBalance: { freeEurCents: 5000, upcomingEurCents: 9000 },
  }
  const first = buildSmartLocalNotifications(data, { now: new Date('2026-11-22T10:00:00Z') })
  assert.equal(first.notifications.length, 4)
  assert.equal(new Set(first.notifications.map((item) => item.id)).size, 4)
  assert.ok(first.notifications.every((item) => item.schedule.at.toISOString() === '2026-11-22T10:00:12.000Z'))

  const second = buildSmartLocalNotifications(data, {
    now: new Date('2026-11-22T11:00:00Z'),
    notifiedKeys: first.keys,
  })
  assert.equal(second.notifications.length, 0)
})
