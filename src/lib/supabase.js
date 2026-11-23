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
      .select('id, name, institution, account_type, currency_code, opening_balance, opening_balance_date, is_active')
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
      institution: account.institution || '',
      accountType: account.account_type || 'bank',
      currencyCode: String(account.currency_code || 'EUR').trim(),
      balance: Math.round((balance + Number.EPSILON) * 100) / 100,
      openingBalance: Math.round((Number(account.opening_balance || 0) + Number.EPSILON) * 100) / 100,
      openingBalanceDate: account.opening_balance_date || null,
      lastMovementOn: ledger[0]?.occurred_on || null,
      isActive: account.is_active !== false,
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
      .select('id, name, is_active')
      .eq('user_id', userId)
      .eq('id', accountId)
      .maybeSingle()
    if (accountReadError) throw accountReadError
    if (!account?.id) return jsonResponse({ error: 'La cuenta seleccionada no existe o no pertenece a tu usuario.' }, 400)
    if (account.is_active === false) return jsonResponse({ error: 'La cuenta está desactivada. Selecciona una cuenta activa.' }, 400)

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


async function readAndroidJsonBody(init, sourceRequest) {
  let bodyValue = init?.body
  if (bodyValue == null && sourceRequest) bodyValue = await sourceRequest.clone().text()
  try {
    return typeof bodyValue === 'string' ? JSON.parse(bodyValue || '{}') : (bodyValue || {})
  } catch {
    throw new Error('No se pudo leer el formulario. Vuelve a intentarlo.')
  }
}

const ANDROID_ACCOUNT_TYPES = new Set([
  'bank', 'cash', 'debit_card', 'credit_card', 'digital_wallet', 'savings', 'other',
])

function androidTodayKey() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

function validDateOnly(value) {
  const text = String(value || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false
  const date = new Date(text + 'T00:00:00.000Z')
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text
}

function androidMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
}

async function getAndroidOwnedAccount(userId, accountId) {
  const { data, error } = await supabase.from('accounts')
    .select('id, name, institution, account_type, currency_code, opening_balance, opening_balance_date, is_active')
    .eq('user_id', userId)
    .eq('id', accountId)
    .maybeSingle()
  if (error) throw error
  return data
}

async function getAndroidAccountLedger(userId, accountId, openingDate, today) {
  const { data, error } = await supabase.from('transactions')
    .select('account_id, occurred_on, kind, amount')
    .eq('user_id', userId)
    .eq('account_id', accountId)
    .eq('status', 'posted')
    .gte('occurred_on', openingDate || '0001-01-01')
    .lte('occurred_on', today)
  if (error) throw error
  return data || []
}

function mapAndroidAccount(account, ledger, today) {
  const movements = (ledger || []).filter((item) => item.occurred_on <= today)
  let balance = Number(account.opening_balance || 0)
  for (const transaction of movements) {
    const amount = Number(transaction.amount || 0)
    if (transaction.kind === 'income' || transaction.kind === 'transfer_in') balance += amount
    if (transaction.kind === 'expense' || transaction.kind === 'transfer_out') balance -= amount
  }

  return {
    id: account.id,
    name: account.name,
    institution: account.institution || '',
    accountType: account.account_type || 'bank',
    currencyCode: String(account.currency_code || 'EUR').trim(),
    balance: androidMoney(balance),
    openingBalance: androidMoney(account.opening_balance),
    openingBalanceDate: account.opening_balance_date || null,
    lastMovementOn: movements.reduce((latest, item) =>
      !latest || item.occurred_on > latest ? item.occurred_on : latest, null
    ),
    isActive: account.is_active !== false,
  }
}

