import { Capacitor } from '@capacitor/core'
import { createClient } from '@supabase/supabase-js'
import { getAndroidCreateKind, getReadOnlyFinanceResource } from '@/lib/native-dashboard-api'
import { resolveSupabaseClientConfig } from '@/lib/supabase-config'

const { url: supabaseUrl, publishableKey: supabasePublishableKey } =
  resolveSupabaseClientConfig(import.meta.env)

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: true,
    persistSession: true,
  },
})

let apiFetchInstalled = false
let dashboardSnapshotPromise = null
let dashboardSnapshotExpiresAt = 0

async function getAndroidDashboardSnapshot() {
  if (dashboardSnapshotPromise && Date.now() < dashboardSnapshotExpiresAt) {
    return dashboardSnapshotPromise
  }

  dashboardSnapshotExpiresAt = Date.now() + 10_000
  dashboardSnapshotPromise = supabase.functions
    .invoke('finance-dashboard-read', { body: {} })
    .then(({ data, error }) => {
      if (error) throw error
      if (!data || typeof data !== 'object') {
        throw new Error('El servicio financiero devolvió una respuesta vacía.')
      }
      return data
    })
    .catch((error) => {
      dashboardSnapshotPromise = null
      dashboardSnapshotExpiresAt = 0
      throw error
    })

  return dashboardSnapshotPromise
}

async function getAndroidAccounts() {
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    throw new Error('Tu sesión ha caducado. Inicia sesión de nuevo.')
  }

  const userId = authData.user.id
  const today = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())

  // Read account choices directly with the signed-in user's JWT and RLS.
  // The manual expense/income forms must never depend on a dashboard cache
  // that may omit accounts in a given Preview build.
  const [accountsResult, transactionsResult] = await Promise.all([
    supabase.from('accounts')
      .select('id, name, currency_code, opening_balance, opening_balance_date')
      .eq('user_id', userId)
      .order('name', { ascending: true }),
    supabase.from('transactions')
      .select('account_id, occurred_on, kind, amount')
      .eq('user_id', userId)
      .eq('status', 'posted')
      .lte('occurred_on', today)
      .order('occurred_on', { ascending: false }),
  ])

  if (accountsResult.error) throw accountsResult.error
  if (transactionsResult.error) throw transactionsResult.error

  const transactionsByAccount = new Map()
  for (const transaction of transactionsResult.data || []) {
    if (!transactionsByAccount.has(transaction.account_id)) {
      transactionsByAccount.set(transaction.account_id, [])
    }
    transactionsByAccount.get(transaction.account_id).push(transaction)
  }

  return (accountsResult.data || []).map((account) => {
    const openingDate = account.opening_balance_date || '0001-01-01'
    const ledger = (transactionsByAccount.get(account.id) || [])
      .filter((transaction) => transaction.occurred_on >= openingDate && transaction.occurred_on <= today)
    let balance = Number(account.opening_balance || 0)

    for (const transaction of ledger) {
      const amount = Number(transaction.amount || 0)
      if (transaction.kind === 'income' || transaction.kind === 'transfer_in') balance += amount
      if (transaction.kind === 'expense' || transaction.kind === 'transfer_out') balance -= amount
    }

    return {
      id: account.id,
      name: account.name,
      currencyCode: String(account.currency_code || 'EUR').trim(),
      balance: Math.round((balance + Number.EPSILON) * 100) / 100,
      openingBalanceDate: account.opening_balance_date || null,
      lastMovementOn: ledger[0]?.occurred_on || null,
    }
  })
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

