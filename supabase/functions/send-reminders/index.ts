import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

import { createClient } from 'npm:@supabase/supabase-js@2.119.0'
import webpushModule from 'npm:web-push@3.6.7'

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
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
  source_type: 'fixed_payment' | 'installment'
  source_id: string
  title: string
  body: string
  due_on: string
  amount: number
  currency_code: string
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  try {
    const { data: configRows, error: configError } = await supabase.rpc('get_push_service_config')
    if (configError) throw configError
    const config = Array.isArray(configRows) ? configRows[0] : configRows
    const suppliedSecret = request.headers.get('x-cron-secret') || ''

    if (!config?.cron_secret || !safeEqual(suppliedSecret, config.cron_secret)) {
      return new Response('Unauthorized', { status: 401 })
    }

    const now = new Date()
    const { data: preferencesRows, error: preferencesError } = await supabase
      .from('notification_preferences')
      .select('user_id, fixed_payments_enabled, installments_enabled, reminder_days_before, reminder_hour, same_day_enabled, timezone')
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
      .lte('next_due_on', addDays(utcToday, 8))
    if (fixedError) throw fixedError

    const { data: installments, error: installmentsError } = await supabase
      .from('installments')
      .select('id, user_id, installment_number, amount, due_on, status, installment_plans!inner(name, status)')
      .eq('status', 'scheduled')
      .eq('installment_plans.status', 'active')
      .gte('due_on', addDays(utcToday, -1))
      .lte('due_on', addDays(utcToday, 8))
    if (installmentsError) throw installmentsError

    const candidates: Candidate[] = []
    const userIds = new Set([
      ...(fixedPayments || []).map((row) => row.user_id),
      ...(installments || []).map((row) => row.user_id),
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
    }

    let created = 0
    for (const candidate of candidates) {
      const { data, error } = await supabase.from('notifications')
        .insert({ ...candidate, push_status: 'pending' })
        .select('id')
        .maybeSingle()

      if (error && error.code !== '23505') throw error
      if (data?.id) created += 1
    }

    const pendingSince = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString()
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
