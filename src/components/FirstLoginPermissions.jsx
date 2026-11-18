import { useCallback, useEffect, useState } from 'react'
import { BellRing, CheckCircle2, ShieldCheck, Smartphone, Settings2 } from 'lucide-react'
import { LocalNotifications } from '@capacitor/local-notifications'
import {
  getLocalCaptureState,
  isFinanzasAndroid,
  openAppNotificationSettings,
  openNotificationAccessSettings,
} from '@/lib/native-captures'
import { hasNativeReminderPlugin, requestNativeReminderPermission } from '@/lib/native-reminders'

function wasAlreadyHandled(key) {
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
    // The welcome flow still closes for this session if storage is unavailable.
  }
}

function StatusLabel({ checking, enabled, denied = false }) {
  const label = checking ? 'Comprobando…' : enabled ? 'Activado' : denied ? 'Bloqueado' : 'Pendiente'
  const classes = checking
    ? 'bg-slate-700/60 text-slate-300'
    : enabled
      ? 'bg-emerald-500/10 text-emerald-300'
      : denied
        ? 'bg-rose-500/10 text-rose-300'
        : 'bg-amber-500/10 text-amber-300'

  return <span className={'rounded-full px-2.5 py-1 text-[11px] font-semibold ' + classes}>{label}</span>
}

/**
 * One-time Android permission welcome, shown after the first authenticated
 * session for each account on this installation.
 *
 * Android grants POST_NOTIFICATIONS through a runtime dialog. Notification
 * listener access is a separate special access that the user must enable in
 * Android Settings; the app cannot grant it or use Accessibility as a shortcut.
 */