// On Android, use the authenticated Supabase Edge Function rather than
// calling Vercel's protected Preview deployment from the WebView.
// Android reads use the authenticated dashboard snapshot; new expense/income writes use this user's RLS-protected session.
async function createAndroidTransaction(parsedUrl, input, init, sourceRequest) {
  let bodyValue = init?.body
  if (bodyValue == null && sourceRequest) bodyValue = await sourceRequest.clone().text()

  let body
  try {
    body = typeof bodyValue === 'string' ? JSON.parse(bodyValue || '{}') : (bodyValue || {})
  } catch {
    return jsonResponse({ error: 'No se pudo leer el formulario. Vuelve a intentarlo.' }, 400)
  }

  const kind = getAndroidCreateKind(parsedUrl.pathname)
  const description = String(body.concepto || '').trim()
  const amount = Number(body.monto)
  const occurredOn = String(body.fecha || '').slice(0, 10)
  const date = /^\d{4}-\d{2}-\d{2}$/.test(occurredOn) ? new Date(occurredOn + 'T00:00:00.000Z') : null
  if (!description || !Number.isFinite(amount) || amount <= 0 ||
      !date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== occurredOn) {
    return jsonResponse({ error: 'Indica un concepto, un importe positivo y una fecha válida.' }, 400)
  }

  try {
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData?.user) return jsonResponse({ error: 'Tu sesión ha caducado. Inicia sesión de nuevo.' }, 401)
    const userId = authData.user.id
    const idempotencyKey = String(body.idempotencyKey || crypto.randomUUID())
    const categoryName = String(body.categoria || 'Otros').normalize('NFKC').trim().replace(/\s+/g, ' ') || 'Otros'
    const accountId = String(body.cuentaId || '').trim()
    if (!accountId) return jsonResponse({ error: 'Selecciona la cuenta del movimiento.' }, 400)

    const mapTransaction = (row) => ({
      id: row.id,
      concepto: row.description || '',
      monto: Number(row.amount || 0),
      fecha: String(row.occurred_on || '').slice(0, 10),
      categoria: row.categories?.name || '',
      metodo: row.payment_method || '',
      cuenta: row.accounts?.name || '',
      cuentaId: row.account_id || null,
      origen: 'normal',
    })

    // Replays of the same submit return the original transaction, not a duplicate.
    const { data: existing, error: existingError } = await supabase.from('transactions')
      .select('id, account_id, amount, occurred_on, description, payment_method, categories(name), accounts(name)')
      .eq('user_id', userId)
      .eq('idempotency_key', idempotencyKey)
      .eq('kind', kind)
      .eq('status', 'posted')
      .maybeSingle()
    if (existingError) throw existingError
    if (existing) return jsonResponse(mapTransaction(existing), 200)

    const normalizedCategory = categoryName.toLocaleLowerCase('es-ES')
    const { data: categoryRows, error: categoryReadError } = await supabase.from('categories')
      .select('id, name')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
    if (categoryReadError) throw categoryReadError

    let category = (categoryRows || []).find((row) =>
      String(row.name || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es-ES') === normalizedCategory
    )
    if (!category) {
      const { data: createdCategory, error: categoryInsertError } = await supabase.from('categories')
        .insert({ user_id: userId, name: categoryName || 'Otros', direction: kind })
        .select('id, name')
        .single()
      if (categoryInsertError && categoryInsertError.code === '23505') {
        const { data: retryCategory, error: retryError } = await supabase.from('categories')
          .select('id, name').eq('user_id', userId).ilike('name', categoryName).maybeSingle()
        if (retryError) throw retryError
        category = retryCategory
      } else if (categoryInsertError) {
        throw categoryInsertError
      } else {
        category = createdCategory
      }
    }
    if (!category?.id) throw new Error('No se pudo preparar la categoría del movimiento.')

    const { data: account, error: accountReadError } = await supabase.from('accounts')
      .select('id, name')
      .eq('user_id', userId)
      .eq('id', accountId)
      .maybeSingle()
    if (accountReadError) throw accountReadError
    if (!account?.id) return jsonResponse({ error: 'La cuenta seleccionada no existe o no pertenece a tu usuario.' }, 400)

    const { data: inserted, error: insertError } = await supabase.from('transactions').insert({
      user_id: userId,
      account_id: account.id,
      category_id: category.id,
      kind,
      status: 'posted',
      amount: Math.round((amount + Number.EPSILON) * 100) / 100,
      occurred_on: occurredOn,
      description,
      payment_method: String(body.metodo || '').trim() || null,
      idempotency_key: idempotencyKey,
    }).select('id, account_id, amount, occurred_on, description, payment_method, categories(name), accounts(name)').single()

    if (insertError) {
      if (insertError.code === '23505') {
        const { data: replay, error: replayError } = await supabase.from('transactions')
          .select('id, account_id, amount, occurred_on, description, payment_method, categories(name), accounts(name)')
          .eq('user_id', userId).eq('idempotency_key', idempotencyKey).eq('kind', kind).single()
        if (replayError) throw replayError
        return jsonResponse(mapTransaction(replay), 200)
      }
      throw insertError
    }
    dashboardSnapshotPromise = null
    dashboardSnapshotExpiresAt = 0
    return jsonResponse(mapTransaction(inserted), 201)
  } catch (error) {
    console.error('No se pudo registrar el movimiento en Android:', error)
    return jsonResponse({ error: error?.message || 'No se pudo guardar el movimiento de forma segura.' }, 400)
  }
}