async function createAndroidAccount(init, sourceRequest) {
  try {
    const body = await readAndroidJsonBody(init, sourceRequest)
    const name = String(body.name || '').trim()
    const institution = String(body.institution || '').trim() || null
    const accountType = String(body.accountType || 'bank')
    const currencyCode = String(body.currencyCode || 'EUR').trim().toUpperCase()
    const openingBalance = Number(body.openingBalance ?? 0)
    const openingBalanceDate = String(body.openingBalanceDate || androidTodayKey()).slice(0, 10)

    if (!name) return jsonResponse({ error: 'Escribe un nombre para la cuenta.' }, 400)
    if (!ANDROID_ACCOUNT_TYPES.has(accountType)) return jsonResponse({ error: 'Selecciona un tipo de cuenta válido.' }, 400)
    if (!/^[A-Z]{3}$/.test(currencyCode)) return jsonResponse({ error: 'La moneda debe ser un código de tres letras, por ejemplo EUR.' }, 400)
    if (!Number.isFinite(openingBalance) || Math.abs(openingBalance) > 999999999999) {
      return jsonResponse({ error: 'El saldo inicial no es válido.' }, 400)
    }
    if (!validDateOnly(openingBalanceDate)) return jsonResponse({ error: 'La fecha del saldo inicial no es válida.' }, 400)

    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData?.user) return jsonResponse({ error: 'Tu sesión ha caducado. Inicia sesión de nuevo.' }, 401)
    const { data, error } = await supabase.from('accounts').insert({
      user_id: authData.user.id,
      name,
      institution,
      account_type: accountType,
      currency_code: currencyCode,
      opening_balance: androidMoney(openingBalance),
      opening_balance_date: openingBalanceDate,
      is_active: true,
    }).select('id, name, institution, account_type, currency_code, opening_balance, opening_balance_date, is_active').single()

    if (error?.code === '23505') return jsonResponse({ error: 'Ya tienes una cuenta con ese nombre. Usa otro nombre para distinguirla.' }, 409)
    if (error) throw error
    dashboardSnapshotPromise = null
    dashboardSnapshotExpiresAt = 0
    return jsonResponse(mapAndroidAccount(data, [], androidTodayKey()), 201)
  } catch (error) {
    console.error('No se pudo crear la cuenta en Android:', error)
    return jsonResponse({ error: error?.message || 'No se pudo crear la cuenta.' }, 400)
  }
}

async function updateAndroidAccount(init, sourceRequest) {
  try {
    const body = await readAndroidJsonBody(init, sourceRequest)
    const accountId = String(body.accountId || body.id || '').trim()
    if (!accountId) return jsonResponse({ error: 'Falta seleccionar la cuenta que quieres actualizar.' }, 400)

    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData?.user) return jsonResponse({ error: 'Tu sesión ha caducado. Inicia sesión de nuevo.' }, 401)
    const userId = authData.user.id
    const account = await getAndroidOwnedAccount(userId, accountId)
    if (!account) return jsonResponse({ error: 'No se encontró esa cuenta en tu espacio financiero.' }, 404)

    const patch = {}
    if (body.name !== undefined) {
      const name = String(body.name || '').trim()
      if (!name) return jsonResponse({ error: 'El nombre de la cuenta no puede quedar vacío.' }, 400)
      patch.name = name
    }
    if (body.institution !== undefined) patch.institution = String(body.institution || '').trim() || null
    if (body.accountType !== undefined) {
      const accountType = String(body.accountType)
      if (!ANDROID_ACCOUNT_TYPES.has(accountType)) return jsonResponse({ error: 'Selecciona un tipo de cuenta válido.' }, 400)
      patch.account_type = accountType
    }
    if (body.currencyCode !== undefined) {
      const currencyCode = String(body.currencyCode || '').trim().toUpperCase()
      if (!/^[A-Z]{3}$/.test(currencyCode)) return jsonResponse({ error: 'La moneda debe ser un código de tres letras, por ejemplo EUR.' }, 400)
      if (currencyCode !== String(account.currency_code || 'EUR').trim().toUpperCase()) {
        const { count, error: countError } = await supabase.from('transactions')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('account_id', account.id)
        if (countError) throw countError
        if ((count || 0) > 0) return jsonResponse({ error: 'No puedes cambiar la moneda de una cuenta con movimientos. Crea otra cuenta con la moneda correcta y conserva esta como histórica.' }, 409)
        patch.currency_code = currencyCode
      }
    }
    if (body.isActive !== undefined) patch.is_active = Boolean(body.isActive)

    const today = androidTodayKey()
    let ledger = await getAndroidAccountLedger(userId, account.id, account.opening_balance_date, today)
    if (body.balance !== undefined) {
      const targetBalance = Number(body.balance)
      if (!Number.isFinite(targetBalance) || Math.abs(targetBalance) > 999999999999) {
        return jsonResponse({ error: 'Introduce un saldo real numérico válido.' }, 400)
      }
      const ledgerNet = ledger.reduce((total, transaction) => {
        const amount = Number(transaction.amount || 0)
        if (transaction.kind === 'income' || transaction.kind === 'transfer_in') return total + amount
        if (transaction.kind === 'expense' || transaction.kind === 'transfer_out') return total - amount
        return total
      }, 0)
      patch.opening_balance = androidMoney(targetBalance - ledgerNet)
    }

    if (!Object.keys(patch).length) return jsonResponse({ error: 'No se han indicado cambios para guardar.' }, 400)
    patch.updated_at = new Date().toISOString()

    const { data, error } = await supabase.from('accounts').update(patch)
      .eq('user_id', userId)
      .eq('id', account.id)
      .select('id, name, institution, account_type, currency_code, opening_balance, opening_balance_date, is_active')
      .single()
    if (error?.code === '23505') return jsonResponse({ error: 'Ya existe una cuenta con ese nombre.' }, 409)
    if (error) throw error

    if (body.balance !== undefined) ledger = await getAndroidAccountLedger(userId, account.id, data.opening_balance_date, today)
    dashboardSnapshotPromise = null
    dashboardSnapshotExpiresAt = 0
    return jsonResponse(mapAndroidAccount(data, ledger, today))
  } catch (error) {
    console.error('No se pudo actualizar la cuenta en Android:', error)
    return jsonResponse({ error: error?.message || 'No se pudo actualizar la cuenta.' }, 400)
  }
}