export default function FirstLoginPermissions({ userId }) {
  const storageKey = 'finanzas:first-login-permissions:v1:' + userId
  const [visible, setVisible] = useState(() => isFinanzasAndroid() && !wasAlreadyHandled(storageKey))
  const [notificationStatus, setNotificationStatus] = useState('checking')
  const [captureEnabled, setCaptureEnabled] = useState(false)
  const [checking, setChecking] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const finish = useCallback((result = 'completed') => {
    saveHandled(storageKey, result)
    setVisible(false)
  }, [storageKey])

  const readPermissions = useCallback(async () => {
    if (!hasNativeReminderPlugin()) {
      throw new Error('No se encuentra el módulo nativo de notificaciones. Actualiza Finanzas a la última APK.')
    }

    const [notification, capture] = await Promise.all([
      LocalNotifications.checkPermissions(),
      getLocalCaptureState(),
    ])

    return {
      notificationStatus: notification.display || 'prompt',
      captureEnabled: Boolean(capture.permissionEnabled),
    }
  }, [])

  useEffect(() => {
    if (!visible) return undefined

    let active = true
    const check = async () => {
      setChecking(true)
      try {
        const current = await readPermissions()
        if (!active) return
        setNotificationStatus(current.notificationStatus)
        setCaptureEnabled(current.captureEnabled)
        setError('')
        if (current.notificationStatus === 'granted' && current.captureEnabled) {
          finish('completed')
        }
      } catch (checkError) {
        if (active) setError(checkError.message || 'No se pudieron comprobar los permisos del dispositivo.')
      } finally {
        if (active) setChecking(false)
      }
    }

    const onResume = () => {
      if (document.visibilityState === 'visible') void check()
    }

    void check()
    window.addEventListener('focus', onResume)
    window.addEventListener('pageshow', onResume)
    document.addEventListener('visibilitychange', onResume)

    return () => {
      active = false
      window.removeEventListener('focus', onResume)
      window.removeEventListener('pageshow', onResume)
      document.removeEventListener('visibilitychange', onResume)
    }
  }, [visible, readPermissions, finish])

  const configurePermissions = async () => {
    setBusy(true)
    setError('')
    setNotice('')

    try {
      let status = (await readPermissions()).notificationStatus
      setNotificationStatus(status)

      if (status !== 'granted') {
        if (['prompt', 'prompt-with-rationale'].includes(status)) {
          const requested = await requestNativeReminderPermission()
          status = requested.display || 'prompt'
          setNotificationStatus(status)
        }

        if (status !== 'granted') {
          setError('Android no ha concedido las notificaciones. Puedes volver a intentarlo o abrir los ajustes de la aplicación.')
          return
        }
      }

      const capture = await getLocalCaptureState()
      setCaptureEnabled(Boolean(capture.permissionEnabled))

      if (!capture.permissionEnabled) {
        setNotice('Ahora se abrirán los ajustes de Android. Busca Finanzas y activa «Acceso a notificaciones». Después vuelve a esta pantalla.')
        await openNotificationAccessSettings()
        return
      }

      finish('completed')
    } catch (setupError) {
      setError(setupError.message || 'No se pudieron activar los permisos.')
    } finally {
      setBusy(false)
    }
  }

  const openRelevantSettings = async () => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      if (notificationStatus === 'denied') {
        await openAppNotificationSettings()
        setNotice('Activa las notificaciones de Finanzas en Android y vuelve a la aplicación.')
      } else {
        await openNotificationAccessSettings()
        setNotice('Activa Finanzas en «Acceso a notificaciones» y vuelve a la aplicación.')
      }
    } catch (settingsError) {
      setError(settingsError.message || 'No se pudieron abrir los ajustes de Android.')
    } finally {
      setBusy(false)
    }
  }

  if (!visible) return null

  const notificationGranted = notificationStatus === 'granted'
  const primaryLabel = notificationStatus === 'denied'
    ? 'Abrir ajustes de notificaciones'
    : notificationGranted && !captureEnabled
      ? 'Activar acceso a notificaciones'
      : 'Configurar permisos'

  const handlePrimaryAction = () => {
    if (notificationStatus === 'denied' || (notificationGranted && !captureEnabled)) {
      return openRelevantSettings()
    }
    return configurePermissions()
  }

  return (
    <div
      className="fixed inset-0 z-[100] overflow-y-auto bg-[#080F1C]/[0.97] px-4 py-5 backdrop-blur-xl"
      style={{
        paddingTop: 'calc(1.25rem + env(safe-area-inset-top, 0px))',
        paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))',
      }}
    >
      <div className="flex min-h-full items-center justify-center">
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="first-login-permissions-title"
          className="w-full max-w-lg rounded-3xl border border-slate-700/80 bg-slate-900 p-5 shadow-2xl shadow-black/40 sm:p-7"
        >
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
            <ShieldCheck className="h-7 w-7" />
          </div>

          <p className="mt-5 text-center text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-400">Bienvenida a Finanzas</p>
          <h1 id="first-login-permissions-title" className="mt-2 text-center text-2xl font-bold tracking-tight text-white">
            Prepara tu móvil
          </h1>
          <p className="mt-3 text-center text-sm leading-6 text-slate-400">
            En este primer acceso podemos activar los avisos de pagos y la detección de compras. Android te pedirá autorización y tú decides qué permisos conceder.
          </p>

          <div className="mt-6 space-y-3">
            <article className="rounded-2xl border border-slate-700/80 bg-slate-950/60 p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-300">
                  <BellRing className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-semibold text-white">Notificaciones de Finanzas</h2>
                  <p className="mt-1 text-xs leading-5 text-slate-400">Para recibir recordatorios de pagos y cuotas.</p>
                </div>
                <StatusLabel checking={checking} enabled={notificationGranted} denied={notificationStatus === 'denied'} />
              </div>
            </article>

            <article className="rounded-2xl border border-slate-700/80 bg-slate-950/60 p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-300">
                  <Smartphone className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-semibold text-white">Capturas automáticas</h2>
                  <p className="mt-1 text-xs leading-5 text-slate-400">Acceso especial de Android para detectar avisos de Revolut y Google Wallet.</p>
                </div>
                <StatusLabel checking={checking} enabled={captureEnabled} />
              </div>
            </article>
          </div>

          <div className="mt-4 rounded-xl border border-amber-800/50 bg-amber-950/25 p-3">
            <p className="text-xs leading-5 text-amber-100/90">
              Para las capturas, Android abrirá su pantalla de «Acceso a notificaciones» y tendrás que activar Finanzas manualmente. No es un permiso de Accesibilidad. La aplicación filtra los avisos y solo procesa los de Revolut y Google Wallet.
            </p>
          </div>

          {error && <p role="alert" className="mt-4 rounded-xl border border-rose-800/60 bg-rose-950/40 p-3 text-xs leading-5 text-rose-200">{error}</p>}
          {notice && <p role="status" className="mt-4 rounded-xl border border-sky-800/60 bg-sky-950/40 p-3 text-xs leading-5 text-sky-200">{notice}</p>}

          <button
            type="button"
            disabled={checking || busy}
            onClick={handlePrimaryAction}
            className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <Settings2 className="h-4 w-4" />}
            {busy ? 'Abriendo configuración…' : primaryLabel}
          </button>

          <button
            type="button"
            onClick={() => finish('skipped')}
            disabled={busy}
            className="mt-3 flex min-h-11 w-full items-center justify-center rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
          >
            Continuar sin activar ahora
          </button>

          <p className="mt-4 text-center text-[11px] leading-5 text-slate-500">
            Podrás revisar estos permisos más adelante desde Ajustes de Finanzas.
          </p>
        </section>
      </div>
    </div>
  )
}
