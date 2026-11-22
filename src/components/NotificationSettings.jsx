import FinanceSelect from '@/components/ui/FinanceSelect'
import { useCallback, useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import NativeReminderSettings from '@/components/NativeReminderSettings'
import { Bell, BellRing, Check, Clock3, Loader2, Smartphone, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const DEFAULT_PREFERENCES = {
  fixed_payments_enabled: true,
  installments_enabled: true,
  reminder_days_before: 3,
  reminder_hour: 9,
  same_day_enabled: false,
  timezone: 'Europe/Madrid',
  budget_alerts_enabled: true,
  overdue_installments_enabled: true,
  balance_alerts_enabled: true,
  commitment_summary_enabled: true,
  commitment_summary_days: 7,
}

const euro = (value, currency = 'EUR') => new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: currency || 'EUR',
}).format(Number(value || 0))

const dateLabel = (value) => {
  if (!value) return ''
  const date = new Date(String(value).slice(0, 10) + 'T12:00:00.000Z')
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Madrid',
  }).format(date)
}

function decodeBase64Url(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), '=')
  const raw = window.atob(padded)
  return Uint8Array.from(raw, (character) => character.charCodeAt(0))
}

function Switch({ checked, onChange, disabled = false, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ' + (checked ? 'bg-emerald-500' : 'bg-slate-600')}
    >
      <span className={'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ' + (checked ? 'translate-x-5' : 'translate-x-0.5')} />
    </button>
  )
}