async function readAndroidJsonBody(input, init, sourceRequest) {
  let bodyValue = init?.body
  if (bodyValue == null && sourceRequest) bodyValue = await sourceRequest.clone().text()
  try {
    return typeof bodyValue === 'string' ? JSON.parse(bodyValue || '{}') : (bodyValue || {})
  } catch {
    throw new Error('No se pudo leer el formulario. Vuelve a intentarlo.')
  }
}

async function updateAndroidAccountBalance(input, init, sourceRequest) {
  try {
    const body = await readAndroidJsonBody(input, init, sourceRequest)
    const accountId = String(body.accountId || '').trim()
    const targetBalance = Number(body.balance)
    if (!accountId || body.balance === undefined || !Number.isFinite(targetBalance) || Math.abs(targetBalance) > 999999999999) {
      return jsonResponse({ error: 'Indica una cuenta válida y un saldo real numérico.' }, 400)
    }

    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData?.user) return jsonResponse({ error: 'Tu sesión ha caducado. Inicia sesión de nuevo.' }, 401)
    const userId = authData.user.id
    const { data: account, error: accountError } = await supabase.from('accounts')
      .select('id, name, currency_code, opening_balance_date')
      .eq('user_id', userId)
      .eq('id', accountId)
      .maybeSingle()
    if (accountError) throw accountError
    if (!account) return jsonResponse({ error: 'No se encontró esa cuenta.' }, 404)

    const today = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date())
    const openingDate = account.opening_balance_date || '0001-01-01'
    const { data: ledger, error: ledgerError } = await supabase.from('transactions')
      .select('occurred_on, kind, amount')
      .eq('user_id', userId)
      .eq('account_id', account.id)
      .eq('status', 'posted')
      .gte('occurred_on', openingDate)
      .lte('occurred_on', today)
    if (ledgerError) throw ledgerError

    const ledgerNet = (ledger || []).reduce((total, transaction) => {
      const amount = Number(transaction.amount || 0)
      if (transaction.kind === 'income' || transaction.kind === 'transfer_in') return total + amount
      if (transaction.kind === 'expense' || transaction.kind === 'transfer_out') return total - amount
      return total
    }, 0)
    const nextOpeningBalance = Math.round((targetBalance - ledgerNet + Number.EPSILON) * 100) / 100
    const { data: updatedAccount, error: updateError } = await supabase.from('accounts')
      .update({ opening_balance: nextOpeningBalance })
      .eq('user_id', userId)
      .eq('id', account.id)
      .select('id, name, currency_code, opening_balance_date')
      .single()
    if (updateError) throw updateError

    dashboardSnapshotPromise = null
    dashboardSnapshotExpiresAt = 0
    return jsonResponse({
      id: updatedAccount.id,
      name: updatedAccount.name,
      currencyCode: String(updatedAccount.currency_code || 'EUR').trim(),
      balance: Math.round((targetBalance + Number.EPSILON) * 100) / 100,
      openingBalanceDate: updatedAccount.opening_balance_date || null,
      lastMovementOn: (ledger || []).reduce((latest, item) => !latest || item.occurred_on > latest ? item.occurred_on : latest, null),
    })
  } catch (error) {
    console.error('No se pudo ajustar el saldo en Android:', error)
    return jsonResponse({ error: error?.message || 'No se pudo ajustar el saldo de la cuenta.' }, 400)
  }
}

async function resolveAndroidCategory(userId, categoryValue, kind) {
  const categoryName = String(categoryValue || 'Otros').normalize('NFKC').trim().replace(/\\s+/g, ' ') || 'Otros'
  const normalizedCategory = categoryName.toLocaleLowerCase('es-ES')
  const { data: categoryRows, error: categoryReadError } = await supabase.from('categories')
    .select('id, name')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  if (categoryReadError) throw categoryReadError

  let category = (categoryRows || []).find((row) =>
    String(row.name || '').normalize('NFKC').trim().replace(/\\s+/g, ' ').toLocaleLowerCase('es-ES') === normalizedCategory
  )
  if (!category) {
    const { data: createdCategory, error: categoryInsertError } = await supabase.from('categories')
      .insert({ user_id: userId, name: categoryName, direction: kind })
      .select('id, name')
      .single()
    if (categoryInsertError && categoryInsertError.code === '23505') {
      const { data: retryCategory, error: retryError } = await supabase.from('categories')
        .select('id, name').eq('user_id', userId).ilike('name', categoryName).maybeSingle()
      if (retryError) throw retryError
      category = retryCategory
    } else if (categoryInsertError) {
      throw categoryInsertError
    } else {
      category = createdCategory
    }
  }
  if (!category?.id) throw new Error('No se pudo preparar la categoría del movimiento.')
  return category.id
}

