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

async function fetchAndroidApi(parsedUrl, method, input, init, sourceRequest) {
  if (method === 'GET') {
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

  // Only new expense/income entries are enabled in this preview. Editing,
  // voiding, account management and every other write route remain blocked.
  if (method === 'POST' && getAndroidCreateKind(parsedUrl.pathname)) {
    return createAndroidTransaction(parsedUrl, input, init, sourceRequest)
  }

  return jsonResponse({
    error: 'En esta versión de Finanzas Mobile puedes registrar gastos e ingresos nuevos. Las modificaciones y eliminaciones siguen disponibles desde la web.',
  }, 405)
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
