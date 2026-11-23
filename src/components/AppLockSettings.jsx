import { useEffect, useState } from 'react'
import { Capacitor, registerPlugin } from '@capacitor/core'
import { Fingerprint, LockKeyhole, ShieldCheck } from 'lucide-react'

const AppLock = registerPlugin('AppLock')

export default function AppLockSettings() {
  const isAndroid = Capacitor.getPlatform() === 'android'
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isAndroid) {
      setLoading(false)
      return
    }
    let active = true
    AppLock.getStatus()
      .then((result) => { if (active) setStatus(result) })
      .catch((loadError) => {
        if (active) setError(loadError?.message || 'No se pudo consultar la seguridad del dispositivo.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [isAndroid])

  if (!isAndroid) return null

  const toggle = async () => {
    if (!status?.supported || saving) return
    setSaving(true)
    setError('')
    try {
      const result = await AppLock.setEnabled({ enabled: !status.enabled })
      setStatus((current) => ({ ...current, enabled: result.enabled }))
    } catch (saveError) {
      setError(saveError?.message || 'No se pudo actualizar el bloqueo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-emerald-500/20 bg-slate-900/65 shadow-lg shadow-black/10">
      <div className="flex items-start gap-3 border-b border-slate-800/80 px-4 py-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-300">
          <Fingerprint className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-slate-100">Bloqueo de la aplicación</h2>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Protege Finanzas al volver a abrirla o regresar desde segundo plano.
          </p>
        </div>
        <ShieldCheck className="mt-1 h-4 w-4 shrink-0 text-emerald-400" />
      </div>

      <div className="flex items-center gap-3 px-4 py-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-100">Solicitar huella o bloqueo del móvil</p>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Usa huella dactilar cuando esté disponible. Como alternativa, Android solicitará el PIN, patrón o contraseña del dispositivo.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={Boolean(status?.enabled)}
          aria-label="Activar bloqueo de Finanzas"
          disabled={loading || saving || !status?.supported}
          onClick={toggle}
          className={'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 disabled:cursor-not-allowed disabled:opacity-50 ' + (status?.enabled ? 'bg-emerald-500' : 'bg-slate-700')}
        >
          <span className={'inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ' + (status?.enabled ? 'translate-x-6' : 'translate-x-1')} />
        </button>
      </div>

      <div className="border-t border-slate-800/80 px-4 py-3">
        {loading ? (
          <p className="text-xs text-slate-400">Comprobando la seguridad del dispositivo…</p>
        ) : status?.supported ? (
          <p className="flex items-center gap-2 text-xs text-emerald-300">
            <LockKeyhole className="h-3.5 w-3.5 shrink-0" />
            {status.enabled ? 'Bloqueo activado. Se solicitará autenticación al volver a Finanzas.' : 'Disponible para activar.'}
          </p>
        ) : (
          <p className="text-xs leading-5 text-amber-300">
            {status?.reason || 'Este dispositivo no ofrece un método de bloqueo compatible. Configura un PIN, patrón o contraseña en Android.'}
          </p>
        )}
        {error && <p role="alert" className="mt-2 text-xs leading-5 text-rose-300">{error}</p>}
      </div>
    </section>
  )
}
