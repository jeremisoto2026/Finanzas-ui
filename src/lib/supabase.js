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

// Attach the signed-in user's JWT to same-origin Vercel API calls.
// The server validates the JWT and Postgres RLS still enforces row ownership.
export function installAuthenticatedApiFetch() {
  if (apiFetchInstalled || typeof window === 'undefined') return

  const originalFetch = window.fetch.bind(window)
  window.fetch = async (input, init = {}) => {
    const requestUrl = typeof input === 'string' ? input : input?.url
    if (typeof requestUrl !== 'string' || !requestUrl.startsWith('/api/')) {
      return originalFetch(input, init)
    }

    const headers = new Headers(
      init.headers || (input instanceof Request ? input.headers : undefined)
    )
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) {
      headers.set('Authorization', `Bearer ${session.access_token}`)
    }

    return originalFetch(input, { ...init, headers })
  }

  apiFetchInstalled = true
}