async function updateAndroidTransaction(parsedUrl, method, input, init, sourceRequest) {
  try {
    const body = await readAndroidJsonBody(input, init, sourceRequest)
    const kind = getAndroidCreateKind(parsedUrl.pathname)
    if (!kind) return jsonResponse({ error: 'Movimiento no válido.' }, 404)
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData?.user) return jsonResponse({ error: 'Tu sesión ha caducado. Inicia sesión de nuevo.' }, 401)
    const userId = authData.user.id
    const mapTransaction = (row) => ({
      id: row.id,
      concepto: row.description || '',
      monto: Number(row.amount || 0),
      fecha: String(row.occurred_on || '').slice(0, 10),
      categoria: row.categories?.name || '',
      metodo: row.payment_method || '',
      cuenta: row.accounts?.name || '',
      cuentaId: row.account_id || null,
      origen: 'normal',
    })

    if (!body.id) return jsonResponse({ error: 'Falta el identificador del movimiento.' }, 400)
    if (kind === 'expense') {
      const { data: linkedInstallment, error: linkedError } = await supabase.from('installments')
        .select('id')
        .eq('user_id', userId)
        .eq('transaction_id', body.id)
        .limit(1)
        .maybeSingle()
      if (linkedError) throw linkedError
      if (linkedInstallment) {
        return jsonResponse({
          error: method === 'DELETE'
            ? 'Este gasto está vinculado a una cuota. Anula o corrige el pago desde Gestión financiera para no dejar una cuota pagada sin su movimiento.'
            : 'Este gasto está vinculado a una cuota. Para mantener el saldo y el calendario sincronizados, edítalo desde Gestión financiera.',
        }, 409)
      }
    }

    if (method === 'DELETE') {
      const { data, error } = await supabase.from('transactions')
        .update({ status: 'void' })
        .eq('id', body.id)
        .eq('user_id', userId)
        .eq('kind', kind)
        .eq('status', 'posted')
        .select('id')
        .maybeSingle()
      if (error) throw error
      if (!data) return jsonResponse({ error: 'No se encontró el movimiento.' }, 404)
      dashboardSnapshotPromise = null
      dashboardSnapshotExpiresAt = 0
      return jsonResponse({ success: true, id: body.id })
    }

    const patch = {}
    if (body.concepto !== undefined) {
      const description = String(body.concepto || '').trim()
      if (!description) return jsonResponse({ error: 'El concepto no puede estar vacío.' }, 400)
      patch.description = description
    }
    if (body.monto !== undefined) {
      const amount = Number(body.monto)
      if (!Number.isFinite(amount) || amount <= 0) return jsonResponse({ error: 'El importe debe ser mayor que cero.' }, 400)
      patch.amount = Math.round((amount + Number.EPSILON) * 100) / 100
    }
    if (body.fecha !== undefined) {
      const dateValue = String(body.fecha || '').slice(0, 10)
      const date = /^\\d{4}-\\d{2}-\\d{2}$/.test(dateValue) ? new Date(dateValue + 'T00:00:00.000Z') : null
      if (!date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== dateValue) {
        return jsonResponse({ error: 'La fecha no es válida.' }, 400)
      }
      patch.occurred_on = dateValue
    }
    if (body.categoria !== undefined) {
      patch.category_id = await resolveAndroidCategory(userId, body.categoria, kind)
    }
    if (body.cuentaId !== undefined) {
      const accountId = String(body.cuentaId || '').trim()
      if (!accountId) return jsonResponse({ error: 'Selecciona una cuenta válida.' }, 400)
      const { data: account, error: accountError } = await supabase.from('accounts')
        .select('id')
        .eq('user_id', userId)
        .eq('id', accountId)
        .maybeSingle()
      if (accountError) throw accountError
      if (!account?.id) return jsonResponse({ error: 'La cuenta seleccionada no existe o no pertenece a tu usuario.' }, 400)
      patch.account_id = account.id
    }
    if (body.metodo !== undefined) patch.payment_method = String(body.metodo || '').trim() || null
    if (!Object.keys(patch).length) return jsonResponse({ error: 'No hay cambios para guardar.' }, 400)

    const { data, error } = await supabase.from('transactions').update(patch)
      .eq('id', body.id)
      .eq('user_id', userId)
      .eq('kind', kind)
      .eq('status', 'posted')
      .select('id, account_id, amount, occurred_on, description, payment_method, categories(name), accounts(name)')
      .maybeSingle()
    if (error) throw error
    if (!data) return jsonResponse({ error: 'No se encontró el movimiento.' }, 404)
    dashboardSnapshotPromise = null
    dashboardSnapshotExpiresAt = 0
    return jsonResponse(mapTransaction(data))
  } catch (error) {
    console.error('No se pudo modificar el movimiento en Android:', error)
    return jsonResponse({ error: error?.message || 'No se pudo actualizar el movimiento.' }, 400)
  }
}

