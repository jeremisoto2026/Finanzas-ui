import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { Capacitor, registerPlugin } from '@capacitor/core'
import { Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { DEFAULT_EXPENSE_CATEGORIES } from '@/lib/category-catalog'
import { normalizeCategoryName } from '@/lib/category-utils'
import { GastosProvider } from '@/contexts/GastosContext'
import Layout from '@/components/layout/Layout'
import LandingPage from '@/components/auth/LandingPage'
import NotificationCaptureSync from '@/components/NotificationCaptureSync'
import NativeReminderSync from '@/components/NativeReminderSync'
import FirstLoginPermissions from '@/components/FirstLoginPermissions'

const AuthContext = createContext(null)
const LocalCaptures = registerPlugin('LocalCaptures')

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
    signInWithGoogle: async () => {
      if (Capacitor.getPlatform() === 'android') {
        const { idToken } = await LocalCaptures.signInWithGoogle()
        if (!idToken) throw new Error('Google no devolvió un token de acceso.')
        return supabase.auth.signInWithIdToken({ provider: 'google', token: idToken })
      }
      return supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      })
    },
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
  const { signIn, signUp, signInWithGoogle } = useAuth()
  return <LandingPage signIn={signIn} signUp={signUp} signInWithGoogle={signInWithGoogle} />
}

function AuthenticatedFinanceApp() {
  const { user, signOut } = useAuth()
  const [profileReady, setProfileReady] = useState(false)
  const [profileError, setProfileError] = useState('')

  useEffect(() => {
    let alive = true
    setProfileReady(false)
    setProfileError('')

    async function initializeProfile() {
      const { error: profileError } = await supabase.from('profiles')
        .upsert({ id: user.id }, { onConflict: 'id' })
      if (profileError) throw profileError

      // Notification captures need real category IDs, not only the labels that
      // the expense form can display as defaults. Seed the expense catalog
      // once per user so first-time captures can be reviewed and posted.
      const { data: existingCategories, error: categoriesError } = await supabase
        .from('categories')
        .select('id, name, direction')
        .eq('user_id', user.id)
      if (categoriesError) throw categoriesError

      const byName = new Map((existingCategories || []).map((category) => [
        normalizeCategoryName(category.name),
        category,
      ]))
      const missing = DEFAULT_EXPENSE_CATEGORIES
        .filter((name) => !byName.has(normalizeCategoryName(name)))
        .map((name) => ({
          user_id: user.id,
          name,
          direction: normalizeCategoryName(name) === normalizeCategoryName('Otros') ? 'both' : 'expense',
        }))

      if (missing.length) {
        const { error: seedError } = await supabase.from('categories').insert(missing)
        // A second signed-in device may have seeded the same defaults first.
        if (seedError && seedError.code !== '23505') throw seedError
      }

      const sharedIds = DEFAULT_EXPENSE_CATEGORIES
        .map((name) => byName.get(normalizeCategoryName(name)))
        .filter((category) => category?.id && category.direction === 'income')
        .map((category) => category.id)
      if (sharedIds.length) {
        const { error: directionError } = await supabase.from('categories')
          .update({ direction: 'both' })
          .eq('user_id', user.id)
          .in('id', sharedIds)
        if (directionError) throw directionError
      }
    }

    initializeProfile()
      .then(() => {
        if (alive) setProfileReady(true)
      })
      .catch((error) => {
        if (alive) setProfileError('No se pudo preparar tu perfil y las categorías: ' + error.message)
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