function WebPushNotificationSettings() {
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES)
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState('')
  const [busyPush, setBusyPush] = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [permission, setPermission] = useState(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  )
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const publicKey = import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError
      if (!user) throw new Error('Inicia sesión para configurar tus recordatorios.')

      const [preferencesResult, notificationsResult] = await Promise.all([
        supabase.from('notification_preferences')
          .select('fixed_payments_enabled, installments_enabled, reminder_days_before, reminder_hour, same_day_enabled, timezone, budget_alerts_enabled, overdue_installments_enabled, balance_alerts_enabled, commitment_summary_enabled, commitment_summary_days')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase.from('notifications')
          .select('id, title, body, due_on, amount, currency_code, source_type, read_at, push_status, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(8),
      ])

      if (preferencesResult.error) throw preferencesResult.error
      if (notificationsResult.error) throw notificationsResult.error

      setPreferences({ ...DEFAULT_PREFERENCES, ...(preferencesResult.data || {}) })
      setNotifications(notificationsResult.data || [])

      if ('serviceWorker' in navigator && 'PushManager' in window) {
        const registration = await navigator.serviceWorker.getRegistration('/')
        const subscription = await registration?.pushManager.getSubscription()
        setIsSubscribed(Boolean(subscription))
      }
      if ('Notification' in window) setPermission(Notification.permission)
    } catch (err) {
      setError(err.message || 'No se pudo cargar la configuración de recordatorios.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const savePreferences = async (patch, key) => {
    setSaving(key)
    setError('')
    setNotice('')
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError
      if (!user) throw new Error('Tu sesión ha caducado. Vuelve a iniciar sesión.')

      const next = { ...preferences, ...patch }
      const { data, error: saveError } = await supabase.from('notification_preferences')
        .upsert({
          user_id: user.id,
          ...next,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })
        .select('fixed_payments_enabled, installments_enabled, reminder_days_before, reminder_hour, same_day_enabled, timezone, budget_alerts_enabled, overdue_installments_enabled, balance_alerts_enabled, commitment_summary_enabled, commitment_summary_days')
        .single()

      if (saveError) throw saveError
      setPreferences({ ...DEFAULT_PREFERENCES, ...data })
      setNotice('Preferencias guardadas.')
    } catch (err) {
      setError(err.message || 'No se pudieron guardar las preferencias.')
    } finally {
      setSaving('')
    }
  }

  const activatePush = async () => {
    setBusyPush(true)
    setError('')
    setNotice('')
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        throw new Error('Este navegador no admite notificaciones push. Prueba con Chrome en Android.')
      }
      if (!publicKey) throw new Error('La clave pública de notificaciones todavía no está configurada.')

      const result = await Notification.requestPermission()
      setPermission(result)
      if (result !== 'granted') throw new Error('No se ha concedido permiso. Activa las notificaciones de Finanzas en los ajustes del navegador.')

      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      await navigator.serviceWorker.ready
      let subscription = await registration.pushManager.getSubscription()
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeBase64Url(publicKey),
        })
      }

      const keys = subscription.toJSON().keys || {}
      if (!keys.p256dh || !keys.auth) throw new Error('El navegador no devolvió las claves necesarias para crear la suscripción.')

      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError
      if (!user) throw new Error('Inicia sesión antes de activar los avisos.')

      const { error: saveError } = await supabase.from('push_subscriptions').upsert({
        user_id: user.id,
        endpoint: subscription.endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        device_label: 'Este dispositivo',
        expiration_time: subscription.expirationTime ? new Date(subscription.expirationTime).toISOString() : null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'endpoint' })

      if (saveError) throw saveError
      setIsSubscribed(true)
      setNotice('Notificaciones activadas en este dispositivo.')
    } catch (err) {
      setError(err.message || 'No se pudieron activar las notificaciones.')
    } finally {
      setBusyPush(false)
    }
  }

  const deactivatePush = async () => {
    setBusyPush(true)
    setError('')
    setNotice('')
    try {
      const registration = await navigator.serviceWorker.getRegistration('/')
      const subscription = await registration?.pushManager.getSubscription()
      if (subscription) {
        const { error: deleteError } = await supabase.from('push_subscriptions')
          .delete()
          .eq('endpoint', subscription.endpoint)
        if (deleteError) throw deleteError
        await subscription.unsubscribe()
      }
      setIsSubscribed(false)
      setNotice('Notificaciones desactivadas en este dispositivo.')
    } catch (err) {
      setError(err.message || 'No se pudo desactivar este dispositivo.')
    } finally {
      setBusyPush(false)
    }
  }

  const markAsRead = async (id) => {
    const { error: updateError } = await supabase.from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
    if (updateError) {
      setError(updateError.message || 'No se pudo actualizar el aviso.')
      return
    }
    setNotifications((current) => current.map((item) =>
      item.id === id ? { ...item, read_at: new Date().toISOString() } : item
    ))
  }

  const unreadCount = notifications.filter((item) => !item.read_at).length

  return (
    <section className="mt-8 space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold text-white">
            <Bell className="h-5 w-5 text-amber-400" />
            Recordatorios y notificaciones
          </h3>
          <p className="mt-1 text-sm text-slate-400">Avisos automáticos aunque no tengas Finanzas abierta.</p>
        </div>
        {unreadCount > 0 && (
          <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-300">
            {unreadCount} sin leer
          </span>
        )}
      </div>

      {error && <p role="alert" className="rounded-lg border border-rose-800/60 bg-rose-950/30 p-3 text-sm text-rose-200">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-emerald-800/60 bg-emerald-950/30 p-3 text-sm text-emerald-200">{notice}</p>}

      <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-emerald-500/10 p-2.5 text-emerald-300">
            {isSubscribed ? <BellRing className="h-5 w-5" /> : <Smartphone className="h-5 w-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-medium text-white">{isSubscribed ? 'Este dispositivo está conectado' : 'Activa los avisos en tu móvil'}</div>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              {permission === 'denied'
                ? 'El navegador bloqueó los avisos. Cambia el permiso de notificaciones de Finanzas en los ajustes del sitio.'
                : isSubscribed
                  ? 'Los avisos push pueden llegar aunque cierres la web, mientras el navegador permita las notificaciones.'
                  : 'Se solicitará permiso al navegador y guardaremos una suscripción segura para este dispositivo.'}
            </p>
            <button
              type="button"
              disabled={busyPush || loading || permission === 'denied' || (!publicKey && !isSubscribed)}
              onClick={isSubscribed ? deactivatePush : activatePush}
              className={'mt-3 inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ' + (isSubscribed ? 'border border-slate-600 text-slate-200 hover:bg-slate-800' : 'bg-emerald-600 text-white hover:bg-emerald-500')}
            >
              {busyPush ? <Loader2 className="h-4 w-4 animate-spin" /> : isSubscribed ? <Trash2 className="h-4 w-4" /> : <BellRing className="h-4 w-4" />}
              {busyPush ? 'Actualizando…' : isSubscribed ? 'Desactivar en este dispositivo' : 'Activar notificaciones push'}
            </button>
            {!publicKey && !isSubscribed && <p className="mt-2 text-[11px] text-amber-300">Pendiente de configurar la clave pública en Vercel.</p>}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4 rounded-xl bg-slate-800/50 p-3">
          <div>
            <div className="text-sm font-medium text-slate-100">Recordatorios de pagos fijos</div>
            <div className="text-xs text-slate-400">Alquiler, teléfono, abogado y otros pagos recurrentes</div>
          </div>
          <Switch checked={preferences.fixed_payments_enabled} disabled={loading || Boolean(saving)} label="Activar recordatorios de pagos fijos" onChange={(value) => savePreferences({ fixed_payments_enabled: value }, 'fixed')} />
        </div>

        <div className="flex items-center justify-between gap-4 rounded-xl bg-slate-800/50 p-3">
          <div>
            <div className="text-sm font-medium text-slate-100">Recordatorios de cuotas</div>
            <div className="text-xs text-slate-400">Compras financiadas y cuotas pendientes</div>
          </div>
          <Switch checked={preferences.installments_enabled} disabled={loading || Boolean(saving)} label="Activar recordatorios de cuotas" onChange={(value) => savePreferences({ installments_enabled: value }, 'installments')} />
        </div>

        <div className="space-y-3 rounded-xl border border-emerald-900/40 bg-emerald-950/10 p-4">
          <div>
            <div className="text-sm font-semibold text-emerald-200">Alertas inteligentes</div>
            <div className="mt-1 text-xs text-slate-400">Avisos automáticos calculados con tus movimientos confirmados y compromisos.</div>
          </div>
          {[
            ['budget_alerts_enabled', 'Umbrales de presupuesto', 'Avisar al alcanzar el 50 %, 80 % y 100 %.'],
            ['overdue_installments_enabled', 'Cuotas vencidas', 'Avisar si una cuota sigue pendiente después de su fecha.'],
            ['balance_alerts_enabled', 'Saldo libre insuficiente', 'Comparar tu saldo en euros, menos reservas, con los pagos próximos.'],
            ['commitment_summary_enabled', 'Resumen de compromisos', 'Recibir un resumen diario de pagos próximos.'],
          ].map(([key, title, description]) => (
            <div key={key} className="flex items-center justify-between gap-4 rounded-lg bg-slate-900/60 p-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-100">{title}</div>
                <div className="mt-1 text-xs text-slate-400">{description}</div>
              </div>
              <Switch checked={Boolean(preferences[key])} disabled={loading || Boolean(saving)} label={title} onChange={(value) => savePreferences({ [key]: value }, key)} />
            </div>
          ))}
          <label className="block text-xs text-slate-400">
            Antelación del resumen
            <FinanceSelect value={preferences.commitment_summary_days || 7} disabled={loading || Boolean(saving)} onChange={(event) => savePreferences({ commitment_summary_days: Number(event.target.value) }, 'summary-days')} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white">
              {[3, 7, 14, 30].map((days) => <option key={days} value={days}>{days} días</option>)}
            </FinanceSelect>
          </label>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="rounded-xl bg-slate-800/50 p-3">
            <span className="block text-sm font-medium text-slate-100">Avisar con antelación</span>
            <span className="mt-1 block text-xs text-slate-400">Días antes del vencimiento</span>
            <FinanceSelect
              value={preferences.reminder_days_before}
              disabled={loading || Boolean(saving)}
              onChange={(event) => savePreferences({ reminder_days_before: Number(event.target.value) }, 'days')}
              className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
            >
              {[1, 2, 3, 5, 7].map((days) => <option key={days} value={days}>{days} {days === 1 ? 'día' : 'días'} antes</option>)}
            </FinanceSelect>
          </label>

          <label className="rounded-xl bg-slate-800/50 p-3">
            <span className="block text-sm font-medium text-slate-100">Hora del recordatorio</span>
            <span className="mt-1 block text-xs text-slate-400">Zona horaria: Europe/Madrid</span>
            <FinanceSelect
              value={preferences.reminder_hour}
              disabled={loading || Boolean(saving)}
              onChange={(event) => savePreferences({ reminder_hour: Number(event.target.value) }, 'hour')}
              className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
            >
              {[7, 8, 9, 10, 11, 12, 18, 19, 20].map((hour) => <option key={hour} value={hour}>{String(hour).padStart(2, '0')}:00</option>)}
            </FinanceSelect>
          </label>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-xl bg-slate-800/50 p-3">
          <div>
            <div className="text-sm font-medium text-slate-100">Aviso el mismo día</div>
            <div className="text-xs text-slate-400">Segundo recordatorio cuando llega el vencimiento</div>
          </div>
          <Switch checked={preferences.same_day_enabled} disabled={loading || Boolean(saving)} label="Activar un aviso el mismo día" onChange={(value) => savePreferences({ same_day_enabled: value }, 'same-day')} />
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Clock3 className="h-3.5 w-3.5" />
        El sistema comprobará los vencimientos automáticamente y evitará repetir el mismo aviso.
        {saving && <span className="ml-auto inline-flex items-center gap-1 text-slate-300"><Loader2 className="h-3 w-3 animate-spin" /> Guardando</span>}
      </div>

      <div className="border-t border-slate-800 pt-4">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-100">Historial de avisos</h4>
          <button type="button" onClick={loadData} disabled={loading} className="text-xs text-emerald-300 hover:text-emerald-200 disabled:opacity-50">Actualizar</button>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Cargando avisos…</div>
        ) : notifications.length === 0 ? (
          <p className="rounded-lg bg-slate-800/40 p-4 text-sm text-slate-400">Todavía no hay recordatorios. Cuando se acerque un vencimiento aparecerá aquí.</p>
        ) : (
          <div className="space-y-2">
            {notifications.map((item) => (
              <div key={item.id} className={'rounded-xl border p-3 ' + (item.read_at ? 'border-slate-800 bg-slate-950/30' : 'border-amber-800/40 bg-amber-950/10')}>
                <div className="flex items-start gap-3">
                  <div className={'mt-0.5 rounded-lg p-2 ' + (item.read_at ? 'bg-slate-800 text-slate-400' : 'bg-amber-500/10 text-amber-300')}>
                    {item.read_at ? <Check className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-100">{item.title}</div>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{item.body}</p>
                    <div className="mt-1 text-[11px] text-slate-500">
                      {item.due_on ? 'Vence ' + dateLabel(item.due_on) : dateLabel(item.created_at?.slice(0, 10))}
                      {item.amount != null ? ' · ' + euro(item.amount, item.currency_code) : ''}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">
                      {item.push_status === 'sent' ? 'Notificación enviada al dispositivo' : item.push_status === 'failed' ? 'No se pudo enviar el aviso' : 'Aviso pendiente de envío'}
                    </div>
                  </div>
                  {!item.read_at && (
                    <button type="button" onClick={() => markAsRead(item.id)} className="shrink-0 text-xs text-emerald-300 hover:text-emerald-200">Marcar leído</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}


export default function NotificationSettings() {
  if (Capacitor.getPlatform() === 'android') return <NativeReminderSettings />
  return <WebPushNotificationSettings />
}
