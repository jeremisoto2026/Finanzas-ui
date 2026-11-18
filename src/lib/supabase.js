import { Capacitor } from '@capacitor/core'
import { createClient } from '@supabase/supabase-js'
import { getReadOnlyFinanceResource } from '@/lib/native-dashboard-api'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_PUBLISHABLE_KEY. Configura las variables del proyecto Finanzas-ui.')
}

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
// Preview build is deliberately read-only: no POST/PATCH/DELETE calls are sent.
async function fetchAndroidApi(parsedUrl, method) {
  if (method !== 'GET') {
    return jsonResponse({
      error: 'Esta versión de prueba de Finanzas en Android está en modo consulta. Los cambios siguen disponibles desde la web.',
    }, 405)
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
      return fetchAndroidApi(parsedUrl, method)
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
