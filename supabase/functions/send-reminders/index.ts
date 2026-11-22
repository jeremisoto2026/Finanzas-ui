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

const firebaseServiceAccountRaw = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON')
let firebaseAccessToken: { value: string; expiresAt: number } | null = null

function base64Url(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/=/g, '').replace(/\\+/g, '-').replace(/\\//g, '_')
}

function base64UrlText(value: string) {
  return base64Url(new TextEncoder().encode(value))
}

function pemToBytes(pem: string) {
  const base64 = pem.replace(/-----BEGIN PRIVATE KEY-----/g, '').replace(/-----END PRIVATE KEY-----/g, '').replace(/\\s/g, '')
  const binary = atob(base64)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

async function getFirebaseAccessToken() {
  if (!firebaseServiceAccountRaw) throw new Error('Falta el secreto FIREBASE_SERVICE_ACCOUNT_JSON en Preview.')
  if (firebaseAccessToken && firebaseAccessToken.expiresAt > Date.now() + 60_000) return firebaseAccessToken.value

  const account = JSON.parse(firebaseServiceAccountRaw) as {
    project_id: string
    client_email: string
    private_key: string
    token_uri?: string
  }
  if (!account.project_id || !account.client_email || !account.private_key) {
    throw new Error('La credencial de Firebase no contiene project_id, client_email y private_key.')
  }

  const now = Math.floor(Date.now() / 1000)
  const unsigned = base64UrlText(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' +
    base64UrlText(JSON.stringify({
      iss: account.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: account.token_uri || 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }))
  const signingKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToBytes(account.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = new Uint8Array(await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    signingKey,
    new TextEncoder().encode(unsigned),
  ))
  const assertion = unsigned + '.' + base64Url(signature)
  const response = await fetch(account.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })
  const tokenBody = await response.json()
  if (!response.ok || !tokenBody.access_token) {
    throw new Error('Google OAuth no pudo emitir un token FCM: ' + JSON.stringify(tokenBody).slice(0, 500))
  }
  firebaseAccessToken = {
    value: tokenBody.access_token,
    expiresAt: Date.now() + Number(tokenBody.expires_in || 3600) * 1000,
  }
  return firebaseAccessToken.value
}

async function sendFirebaseNotification(
  projectId: string,
  deviceToken: string,
  notification: { id: string; title: string; body: string; reminder_key: string },
) {
  const accessToken = await getFirebaseAccessToken()
  const response = await fetch(
    'https://fcm.googleapis.com/v1/projects/' + encodeURIComponent(projectId) + '/messages:send',
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token: deviceToken,
          notification: { title: notification.title, body: notification.body },
          data: {
            notificationId: notification.id,
            reminderKey: notification.reminder_key,
            url: '/',
          },
          android: { priority: 'HIGH' },
        },
      }),
    },
  )
  const responseBody = await response.json().catch(() => ({}))
  if (!response.ok) {
    const errorCode = responseBody?.error?.details?.find?.((detail: { errorCode?: string }) => detail.errorCode)?.errorCode || ''
    const error = new Error('FCM HTTP ' + response.status + ': ' + JSON.stringify(responseBody).slice(0, 700))
    ;(error as Error & { statusCode?: number; fcmErrorCode?: string }).statusCode = response.status
    ;(error as Error & { statusCode?: number; fcmErrorCode?: string }).fcmErrorCode = errorCode
    throw error
  }
  return responseBody
}

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
      supabase.from('account_balances').select('account_id, user_id, currency_code, current_balance'),
      supabase.from('reservations').select('user_id, account_id, amount').eq('status', 'active'),
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
      const summaryParts = [
        ...upcomingFixed.map((row) => ({ name: row.name || 'Pago fijo', due_on: row.next_due_on, amount: Number(row.amount), currency_code: String(row.currency_code || 'EUR').trim() })),
        ...upcomingInstallments.map((row) => ({ name: row.installment_plans?.name || 'Cuota', due_on: row.due_on, amount: Number(row.amount), currency_code: 'EUR' })),
      ].sort((a, b) => a.due_on.localeCompare(b.due_on))
      const totalsByCurrency = summaryParts.reduce((totals, item) => {
        totals[item.currency_code] = (totals[item.currency_code] || 0) + item.amount
        return totals
      }, {} as Record<string, number>)
      const summaryText = Object.entries(totalsByCurrency).map(([currency, total]) => total.toFixed(2) + ' ' + currency).join(' · ')
      const upcomingEur = Number(totalsByCurrency.EUR || 0)
      if (preference.commitment_summary_enabled && summaryParts.length) {
        candidates.push({ user_id: userId, reminder_key: 'commitments-summary:' + local.date + ':' + horizon, source_type: 'commitment_summary', source_id: null, title: 'Compromisos de los próximos ' + horizon + ' días', body: summaryParts.length + ' pagos pendientes: ' + summaryText + '.', due_on: local.date, amount: upcomingEur, currency_code: 'EUR', metadata: { horizon_days: horizon, commitments: summaryParts, totals_by_currency: totalsByCurrency } })
      }
      if (preference.balance_alerts_enabled && upcomingEur > 0) {
        const eurAccounts = accountBalances.filter((row) => row.user_id === userId && String(row.currency_code || 'EUR').trim() === 'EUR')
        const eurAccountIds = new Set(eurAccounts.map((row) => row.account_id))
        const balance = eurAccounts.reduce((sum, row) => sum + Number(row.current_balance || 0), 0)
        const reserved = activeReservations.filter((row) => row.user_id === userId && eurAccountIds.has(row.account_id)).reduce((sum, row) => sum + Number(row.amount || 0), 0)
        const free = balance - reserved
        const uncoveredCommitments = Math.max(0, upcomingEur - reserved)
        if (free < uncoveredCommitments) candidates.push({ user_id: userId, reminder_key: 'insufficient-balance:' + local.date, source_type: 'insufficient_balance', source_id: null, title: 'Saldo libre insuficiente', body: 'Tienes ' + free.toFixed(2) + ' € libres y compromisos sin cubrir por ' + uncoveredCommitments.toFixed(2) + ' €.', due_on: local.date, amount: Number(uncoveredCommitments.toFixed(2)), currency_code: 'EUR', metadata: { free_balance: Number(free.toFixed(2)), upcoming_commitments: Number(upcomingEur.toFixed(2)), reserved_coverage: Number(reserved.toFixed(2)), uncovered_commitments: Number(uncoveredCommitments.toFixed(2)), horizon_days: horizon } })
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
      const canUseWebPush = Boolean(config.vapid_public_key && config.vapid_private_key)
      let subscriptions: Array<{ id: string; user_id: string; endpoint: string; p256dh: string; auth: string }> = []
      if (canUseWebPush) {
        webpush.setVapidDetails(
          'https://finanzas-ui-seven.vercel.app',
          config.vapid_public_key,
          config.vapid_private_key,
        )
        const { data, error } = await supabase
          .from('push_subscriptions')
          .select('id, user_id, endpoint, p256dh, auth')
          .in('user_id', userIdsPending)
        if (error) throw error
        subscriptions = data || []
      }

      const { data: fcmRows, error: fcmError } = await supabase
        .from('fcm_push_tokens')
        .select('id, user_id, token')
        .in('user_id', userIdsPending)
      if (fcmError) throw fcmError

      const subscriptionsByUser = new Map<string, typeof subscriptions>()
      for (const subscription of subscriptions) {
        const list = subscriptionsByUser.get(subscription.user_id) || []
        list.push(subscription)
        subscriptionsByUser.set(subscription.user_id, list)
      }
      const fcmTokensByUser = new Map<string, typeof fcmRows>()
      for (const tokenRow of fcmRows || []) {
        const list = fcmTokensByUser.get(tokenRow.user_id) || []
        list.push(tokenRow)
        fcmTokensByUser.set(tokenRow.user_id, list)
      }

      let firebaseProjectId: string | null = null
      if ((fcmRows || []).length > 0) {
        if (!firebaseServiceAccountRaw) throw new Error('Hay dispositivos Android registrados, pero falta FIREBASE_SERVICE_ACCOUNT_JSON.')
        firebaseProjectId = (JSON.parse(firebaseServiceAccountRaw) as { project_id?: string }).project_id || null
        if (!firebaseProjectId) throw new Error('La credencial Firebase no contiene project_id.')
      }

      for (const notification of pending || []) {
        const deviceSubscriptions = subscriptionsByUser.get(notification.user_id) || []
        const deviceTokens = fcmTokensByUser.get(notification.user_id) || []
        if (deviceSubscriptions.length === 0 && deviceTokens.length === 0) {
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

        for (const device of deviceTokens) {
          try {
            await sendFirebaseNotification(firebaseProjectId!, device.token, notification)
            delivered = true
          } catch (pushError) {
            const statusCode = Number((pushError as { statusCode?: number })?.statusCode || 0)
            const fcmErrorCode = String((pushError as { fcmErrorCode?: string })?.fcmErrorCode || '')
            errors.push(pushError instanceof Error ? pushError.message : String(pushError))
            if (statusCode === 404 || fcmErrorCode === 'UNREGISTERED') {
              await supabase.from('fcm_push_tokens').delete().eq('id', device.id)
            }
          }
        }

        if (delivered) {
          const { error: updateError } = await supabase.from('notifications')
            .update({ push_status: 'sent', sent_at: new Date().toISOString(), last_error: null })
            .eq('id', notification.id)
          if (updateError) throw updateError
          sent += 1
        } else if (errors.length > 0) {
          const { error: updateError } = await supabase.from('notifications')
            .update({ push_status: 'failed', last_error: errors.slice(0, 3).join(' | ').slice(0, 1000) || 'No se pudo entregar el aviso.' })
            .eq('id', notification.id)
          if (updateError) throw updateError
          failed += 1
        } else {
          withoutDevice += 1
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
