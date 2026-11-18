import { useCallback, useEffect, useState } from 'react'
import {
  BellRing,
  CheckCircle2,
  CircleAlert,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Trash2,
} from 'lucide-react'
import {
  clearLocalCaptures,
  getLocalCaptureState,
  isFinanzasAndroid,
  listenForCaptureChanges,
  openNotificationAccessSettings,
} from '@/lib/native-captures'

const formatAmount = (capture) => new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: capture.currencyCode || 'EUR',
}).format(Number(capture.amountCents || 0) / 100)

const formatDate = (value) => {
  const date = new Date(Number(value))
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible'
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export default function CapturasAutomaticas() {
  const isNative = isFinanzasAndroid()
  const [permissionEnabled, setPermissionEnabled] = useState(false)
  const [captures, setCaptures] = useState([])
  const [loading, setLoading] = useState(true)
  const [clearing, setClearing] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadCaptures = useCallback(async (showSpinner = true) => {
    if (!isNative) {
      setLoading(false)
      return
    }

    if (showSpinner) setLoading(true)
    setError('')
    try {
      const result = await getLocalCaptureState()
      setPermissionEnabled(Boolean(result.permissionEnabled))
      setCaptures(Array.isArray(result.captures) ? result.captures : [])
    } catch (loadError) {
      setError(loadError?.message || 'No se pudieron consultar las capturas locales.')
    } finally {
      setLoading(false)
    }
  }, [isNative])

  useEffect(() => {
    if (!isNative) {
      setLoading(false)
      return undefined
    }

    let active = true
    let listenerHandle = null

    const refresh = () => {
      if (active) loadCaptures(false)
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh()
    }

    loadCaptures()
    listenForCaptureChanges(refresh)
      .then((handle) => {
        if (active) listenerHandle = handle
        else handle.remove()
      })
      .catch(() => {})

    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      active = false
      listenerHandle?.remove()
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [isNative, loadCaptures])

  const openSettings = async () => {
    setError('')
    try {
      await openNotificationAccessSettings()
    } catch (openError) {
      setError(openError?.message || 'No se pudieron abrir los ajustes.')
    }
  }

  const clearCaptures = async () => {
    if (!window.confirm('Se borrarán solo las capturas guardadas en este teléfono. No se eliminarán gastos de Finanzas. ¿Continuar?')) {
      return
    }

    setClearing(true)
    setError('')
    setNotice('')
    try {
      await clearLocalCaptures()
      await loadCaptures(false)
      setNotice('Capturas locales borradas. No se ha modificado ningún movimiento ni saldo.')
    } catch (clearError) {
      setError(clearError?.message || 'No se pudieron borrar las capturas.')
    } finally {
      setClearing(false)
    }
  }

  if (!isNative) {
    return (
      <section className="mx-auto max-w-4xl space-y-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">Automatización</p>
          <h1 className="mt-2 text-2xl font-bold text-white">Capturas automáticas</h1>
          <p className="mt-1 text-sm text-slate-400">Consulta los pagos reconocidos en tu teléfono.</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <Smartphone className="h-8 w-8 text-emerald-300" />
          <h2 className="mt-4 text-lg font-semibold text-white">Disponible en la APK de Finanzas</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            Las capturas de Revolut y Google Wallet se guardan cifradas en el teléfono Android.
            Abre esta sección desde la aplicación Finanzas instalada para consultarlas.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">Automatización</p>
          <h1 className="mt-2 text-2xl font-bold text-white">Capturas automáticas</h1>
          <p className="mt-1 text-sm text-slate-400">Pagos detectados localmente por este teléfono.</p>
        </div>
        <button
          type="button"
          onClick={() => loadCaptures()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
        >
          <RefreshCw className={'h-4 w-4 ' + (loading ? 'animate-spin' : '')} />
          Actualizar
        </button>
      </div>

      {error && <p role="alert" className="rounded-xl border border-rose-800/60 bg-rose-950/30 p-3 text-sm text-rose-200">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-800/60 bg-emerald-950/30 p-3 text-sm text-emerald-200">{notice}</p>}

      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-emerald-500/10 p-3 text-emerald-300">
              <BellRing className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-white">Acceso a notificaciones</h2>
              <p className="mt-1 text-xs text-slate-400">Solo se procesan Revolut y Google Wallet.</p>
            </div>
          </div>
          <span className={'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ' + (permissionEnabled ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300')}>
            {permissionEnabled ? <CheckCircle2 className="h-4 w-4" /> : <CircleAlert className="h-4 w-4" />}
            {permissionEnabled ? 'Acceso activado' : 'Permiso pendiente'}
          </span>
        </div>
        <button
          type="button"
          onClick={openSettings}
          className="mt-4 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-500"
        >
          Abrir ajustes de acceso a notificaciones
        </button>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Compras detectadas</h2>
            <p className="mt-1 text-xs text-slate-400">{captures.length} capturas guardadas en este dispositivo</p>
          </div>
          {captures.length > 0 && (
            <button
              type="button"
              onClick={clearCaptures}
              disabled={clearing}
              className="inline-flex items-center gap-2 rounded-lg border border-rose-900/60 px-3 py-2 text-xs font-medium text-rose-300 hover:bg-rose-950/30 disabled:opacity-50"
            >
              {clearing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Borrar capturas locales
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" /> Consultando el teléfono…
          </div>
        ) : captures.length === 0 ? (
          <div className="py-12 text-center">
            <Smartphone className="mx-auto h-8 w-8 text-slate-600" />
            <p className="mt-3 text-sm text-slate-300">Todavía no hay compras capturadas en esta APK.</p>
            <p className="mt-1 text-xs text-slate-500">Cuando llegue un aviso compatible, aparecerá aquí.</p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {captures.map((capture) => (
              <article key={capture.id} className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-white">{capture.merchant || 'Comercio no identificado'}</h3>
                    <p className="mt-1 text-xs text-slate-500">{formatDate(capture.occurredAtMillis)}</p>
                  </div>
                  <span className={'rounded-full px-2.5 py-1 text-[11px] font-semibold ' + (capture.isPaired ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300')}>
                    {capture.isPaired ? 'Avisos unidos' : 'Un aviso'}
                  </span>
                </div>
                <p className="mt-3 text-2xl font-bold text-emerald-300">{formatAmount(capture)}</p>
                <p className="mt-2 text-xs text-slate-400">{(capture.sources || []).join(' + ')}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {[capture.accountName, capture.cardLast4 ? 'Tarjeta ··' + capture.cardLast4 : null, capture.categorySuggestion].filter(Boolean).join(' · ')}
                </p>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
          <div>
            <h2 className="text-sm font-semibold text-white">Privacidad y estado de sincronización</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              Las capturas permanecen cifradas en este teléfono. En esta versión no se envían a Supabase,
              no se crean gastos y no se modifican saldos. La sincronización automática queda desactivada
              hasta completar más pruebas y validar la conciliación para evitar duplicados.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