async function fetchAndroidApi(parsedUrl, method, input, init, sourceRequest) {
  if (method === 'GET') {
    if (parsedUrl.pathname === '/api/cuentas') {
      try {
        return jsonResponse(await getAndroidAccounts())
      } catch (error) {
        console.error('No se pudieron cargar las cuentas en Android:', error)
        return jsonResponse({
          error: error?.message || 'No se pudieron cargar tus cuentas.',
        }, 502)
      }
    }

    const resource = getReadOnlyFinanceResource(parsedUrl.pathname, parsedUrl.search)
    if (!resource) {
      return jsonResponse({ error: 'Este apartado todavía no está habilitado en el modo de consulta de la APK.' }, 404)
    }

    try {
      const snapshot = await getAndroidDashboardSnapshot()
      if (!Object.prototype.hasOwnProperty.call(snapshot, resource)) {
        return jsonResponse({ error: 'El resumen solicitado no está disponible en esta versión.' }, 404)
      }
      return jsonResponse(snapshot[resource])
    } catch (error) {
      console.error('No se pudo consultar el resumen financiero Android:', error)
      return jsonResponse({
        error: error?.message || 'No se pudo conectar con el servicio financiero seguro.',
      }, 502)
    }
  }

  if (method === 'PATCH' && parsedUrl.pathname === '/api/cuentas') {
    return updateAndroidAccountBalance(input, init, sourceRequest)
  }

  if ((method === 'PATCH' || method === 'DELETE') && getAndroidCreateKind(parsedUrl.pathname)) {
    return updateAndroidTransaction(parsedUrl, method, input, init, sourceRequest)
  }

  if (method === 'POST' && getAndroidCreateKind(parsedUrl.pathname)) {
    return createAndroidTransaction(parsedUrl, input, init, sourceRequest)
  }

  return jsonResponse({ error: 'Esta operación no está habilitada en Finanzas Mobile.' }, 405)
}

// On the web, the API remains same-origin and uses the user's JWT.
// On Android, the same /api paths are mapped to a read-only, authenticated
// Supabase Edge Function. Database RLS continues to enforce user ownership.
export function installAuthenticatedApiFetch() {
  if (apiFetchInstalled || typeof window === 'undefined') return

  const originalFetch = window.fetch.bind(window)
  const isAndroid = Capacitor.getPlatform() === 'android'

  window.fetch = async (input, init = {}) => {
    const requestUrl = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input?.url

    if (typeof requestUrl !== 'string') return originalFetch(input, init)

    let parsedUrl
    try {
      parsedUrl = new URL(requestUrl, window.location.origin)
    } catch {
      return originalFetch(input, init)
    }

    const isSameOriginApi = parsedUrl.origin === window.location.origin &&
      (parsedUrl.pathname === '/api' || parsedUrl.pathname.startsWith('/api/'))

    if (!isSameOriginApi) return originalFetch(input, init)

    const sourceRequest = input instanceof Request ? input : null
    const method = String(init.method || sourceRequest?.method || 'GET').toUpperCase()

    if (isAndroid) {
      return fetchAndroidApi(parsedUrl, method, input, init, sourceRequest)
    }

    const headers = new Headers(init.headers || sourceRequest?.headers)
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) {
      headers.set('Authorization', `Bearer ${session.access_token}`)
    }

    if (sourceRequest) {
      return originalFetch(new Request(requestUrl, { ...init, headers }))
    }

    return originalFetch(input, { ...init, headers })
  }

  apiFetchInstalled = true
}