async function resolveAndroidCategory(userId, categoryValue, kind) {
  const categoryName = String(categoryValue || 'Otros').normalize('NFKC').trim().replace(/\s+/g, ' ') || 'Otros'
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

async function updateAndroidTransaction(parsedUrl, method, init, sourceRequest) {
  try {
    const body = await readAndroidJsonBody(init, sourceRequest)
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
      const date = /^\d{4}-\d{2}-\d{2}$/.test(dateValue) ? new Date(dateValue + 'T00:00:00.000Z') : null
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

const DEFAULT_ANDROID_EXPENSE_CATEGORIES = ['Alimentación', 'Vivienda', 'Transporte', 'Salud', 'Ocio', 'Suscripciones', 'Servicios', 'Ropa', 'Educación', 'Familia', 'Otros']

const ANDROID_MANAGEMENT_WRITE_PATHS = new Set([
  '/api/presupuestos',
  '/api/pagos-fijos',
  '/api/compras-cuotas',
  '/api/compromisos',
])

async function forwardAndroidManagementWrite(parsedUrl, method, init, sourceRequest) {
  let bodyValue = init?.body
  if (bodyValue == null && sourceRequest) bodyValue = await sourceRequest.clone().text()
  let body
  try {
    body = typeof bodyValue === 'string' ? JSON.parse(bodyValue || '{}') : (bodyValue || {})
  } catch {
    return jsonResponse({ error: 'No se pudo leer el formulario. Vuelve a intentarlo.' }, 400)
  }

  try {
    const { data: authData, error: authError } = await supabase.auth.getSession()
    const accessToken = authData?.session?.access_token
    if (authError || !accessToken) return jsonResponse({ error: 'Tu sesión ha caducado. Inicia sesión de nuevo.' }, 401)
    const response = await fetch(supabaseUrl + '/functions/v1/finance-management-write', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + accessToken,
        apikey: supabasePublishableKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path: parsedUrl.pathname, method, body }),
    })
    const responseBody = await response.text()
    if (response.ok) {
      dashboardSnapshotPromise = null
      dashboardSnapshotExpiresAt = 0
    }
    return new Response(responseBody || '{}', {
      status: response.status,
      headers: { 'Content-Type': response.headers.get('Content-Type') || 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    console.error('No se pudo completar la operación financiera en Android:', error)
    return jsonResponse({ error: error?.message || 'No se pudo conectar con el servicio financiero seguro.' }, 502)
  }
}

async function handleAndroidReservations(method, init, sourceRequest) {
  try {
    const body = method === 'GET' ? {} : await readAndroidJsonBody(init, sourceRequest)
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData?.user) return jsonResponse({ error: 'Tu sesión ha caducado. Inicia sesión de nuevo.' }, 401)
    const userId = authData.user.id

    if (method === 'GET') {
      const [{ data: rows, error }, { data: accounts, error: accountsError }] = await Promise.all([
        supabase.from('reservations').select('id, account_id, name, amount, status, reserved_on, notes')
          .eq('user_id', userId).order('reserved_on', { ascending: false }).order('created_at', { ascending: false }),
        supabase.from('accounts').select('id, name, currency_code, is_active').eq('user_id', userId),
      ])
      if (error) throw error
      if (accountsError) throw accountsError
      const accountMap = new Map((accounts || []).map((account) => [account.id, account]))
      return jsonResponse((rows || []).map((row) => {
        const account = accountMap.get(row.account_id)
        return {
          id: row.id, accountId: row.account_id, accountName: account?.name || 'Cuenta no disponible',
          currencyCode: String(account?.currency_code || 'EUR').trim(), accountIsActive: account?.is_active !== false,
          name: row.name, amount: Number(row.amount || 0), status: row.status,
          reservedOn: row.reserved_on, notes: row.notes || '',
        }
      }))
    }

    if (method === 'POST' || method === 'PATCH') {
      const isUpdate = method === 'PATCH'
      let current = null
      if (isUpdate) {
        if (!body.id) return jsonResponse({ error: 'Falta el identificador de la reserva.' }, 400)
        const { data, error } = await supabase.from('reservations')
          .select('id, account_id, name, amount, status, reserved_on, notes')
          .eq('user_id', userId).eq('id', body.id).maybeSingle()
        if (error) throw error
        if (!data) return jsonResponse({ error: 'No se encontró esa reserva.' }, 404)
        if (data.status === 'consumed') return jsonResponse({ error: 'Esta reserva está utilizada y protegida en el historial.' }, 409)
        current = data
      }
      const name = body.name !== undefined ? String(body.name || '').trim() : current?.name
      const amount = body.amount !== undefined ? Number(body.amount) : Number(current?.amount || 0)
      const accountId = body.accountId !== undefined ? String(body.accountId || '').trim() : current?.account_id
      const reservedOn = body.reservedOn !== undefined ? String(body.reservedOn || '').slice(0, 10) : (current?.reserved_on || androidTodayKey())
      const notes = body.notes !== undefined ? String(body.notes || '').trim() || null : (current?.notes || null)
      const status = body.status !== undefined ? body.status : (current?.status || 'active')
      if (!name) return jsonResponse({ error: 'Escribe el concepto de la reserva.' }, 400)
      if (!Number.isFinite(amount) || amount <= 0 || amount > 999999999999) return jsonResponse({ error: 'El importe debe ser mayor que cero y válido.' }, 400)
      if (!validDateOnly(reservedOn)) return jsonResponse({ error: 'La fecha de la reserva no es válida.' }, 400)
      if (!['active', 'released'].includes(status)) return jsonResponse({ error: 'El estado de la reserva no es válido.' }, 400)
      const { data: account, error: accountError } = await supabase.from('accounts')
        .select('id, name, currency_code, is_active').eq('user_id', userId).eq('id', accountId).maybeSingle()
      if (accountError) throw accountError
      if (!account) return jsonResponse({ error: 'Selecciona una cuenta válida de tu espacio financiero.' }, 400)
      if (status === 'active' && account.is_active === false) return jsonResponse({ error: 'No puedes reservar dinero en una cuenta desactivada.' }, 409)
      const { data: savedRow, error: saveError } = await supabase.rpc('save_reservation', {
        p_reservation_id: isUpdate ? current.id : null, p_account_id: account.id, p_name: name,
        p_amount: androidMoney(amount), p_status: status, p_reserved_on: reservedOn, p_notes: notes,
      })
      if (saveError) {
        if (String(saveError.message || '').startsWith('Saldo insuficiente:')) return jsonResponse({ error: saveError.message }, 409)
        if (String(saveError.message || '').includes('No se encontró esa reserva.')) return jsonResponse({ error: 'No se encontró esa reserva.' }, 404)
        throw saveError
      }
      const saved = Array.isArray(savedRow) ? savedRow[0] : savedRow
      if (!saved) throw new Error('La base de datos no devolvió la reserva guardada.')
      dashboardSnapshotPromise = null
      dashboardSnapshotExpiresAt = 0
      return jsonResponse({
        id: saved.id, accountId: saved.account_id, accountName: account.name,
        currencyCode: String(account.currency_code || 'EUR').trim(), accountIsActive: account.is_active !== false,
        name: saved.name, amount: Number(saved.amount || 0), status: saved.status,
        reservedOn: saved.reserved_on, notes: saved.notes || '',
      }, isUpdate ? 200 : 201)
    }

    if (method === 'DELETE') {
      if (!body.id) return jsonResponse({ error: 'Falta el identificador de la reserva.' }, 400)
      const { data, error } = await supabase.from('reservations').delete()
        .eq('user_id', userId).eq('id', body.id).neq('status', 'consumed').select('id').maybeSingle()
      if (error) throw error
      if (!data) {
        const { data: existing, error: lookupError } = await supabase.from('reservations')
          .select('id, status').eq('user_id', userId).eq('id', body.id).maybeSingle()
        if (lookupError) throw lookupError
        if (existing?.status === 'consumed') return jsonResponse({ error: 'Esta reserva figura como utilizada y se conserva en el historial. No se puede eliminar.' }, 409)
        return jsonResponse({ error: 'No se encontró esa reserva.' }, 404)
      }
      dashboardSnapshotPromise = null
      dashboardSnapshotExpiresAt = 0
      return jsonResponse({ success: true, id: body.id })
    }
    return jsonResponse({ error: 'Método no permitido.' }, 405)
  } catch (error) {
    console.error('No se pudo gestionar la reserva en Android:', error)
    return jsonResponse({ error: error?.message || 'No se pudo completar la operación de reserva.' }, 400)
  }
}

async function handleAndroidTransfers(method, init, sourceRequest) {
  try {
    const body = method === 'GET' ? {} : await readAndroidJsonBody(init, sourceRequest)
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData?.user) return jsonResponse({ error: 'Tu sesión ha caducado. Inicia sesión de nuevo.' }, 401)
    const userId = authData.user.id

    if (method === 'GET') {
      const [{ data: transfers, error }, { data: accounts, error: accountsError }, { data: entries, error: entriesError }] = await Promise.all([
        supabase.from('transfers').select('id, from_account_id, to_account_id, amount, occurred_on, description, created_at')
          .eq('user_id', userId).order('occurred_on', { ascending: false }).order('created_at', { ascending: false }),
        supabase.from('accounts').select('id, name, currency_code').eq('user_id', userId),
        supabase.from('transactions').select('transfer_id, status').eq('user_id', userId).not('transfer_id', 'is', null),
      ])
      if (error) throw error
      if (accountsError) throw accountsError
      if (entriesError) throw entriesError
      const accountMap = new Map((accounts || []).map((account) => [account.id, account]))
      const statusMap = new Map()
      for (const row of entries || []) {
        const list = statusMap.get(row.transfer_id) || []
        list.push(row.status)
        statusMap.set(row.transfer_id, list)
      }
      return jsonResponse((transfers || []).map((row) => ({
        id: row.id, fromAccountId: row.from_account_id, toAccountId: row.to_account_id,
        fromAccount: accountMap.get(row.from_account_id)?.name || 'Cuenta no disponible',
        toAccount: accountMap.get(row.to_account_id)?.name || 'Cuenta no disponible',
        currencyCode: String(accountMap.get(row.from_account_id)?.currency_code || 'EUR').trim(),
        amount: Number(row.amount), date: row.occurred_on, description: row.description || '',
        status: (statusMap.get(row.id) || []).length === 2 && (statusMap.get(row.id) || []).every((value) => value === 'void') ? 'cancelled' : 'posted',
      })))
    }

    if (method === 'POST') {
      const fromAccountId = String(body.fromAccountId || '')
      const toAccountId = String(body.toAccountId || '')
      const amount = Number(body.amount)
      const date = String(body.date || '').slice(0, 10)
      const dateValue = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + 'T00:00:00.000Z') : null
      if (!fromAccountId || !toAccountId || fromAccountId === toAccountId || !Number.isFinite(amount) || amount <= 0 ||
        !dateValue || !Number.isFinite(dateValue.getTime()) || dateValue.toISOString().slice(0, 10) !== date) {
        return jsonResponse({ error: 'Indica dos cuentas distintas, un importe positivo y una fecha válida.' }, 400)
      }
      const { data, error } = await supabase.rpc('create_account_transfer', {
        p_from_account_id: fromAccountId, p_to_account_id: toAccountId,
        p_amount: Math.round((amount + Number.EPSILON) * 100) / 100,
        p_occurred_on: date, p_description: String(body.description || '').trim() || null,
        p_idempotency_key: String(body.idempotencyKey || ''),
      })
      if (error) throw error
      dashboardSnapshotPromise = null
      dashboardSnapshotExpiresAt = 0
      return jsonResponse(data, 201)
    }

    if (method === 'DELETE') {
      if (!body.id) return jsonResponse({ error: 'Falta el identificador de la transferencia.' }, 400)
      const { data, error } = await supabase.rpc('cancel_account_transfer', { p_transfer_id: body.id })
      if (error) throw error
      dashboardSnapshotPromise = null
      dashboardSnapshotExpiresAt = 0
      return jsonResponse({ success: true, transfer: data })
    }
    return jsonResponse({ error: 'Método no permitido.' }, 405)
  } catch (error) {
    console.error('No se pudo gestionar la transferencia en Android:', error)
    return jsonResponse({ error: error?.message || 'No se pudo completar la transferencia.' }, 400)
  }
}

