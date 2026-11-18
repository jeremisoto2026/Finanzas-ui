const ALLOWED_ORIGINS = new Set([
  'https://localhost',
  'http://localhost',
  'capacitor://localhost',
  'https://finanzas-ui-preview.vercel.app',
  'https://finanzas-ui-seven.vercel.app',
])

// Allow the Capacitor app to call this API cross-origin.
// User identity is still verified through Supabase JWT and database RLS.
export function handleCors(req, res) {
  const origin = req.headers?.origin || req.headers?.Origin || ''

  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, apikey, x-client-info')
  res.setHeader('Access-Control-Max-Age', '86400')

  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  }

  if (req.method === 'OPTIONS') {
    res.setHeader('Cache-Control', 'no-store')
    res.status(204).end()
    return true
  }

  return false
}
