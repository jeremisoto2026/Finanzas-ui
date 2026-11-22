import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

import { createClient } from 'npm:@supabase/supabase-js@2.119.0'
import webpushModule from 'npm:web-push@3.6.7'

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const secretKeysRaw = Deno.env.get('SUPABASE_SECRET_KEYS')
const serviceRoleKey = secretKeysRaw
  ? (JSON.parse(secretKeysRaw) as Record<string, string>).default
  : Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing Supabase server environment variables.')
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const webpush = (webpushModule as unknown as { default?: typeof webpushModule }).default ?? webpushModule

const DEFAULTS = {
  fixed_payments_enabled: true,
  installments_enabled: true,
  reminder_days_before: 3,
  reminder_hour: 9,
  same_day_enabled: false,
  timezone: 'Europe/Madrid',
  budget_alerts_enabled: true,
  overdue_installments_enabled: true,
  balance_alerts_enabled: true,
  commitment_summary_enabled: true,
  commitment_summary_days: 7,
}

function localDateTime(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return {
    date: values.year + '-' + values.month + '-' + values.day,
    hour: Number(values.hour),
  }
}

function addDays(date: string, amount: number) {
  const value = new Date(date + 'T12:00:00.000Z')
  value.setUTCDate(value.getUTCDate() + amount)
  return value.toISOString().slice(0, 10)
}

function daysBetween(fromDate: string, toDate: string) {
  const from = Date.parse(fromDate + 'T00:00:00.000Z')
  const to = Date.parse(toDate + 'T00:00:00.000Z')
  return Math.round((to - from) / 86400000)
}

function safeEqual(left: string, right: string) {
  let difference = left.length ^ right.length
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0)
  }
  return difference === 0
}