async function fetchAndroidApi(parsedUrl, method, input, init, sourceRequest) {
  if (parsedUrl.pathname === '/api/cuentas' && parsedUrl.searchParams.get('resource') === 'transfers') {
    if (method === 'GET' || ['POST', 'DELETE'].includes(method)) return handleAndroidTransfers(method, init, sourceRequest)
    return jsonResponse({ error: 'Método no permitido.' }, 405)
  }


  if (ANDROID_MANAGEMENT_WRITE_PATHS.has(parsedUrl.pathname) && ['POST', 'PATCH', 'DELETE'].includes(method)) {
    return forwardAndroidManagementWrite(parsedUrl, method, init, sourceRequest)
  }

  if (parsedUrl.pathname === '/api/compromisos' && parsedUrl.searchParams.get('resource') === 'reservations') {
    if (method === 'GET' || ['POST', 'PATCH', 'DELETE'].includes(method)) return handleAndroidReservations(method, init, sourceRequest)
    return jsonResponse({ error: 'Método no permitido.' }, 405)
  }

  if (method === 'GET') {
    // The expense form requests category names separately from the dashboard snapshot.
    // Read them directly with the signed-in user's JWT and RLS on Android.
    if (parsedUrl.pathname === '/api/gastos' && parsedUrl.searchParams.get('resource') === 'categories') {
      try {
        const { data, error } = await supabase.from('categories')
          .select('name')
          .eq('is_active', true)
          .in('direction', ['expense', 'both'])
          .order('name', { ascending: true })
        if (error) throw error

        const seen = new Set()
        const categories = []
        for (const value of [...DEFAULT_ANDROID_EXPENSE_CATEGORIES, ...(data || []).map((row) => row.name)]) {
          const name = String(value || '').trim().replace(/\s+/g, ' ')
          const key = name.normalize('NFKC').toLocaleLowerCase('es-ES')
          if (!name || seen.has(key)) continue
          seen.add(key)
          categories.push(name)
        }
        return jsonResponse(categories.sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' })))
      } catch (error) {
        console.error('No se pudieron cargar las categorías de gastos en Android:', error)
        return jsonResponse({ error: error?.message || 'No se pudieron cargar las categorías.' }, 502)
      }
    }

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

  if (method === 'POST' && parsedUrl.pathname === '/api/cuentas') {
    return createAndroidAccount(init, sourceRequest)
  }

  if (method === 'PATCH' && parsedUrl.pathname === '/api/cuentas') {
    return updateAndroidAccount(init, sourceRequest)
  }

  if ((method === 'PATCH' || method === 'DELETE') && getAndroidCreateKind(parsedUrl.pathname)) {
    return updateAndroidTransaction(parsedUrl, method, init, sourceRequest)
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
