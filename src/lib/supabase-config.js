const CLIENT_VARIABLES = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY']

/**
 * Read the Vite build-time Supabase configuration and fail with an actionable
 * message when the Preview build is missing one of its public client values.
 * These values are public by design; access control is enforced by Supabase RLS.
 */
export function resolveSupabaseClientConfig(env = {}) {
  const url = String(env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '')
  const publishableKey = String(env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim()
  const missing = CLIENT_VARIABLES.filter((name) => !String(env[name] || '').trim())

  if (missing.length) {
    const names = missing.join(' y ')
    throw new Error(
      'Configuración de Supabase incompleta: falta ' + names + '. ' +
      'En Vercel, añade ambas variables al entorno Preview de la rama que estás desplegando. ' +
      'Vite las incorpora durante la compilación, por lo que es necesario generar un nuevo despliegue.'
    )
  }

  let parsedUrl
  try {
    parsedUrl = new URL(url)
  } catch {
    throw new Error('VITE_SUPABASE_URL no tiene un formato de URL válido.')
  }

  const isLocalDevelopment = ['localhost', '127.0.0.1'].includes(parsedUrl.hostname)
  if (parsedUrl.protocol !== 'https:' && !(isLocalDevelopment && parsedUrl.protocol === 'http:')) {
    throw new Error('VITE_SUPABASE_URL debe usar HTTPS (HTTP solo se permite para Supabase local).')
  }

  if (!publishableKey.startsWith('sb_publishable_') && !publishableKey.startsWith('eyJ')) {
    throw new Error('VITE_SUPABASE_PUBLISHABLE_KEY no parece una clave publishable o anon válida.')
  }

  return { url, publishableKey }
}
