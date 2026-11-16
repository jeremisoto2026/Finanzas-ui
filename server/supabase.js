import { createClient } from '@supabase/supabase-js'

export function createAuthenticatedClient(req) {
  const authorization = req.headers?.authorization || req.headers?.Authorization
  const token = typeof authorization === 'string' && authorization.startsWith('Bearer ')
    ? authorization.slice(7).trim()
    : ''

  if (!token) {
    const error = new Error('Debes iniciar sesión para acceder a tus datos.')
    error.statusCode = 401
    throw error
  }

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) throw new Error('La conexión de Supabase no está configurada en este entorno.')

  const supabase = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  })

  return supabase.auth.getUser(token).then(({ data, error }) => {
    if (error || !data?.user) {
      const authError = new Error('La sesión no es válida o ha caducado.')
      authError.statusCode = 401
      throw authError
    }
    return { supabase, user: data.user }
  })
}

export function sendApiError(res, error, fallback = 'No se pudo completar la operación.') {
  const status = error?.statusCode || 500
  if (status >= 500) console.error('Error de API de Finanzas-ui:', error)
  return res.status(status).json({
    error: status === 500 ? fallback : error.message,
  })
}

export async function findOrCreateCategory(supabase, userId, label, direction = 'both') {
  const name = String(label || '').trim()
  if (!name) return null
  const { data: found, error: findError } = await supabase
    .from('categories')
    .select('id')
    .eq('user_id', userId)
    .eq('name', name)
    .maybeSingle()
  if (findError) throw findError
  if (found) return found.id

  const { data: created, error: createError } = await supabase
    .from('categories')
    .insert({ user_id: userId, name, direction })
    .select('id')
    .single()
  if (createError) {
    if (createError.code === '23505') {
      const { data: retry, error: retryError } = await supabase
        .from('categories').select('id').eq('user_id', userId).eq('name', name).single()
      if (retryError) throw retryError
      return retry.id
    }
    throw createError
  }
  return created.id
}

export async function findOrCreateAccount(supabase, userId, label) {
  const name = String(label || 'Sin asignar').trim() || 'Sin asignar'
  const { data: found, error: findError } = await supabase
    .from('accounts').select('id').eq('user_id', userId).eq('name', name).maybeSingle()
  if (findError) throw findError
  if (found) return found.id

  const { data: created, error: createError } = await supabase
    .from('accounts')
    .insert({ user_id: userId, name, opening_balance: 0, opening_balance_date: new Date().toISOString().slice(0, 10) })
    .select('id')
    .single()
  if (createError) {
    if (createError.code === '23505') {
      const { data: retry, error: retryError } = await supabase
        .from('accounts').select('id').eq('user_id', userId).eq('name', name).single()
      if (retryError) throw retryError
      return retry.id
    }
    throw createError
  }
  return created.id
}
