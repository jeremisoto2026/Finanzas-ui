import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { GastosProvider } from '@/contexts/GastosContext'
import Layout from '@/components/layout/Layout'
import LandingPage from '@/components/auth/LandingPage'
import NotificationCaptureSync from '@/components/NotificationCaptureSync'
import NativeReminderSync from '@/components/NativeReminderSync'
import FirstLoginPermissions from '@/components/FirstLoginPermissions'

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
  return <LandingPage signIn={signIn} signUp={signUp} />
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
    return <main className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-300"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Preparando tu espacio en Finanzas…</main>
  }

  return (
    <GastosProvider>
      <NotificationCaptureSync />
      <NativeReminderSync />
      <FirstLoginPermissions userId={user.id} />
      <div className="relative">
        <Layout onSignOut={() => signOut()} />
      </div>
    </GastosProvider>
  )
}

export function AuthGate() {
  const { user, loading } = useAuth()
  if (loading) return <main className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-300"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Comprobando sesión…</main>
  return user ? <AuthenticatedFinanceApp /> : <AuthScreen />
}
