import { createClient } from '@supabase/supabase-js'

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

// Android runs the bundled UI on https://localhost. Route its /api calls to
// the branch-specific Preview host while retaining the signed-in Supabase JWT.
// On the web, an empty VITE_API_BASE_URL keeps the normal same-origin behavior.
export function installAuthenticatedApiFetch() {
  if (apiFetchInstalled || typeof window === 'undefined') return

  const originalFetch = window.fetch.bind(window)
  const configuredApiBase = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '')

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

    const targetUrl = configuredApiBase
      ? configuredApiBase + parsedUrl.pathname + parsedUrl.search
      : requestUrl

    const sourceRequest = input instanceof Request ? input : null
    const initialHeaders = new Headers(init.headers || sourceRequest?.headers)
    const { data: { session } } = await supabase.auth.getSession()

    if (session?.access_token) {
      initialHeaders.set('Authorization', `Bearer ${session.access_token}`)
    }

    if (sourceRequest) {
      const forwardedRequest = new Request(targetUrl, sourceRequest)
      const headers = new Headers(forwardedRequest.headers)
      initialHeaders.forEach((value, key) => headers.set(key, value))
      return originalFetch(new Request(forwardedRequest, { headers }))
    }

    return originalFetch(targetUrl, { ...init, headers: initialHeaders })
  }

  apiFetchInstalled = true
}
