import { useCallback, useEffect, useState } from 'react'
import { BellRing, Laptop, ShieldCheck } from 'lucide-react'
import { isFinanzasAndroid } from '@/lib/native-captures'
import {
  enableBrowserPush,
  getBrowserPushSubscription,
  readWebPushPermission,
  supportsWebPush,
} from '@/lib/web-push-setup'

function wasHandled(key) {
  try {
    return ['completed', 'skipped'].includes(window.localStorage.getItem(key))
  } catch {
    return false
  }
}

function saveHandled(key, value) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // The welcome flow still works for the current session if storage is unavailable.
  }
}

function PermissionStatus({ checking, permission, subscribed }) {
  const enabled = permission === 'granted' && subscribed
  const label = checking ? 'Comprobando…' : enabled ? 'Activado' : permission === 'denied' ? 'Bloqueado' : 'Pendiente'
  const styles = checking
    ? 'bg-slate-700/60 text-slate-300'
    : enabled
      ? 'bg-emerald-500/10 text-emerald-300'
      : permission === 'denied'
        ? 'bg-rose-500/10 text-rose-300'
        : 'bg-amber-500/10 text-amber-300'

  return <span className={'rounded-full px-2.5 py-1 text-[11px] font-semibold ' + styles}>{label}</span>
}

/**
 * First-login welcome for desktop/tablet browsers. Android keeps its own
 * native permission flow and notification-listener setup.
 */
export default function FirstLoginWebSetup({ userId }) {
  const storageKey = 'finanzas:first-login-web-notifications:v1:' + userId
  const [visible, setVisible] = useState(() => !isFinanzasAndroid() && !wasHandled(storageKey))
  const [permission, setPermission] = useState(readWebPushPermission())
  const [subscribed, setSubscribed] = useState(false)
  const [checking, setChecking] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const finish = useCallback((result) => {
    saveHandled(storageKey, result)
    setVisible(false)
  }, [storageKey])

  useEffect(() => {
    if (!visible) return undefined
    let active = true

    async function checkStatus() {
      setChecking(true)
      try {
        const currentPermission = readWebPushPermission()
        const subscription = await getBrowserPushSubscription()
        if (!active) return
        setPermission(currentPermission)
        setSubscribed(Boolean(subscription))
        if (currentPermission === 'granted' && subscription) finish('completed')
      } catch (checkError) {
        if (active) setError(checkError.message || 'No se pudo comprobar el estado de las notificaciones.')
      } finally {
        if (active) setChecking(false)
      }
    }

    void checkStatus()
    return () => { active = false }
  }, [visible, finish])

  const activate = async () => {
    setBusy(true)
    setError('')
    try {
      // The permission request starts inside this explicit click, as required by browsers.
      const result = await enableBrowserPush(userId)
      setPermission(result.permission)
      if (result.permission !== 'granted') {
        setError(result.permission === 'denied'
          ? 'El navegador ha bloqueado las notificaciones. Pulsa el icono de controles del sitio junto a la dirección de Finanzas, cambia Notificaciones a Permitir y vuelve a intentarlo.'
          : 'No se concedió permiso para enviar notificaciones.')
        return
      }
      setSubscribed(Boolean(result.subscription))
      finish('completed')
    } catch (activationError) {
      setError(activationError.message || 'No se pudieron activar las notificaciones en este navegador.')
    } finally {
      setBusy(false)
    }
  }

  if (!visible) return null

  const supported = supportsWebPush()
  const denied = permission === 'denied'

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-[#080F1C]/[0.97] px-4 py-6 backdrop-blur-xl" role="presentation">
      <div className="flex min-h-full items-center justify-center">
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="first-login-web-title"
          className="w-full max-w-xl rounded-3xl border border-slate-700/80 bg-slate-900 p-5 shadow-2xl shadow-black/40 sm:p-8"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
            <Laptop className="h-7 w-7" />
          </div>
          <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-400">Bienvenido a Finanzas</p>
          <h1 id="first-login-web-title" className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Configura tus avisos en el ordenador
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            Puedes recibir avisos del navegador sobre pagos fijos, cuotas y vencimientos aunque no tengas abierta la pestaña de Finanzas. Tú decides si quieres activarlos.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <article className="rounded-2xl border border-slate-700/80 bg-slate-950/60 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <BellRing className="h-4 w-4 text-emerald-300" />
                Avisos del navegador
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-400">
                Alertas de pagos y cuotas en este ordenador, según los permisos del navegador.
              </p>
              <div className="mt-3">
                <PermissionStatus checking={checking} permission={permission} subscribed={subscribed} />
              </div>
            </article>
            <article className="rounded-2xl border border-slate-700/80 bg-slate-950/60 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <ShieldCheck className="h-4 w-4 text-sky-300" />
                Tu cuenta financiera
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-400">
                La web usa tu sesión y tus permisos habituales. No necesita acceso a las notificaciones bancarias de tu teléfono.
              </p>
              <span className="mt-3 inline-flex rounded-full bg-sky-500/10 px-2.5 py-1 text-[11px] font-semibold text-sky-200">Protegida por tu cuenta</span>
            </article>
          </div>

          <div className="mt-4 rounded-xl border border-slate-700/80 bg-slate-950/50 p-3.5">
            <p className="text-xs leading-5 text-slate-300">
              <strong className="text-white">Importante:</strong> las capturas automáticas de avisos de Revolut, BBVA y Google Wallet siguen siendo una función de Android. Desde el ordenador puedes consultar y gestionar Finanzas, pero no leer las notificaciones privadas del móvil.
            </p>
          </div>

          {denied && (
            <p className="mt-4 rounded-xl border border-amber-800/50 bg-amber-950/25 p-3 text-xs leading-5 text-amber-100/90">
              El navegador ya tiene bloqueados los avisos de Finanzas. Cambia ese permiso en los ajustes del sitio junto a la dirección web y vuelve a intentarlo.
            </p>
          )}
          {!supported && (
            <p className="mt-4 rounded-xl border border-amber-800/50 bg-amber-950/25 p-3 text-xs leading-5 text-amber-100/90">
              Este navegador no admite notificaciones push. Puedes continuar y usar el resto de Finanzas; prueba con una versión actual de Chrome o Edge para recibir avisos.
            </p>
          )}
          {error && <p role="alert" className="mt-4 rounded-xl border border-rose-800/60 bg-rose-950/40 p-3 text-xs leading-5 text-rose-200">{error}</p>}

          {supported && (
            <button
              type="button"
              disabled={checking || busy}
              onClick={activate}
              className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <BellRing className="h-4 w-4" />}
              {busy ? 'Activando avisos…' : denied ? 'Volver a comprobar permisos' : subscribed ? 'Confirmar configuración' : 'Activar notificaciones'}
            </button>
          )}

          <button
            type="button"
            onClick={() => finish('skipped')}
            disabled={busy}
            className="mt-3 flex min-h-11 w-full items-center justify-center rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
          >
            Continuar sin activar ahora
          </button>
          <p className="mt-4 text-center text-[11px] leading-5 text-slate-500">
            Podrás activar o desactivar las notificaciones más adelante desde Ajustes → Avisos y recordatorios.
          </p>
        </section>
      </div>
    </div>
  )
}
