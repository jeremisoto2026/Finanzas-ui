import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { LockKeyhole, LogIn, UserPlus, Loader2, LogOut } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { GastosProvider } from '@/contexts/GastosContext'
import Layout from '@/components/layout/Layout'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return
      if (error) console.error('No se pudo recuperar la sesión:', error)
      setSession(data?.session || null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setLoading(false)
    })

    return () => {
      alive = false
      subscription.unsubscribe()
    }
  }, [])

  const value = useMemo(() => ({
    session,
    user: session?.user || null,
    loading,
    signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
    signUp: (email, password) => supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    }),
    signOut: () => supabase.auth.signOut(),
  }), [session, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return value
}

function AuthScreen() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function submit(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    if (!email.trim() || password.length < 8) {
      setError('Introduce un correo válido y una contraseña de al menos 8 caracteres.')
      return
    }

    setBusy(true)
    try {
      const { data, error: authError } = mode === 'signin'
        ? await signIn(email.trim(), password)
        : await signUp(email.trim(), password)
      if (authError) throw authError
      if (mode === 'signup' && !data.session) {
        setNotice('Cuenta creada. Revisa tu correo para confirmar la dirección antes de iniciar sesión.')
      } else if (mode === 'signup') {
        setNotice('Cuenta creada correctamente.')
      }
    } catch (err) {
      setError(err.message || 'No se pudo completar la autenticación.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4 py-10">
      <section className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 p-7 shadow-2xl">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
          <LockKeyhole className="h-6 w-6" />
        </div>
        <h1 className="text-center text-2xl font-bold">Finanzas-ui</h1>
        <p className="mt-2 text-center text-sm text-slate-400">
          {mode === 'signin' ? 'Inicia sesión para acceder a tus finanzas.' : 'Crea tu cuenta privada de finanzas.'}
        </p>

        <form onSubmit={submit} className="mt-7 space-y-4">
          <label className="block text-sm text-slate-300">
            Correo electrónico
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={event => setEmail(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-white outline-none focus:border-emerald-500"
              placeholder="tu correo"
            />
          </label>
          <label className="block text-sm text-slate-300">
            Contraseña
            <input
              type="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              minLength={8}
              required
              value={password}
              onChange={event => setPassword(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-white outline-none focus:border-emerald-500"
              placeholder="Mínimo 8 caracteres"
            />
          </label>

          {error && <p role="alert" className="rounded-lg border border-red-800/60 bg-red-950/40 p-3 text-sm text-red-300">{error}</p>}
          {notice && <p role="status" className="rounded-lg border border-emerald-800/60 bg-emerald-950/40 p-3 text-sm text-emerald-300">{notice}</p>}

          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-wait disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === 'signin' ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
            {busy ? 'Procesando…' : mode === 'signin' ? 'Iniciar sesión' : 'Crear cuenta'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); setNotice('') }}
          className="mt-5 w-full text-center text-sm text-slate-400 hover:text-white"
        >
          {mode === 'signin' ? '¿Aún no tienes cuenta? Crear cuenta' : 'Ya tengo cuenta. Iniciar sesión'}
        </button>
      </section>
    </main>
  )
}

function AuthenticatedFinanceApp() {
  const { user, signOut } = useAuth()
  const [profileReady, setProfileReady] = useState(false)
  const [profileError, setProfileError] = useState('')

  useEffect(() => {
    let alive = true
    setProfileReady(false)
    setProfileError('')

    supabase.from('profiles')
      .upsert({ id: user.id }, { onConflict: 'id' })
      .then(({ error }) => {
        if (!alive) return
        if (error) setProfileError('No se pudo inicializar tu perfil: ' + error.message)
        else setProfileReady(true)
      })

    return () => { alive = false }
  }, [user.id])

  if (profileError) {
    return (
      <main className="min-h-screen bg-slate-950 p-8 text-center text-red-300">
        <p>{profileError}</p>
        <button onClick={() => signOut()} className="mt-4 rounded-lg bg-slate-800 px-4 py-2 text-white">Cerrar sesión</button>
      </main>
    )
  }

  if (!profileReady) {
    return <main className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-300"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Preparando tu espacio financiero…</main>
  }

  return (
    <GastosProvider>
      <div className="relative">
        <div className="flex justify-end bg-slate-950 px-4 pt-3">
          <button
            onClick={() => signOut()}
            className="inline-flex items-center gap-2 rounded-md border border-slate-800 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-900 hover:text-white"
          >
            <LogOut className="h-3.5 w-3.5" /> Cerrar sesión
          </button>
        </div>
        <Layout />
      </div>
    </GastosProvider>
  )
}

export function AuthGate() {
  const { user, loading } = useAuth()
  if (loading) return <main className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-300"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Comprobando sesión…</main>
  return user ? <AuthenticatedFinanceApp /> : <AuthScreen />
}