type Candidate = {
  user_id: string
  reminder_key: string
  source_type: 'fixed_payment' | 'installment' | 'budget_threshold' | 'overdue_installment' | 'insufficient_balance' | 'commitment_summary'
  source_id: string | null
  title: string
  body: string
  due_on: string
  amount: number
  currency_code: string
  metadata?: Record<string, unknown>
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  try {
    const suppliedSecret = request.headers.get('x-cron-secret') || ''
    if (!suppliedSecret) return new Response('Unauthorized', { status: 401 })

    const { data: configRows, error: configError } = await supabase.rpc('get_push_service_config', {
      p_cron_secret: suppliedSecret,
    })
    if (configError) throw configError
    const config = Array.isArray(configRows) ? configRows[0] : configRows

    if (!config?.cron_secret || !safeEqual(suppliedSecret, config.cron_secret)) {
      return new Response('Unauthorized', { status: 401 })
    }

    const now = new Date()
    const { data: preferencesRows, error: preferencesError } = await supabase
      .from('notification_preferences')
      .select('user_id, fixed_payments_enabled, installments_enabled, reminder_days_before, reminder_hour, same_day_enabled, timezone, budget_alerts_enabled, overdue_installments_enabled, balance_alerts_enabled, commitment_summary_enabled, commitment_summary_days')
    if (preferencesError) throw preferencesError

    const preferences = new Map((preferencesRows || []).map((row) => [
      row.user_id,
      { ...DEFAULTS, ...row },
    ]))

    const utcToday = now.toISOString().slice(0, 10)
    const { data: fixedPayments, error: fixedError } = await supabase
      .from('fixed_payments')
      .select('id, user_id, name, amount, currency_code, next_due_on, notification_enabled, status')
      .eq('status', 'active')
      .eq('notification_enabled', true)
      .not('next_due_on', 'is', null)
      .gte('next_due_on', addDays(utcToday, -1))
      .lte('next_due_on', addDays(utcToday, 31))
    if (fixedError) throw fixedError

    const { data: installments, error: installmentsError } = await supabase
      .from('installments')
      .select('id, user_id, installment_number, amount, due_on, status, installment_plans!inner(name, status)')
      .eq('status', 'scheduled')
      .eq('installment_plans.status', 'active')
      .gte('due_on', addDays(utcToday, -365))
      .lte('due_on', addDays(utcToday, 31))
    if (installmentsError) throw installmentsError

    const monthStart = localDateTime(now, 'Europe/Madrid').date.slice(0, 7) + '-01'
    const monthEnd = addDays(monthStart, 32).slice(0, 7) + '-01'
    const monthLastDay = addDays(monthEnd, -1)
    const [budgetsResult, transactionsResult, balancesResult, reservationsResult] = await Promise.all([
      supabase.from('budgets').select('id, user_id, category_id, period_start, planned_amount, categories(name)').eq('period_start', monthStart),
      supabase.from('transactions').select('user_id, category_id, amount').eq('status', 'posted').eq('kind', 'expense').gte('occurred_on', monthStart).lte('occurred_on', monthLastDay),
      supabase.from('account_balances').select('user_id, currency_code, current_balance'),
      supabase.from('reservations').select('user_id, amount').eq('status', 'active'),
    ])
    if (budgetsResult.error) throw budgetsResult.error
    if (transactionsResult.error) throw transactionsResult.error
    if (balancesResult.error) throw balancesResult.error
    if (reservationsResult.error) throw reservationsResult.error
    const budgets = budgetsResult.data || []
    const monthTransactions = transactionsResult.data || []
    const accountBalances = balancesResult.data || []
    const activeReservations = reservationsResult.data || []

    const candidates: Candidate[] = []
    const userIds = new Set([
      ...(fixedPayments || []).map((row) => row.user_id),
      ...(installments || []).map((row) => row.user_id),
      ...budgets.map((row) => row.user_id),
    ])

    for (const userId of userIds) {
      const preference = preferences.get(userId) || DEFAULTS
      const local = localDateTime(now, preference.timezone || 'Europe/Madrid')
      if (local.hour < Number(preference.reminder_hour ?? 9)) continue

      if (preference.fixed_payments_enabled) {
        for (const payment of (fixedPayments || []).filter((row) => row.user_id === userId)) {
          const daysUntilDue = daysBetween(local.date, payment.next_due_on)
          const isAdvance = daysUntilDue === Number(preference.reminder_days_before ?? 3)
          const isSameDay = daysUntilDue === 0 && Boolean(preference.same_day_enabled)
          if (!isAdvance && !isSameDay) continue

          const name = payment.name || 'Pago fijo'
          const keyKind = isSameDay ? 'same-day' : 'before-' + daysUntilDue
          candidates.push({
            user_id: userId,
            reminder_key: 'fixed:' + payment.id + ':' + payment.next_due_on + ':' + keyKind,
            source_type: 'fixed_payment',
            source_id: payment.id,
            title: isSameDay ? 'Hoy vence: ' + name : 'Próximo pago: ' + name,
            body: isSameDay
              ? 'Hoy vence tu pago de ' + Number(payment.amount).toFixed(2) + ' ' + (payment.currency_code || 'EUR') + '.'
              : 'Tu pago de ' + Number(payment.amount).toFixed(2) + ' ' + (payment.currency_code || 'EUR') + ' vence dentro de ' + daysUntilDue + ' días.',
            due_on: payment.next_due_on,
            amount: Number(payment.amount),
            currency_code: payment.currency_code || 'EUR',
          })
        }
      }

      if (preference.installments_enabled) {
        for (const installment of (installments || []).filter((row) => row.user_id === userId)) {
          const daysUntilDue = daysBetween(local.date, installment.due_on)
          const isAdvance = daysUntilDue === Number(preference.reminder_days_before ?? 3)
          const isSameDay = daysUntilDue === 0 && Boolean(preference.same_day_enabled)
          if (!isAdvance && !isSameDay) continue

          const planName = installment.installment_plans?.name || 'Compra a cuotas'
          const keyKind = isSameDay ? 'same-day' : 'before-' + daysUntilDue
          candidates.push({
            user_id: userId,
            reminder_key: 'installment:' + installment.id + ':' + installment.due_on + ':' + keyKind,
            source_type: 'installment',
            source_id: installment.id,
            title: isSameDay ? 'Hoy vence una cuota: ' + planName : 'Próxima cuota: ' + planName,
            body: isSameDay
              ? 'Hoy vence la cuota ' + installment.installment_number + ' de ' + Number(installment.amount).toFixed(2) + ' EUR.'
              : 'La cuota ' + installment.installment_number + ' de ' + Number(installment.amount).toFixed(2) + ' EUR vence dentro de ' + daysUntilDue + ' días.',
            due_on: installment.due_on,
            amount: Number(installment.amount),
            currency_code: 'EUR',
          })
        }
      }
      if (preference.budget_alerts_enabled) {
        for (const budget of budgets.filter((row) => row.user_id === userId)) {
          const spent = monthTransactions.filter((row) => row.user_id === userId && row.category_id === budget.category_id).reduce((sum, row) => sum + Number(row.amount || 0), 0)
          const limit = Number(budget.planned_amount || 0)
          if (limit <= 0) continue
          for (const threshold of [50, 80, 100]) {
            if (spent + 0.000001 < limit * threshold / 100) continue
            candidates.push({ user_id: userId, reminder_key: 'budget:' + budget.id + ':' + monthStart.slice(0, 7) + ':' + threshold, source_type: 'budget_threshold', source_id: budget.id, title: 'Presupuesto al ' + threshold + '%', body: (budget.categories?.name || 'Una categoría') + ': has utilizado ' + spent.toFixed(2) + ' € de ' + limit.toFixed(2) + ' €.', due_on: local.date, amount: Number(spent.toFixed(2)), currency_code: 'EUR', metadata: { threshold, spent: Number(spent.toFixed(2)), budget: limit, period: monthStart.slice(0, 7) } })
          }
        }
      }

      if (preference.overdue_installments_enabled) {
        for (const installment of (installments || []).filter((row) => row.user_id === userId && row.due_on < local.date)) {
          candidates.push({ user_id: userId, reminder_key: 'overdue-installment:' + installment.id + ':' + installment.due_on, source_type: 'overdue_installment', source_id: installment.id, title: 'Cuota vencida: ' + (installment.installment_plans?.name || 'Compra a cuotas'), body: 'La cuota ' + installment.installment_number + ' de ' + Number(installment.amount).toFixed(2) + ' € venció el ' + installment.due_on + ' y sigue pendiente.', due_on: installment.due_on, amount: Number(installment.amount), currency_code: 'EUR' })
        }
      }

      const horizon = Math.max(1, Math.min(31, Number(preference.commitment_summary_days || 7)))
      const upcomingFixed = (fixedPayments || []).filter((row) => row.user_id === userId && preference.fixed_payments_enabled && daysBetween(local.date, row.next_due_on) >= 0 && daysBetween(local.date, row.next_due_on) <= horizon)
      const upcomingInstallments = (installments || []).filter((row) => row.user_id === userId && preference.installments_enabled && row.due_on >= local.date && daysBetween(local.date, row.due_on) <= horizon)
      const upcomingTotal = [...upcomingFixed, ...upcomingInstallments].reduce((sum, row) => sum + Number(row.amount || 0), 0)
      const summaryParts = [...upcomingFixed.map((row) => ({ name: row.name || 'Pago fijo', due_on: row.next_due_on, amount: Number(row.amount) })), ...upcomingInstallments.map((row) => ({ name: row.installment_plans?.name || 'Cuota', due_on: row.due_on, amount: Number(row.amount) }))].sort((a, b) => a.due_on.localeCompare(b.due_on))
      if (preference.commitment_summary_enabled && summaryParts.length) {
        candidates.push({ user_id: userId, reminder_key: 'commitments-summary:' + local.date + ':' + horizon, source_type: 'commitment_summary', source_id: null, title: 'Compromisos de los próximos ' + horizon + ' días', body: summaryParts.length + ' pagos pendientes por un total de ' + upcomingTotal.toFixed(2) + ' €.', due_on: local.date, amount: Number(upcomingTotal.toFixed(2)), currency_code: 'EUR', metadata: { horizon_days: horizon, commitments: summaryParts } })
      }
      if (preference.balance_alerts_enabled && upcomingTotal > 0) {
        const balance = accountBalances.filter((row) => row.user_id === userId && String(row.currency_code || 'EUR').trim() === 'EUR').reduce((sum, row) => sum + Number(row.current_balance || 0), 0)
        const reserved = activeReservations.filter((row) => row.user_id === userId).reduce((sum, row) => sum + Number(row.amount || 0), 0)
        const free = balance - reserved
        if (free < upcomingTotal) candidates.push({ user_id: userId, reminder_key: 'insufficient-balance:' + local.date, source_type: 'insufficient_balance', source_id: null, title: 'Saldo libre insuficiente', body: 'Tienes ' + free.toFixed(2) + ' € libres y compromisos próximos por ' + upcomingTotal.toFixed(2) + ' €.', due_on: local.date, amount: Number(upcomingTotal.toFixed(2)), currency_code: 'EUR', metadata: { free_balance: Number(free.toFixed(2)), upcoming_commitments: Number(upcomingTotal.toFixed(2)), horizon_days: horizon } })
      }
    }

    let created = 0
    for (const candidate of candidates) {
      const { data, error } = await supabase.from('notifications')
        .insert({ ...candidate, metadata: candidate.metadata || {}, push_status: 'pending' })
        .select('id')
        .maybeSingle()

      if (error && error.code !== '23505') throw error
      if (data?.id) created += 1
    }

    const pendingSince = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString()
    const { error: expireError } = await supabase.from('notifications')
      .update({
        push_status: 'failed',
        last_error: 'El aviso superó la ventana de reintentos de 48 horas.',
      })
      .eq('push_status', 'pending')
      .lt('created_at', pendingSince)
    if (expireError) throw expireError

    const { data: pending, error: pendingError } = await supabase.from('notifications')
      .select('id, user_id, reminder_key, title, body, due_on, amount, currency_code')
      .in('push_status', ['pending', 'failed'])
      .gte('created_at', pendingSince)
      .order('created_at', { ascending: true })
      .limit(100)
    if (pendingError) throw pendingError

    const userIdsPending = [...new Set((pending || []).map((row) => row.user_id))]
    let sent = 0
    let failed = 0
    let withoutDevice = 0

    if ((pending || []).length > 0) {
      webpush.setVapidDetails(
        'https://finanzas-ui-seven.vercel.app',
        config.vapid_public_key,
        config.vapid_private_key,
      )

      const { data: subscriptions, error: subscriptionsError } = await supabase
        .from('push_subscriptions')
        .select('id, user_id, endpoint, p256dh, auth')
        .in('user_id', userIdsPending)
      if (subscriptionsError) throw subscriptionsError

      const subscriptionsByUser = new Map<string, typeof subscriptions>()
      for (const subscription of subscriptions || []) {
        const list = subscriptionsByUser.get(subscription.user_id) || []
        list.push(subscription)
        subscriptionsByUser.set(subscription.user_id, list)
      }

      for (const notification of pending || []) {
        const deviceSubscriptions = subscriptionsByUser.get(notification.user_id) || []
        if (deviceSubscriptions.length === 0) {
          withoutDevice += 1
          continue
        }

        let delivered = false
        const errors: string[] = []
        for (const subscription of deviceSubscriptions) {
          try {
            await webpush.sendNotification(
              {
                endpoint: subscription.endpoint,
                keys: { p256dh: subscription.p256dh, auth: subscription.auth },
              },
              JSON.stringify({
                title: notification.title,
                body: notification.body,
                url: '/',
                tag: notification.reminder_key,
                notificationId: notification.id,
              }),
              { TTL: 86400 },
            )
            delivered = true
          } catch (pushError) {
            const statusCode = Number((pushError as { statusCode?: number })?.statusCode || 0)
            errors.push(pushError instanceof Error ? pushError.message : String(pushError))
            if (statusCode === 404 || statusCode === 410) {
              await supabase.from('push_subscriptions').delete().eq('id', subscription.id)
            }
          }
        }

        if (delivered) {
          const { error: updateError } = await supabase.from('notifications')
            .update({ push_status: 'sent', sent_at: new Date().toISOString(), last_error: null })
            .eq('id', notification.id)
          if (updateError) throw updateError
          sent += 1
        } else {
          const { error: updateError } = await supabase.from('notifications')
            .update({ push_status: 'failed', last_error: errors.slice(0, 3).join(' | ').slice(0, 1000) || 'No se pudo entregar el aviso.' })
            .eq('id', notification.id)
          if (updateError) throw updateError
          failed += 1
        }
      }
    }

    return Response.json({
      success: true,
      created,
      sent,
      failed,
      withoutDevice,
      checkedAt: now.toISOString(),
    })
  } catch (error) {
    console.error('send-reminders error:', error)
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown reminder error',
    }, { status: 500 })
  }
})
