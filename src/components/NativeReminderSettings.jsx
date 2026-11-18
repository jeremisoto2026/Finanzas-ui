import { useCallback, useEffect, useState } from 'react'
import { BellRing, CheckCircle2, Clock3, Loader2, ShieldCheck, Smartphone, Volume2 } from 'lucide-react'
import { LocalNotifications } from '@capacitor/local-notifications'
import { supabase } from '@/lib/supabase'
import {
  DEFAULT_REMINDER_PREFERENCES,
  getNativeReminderData,
  hasNativeReminderPlugin,
  requestNativeReminderPermission,
  syncNativeReminders,
} from '@/lib/native-reminders'

const TEST_NOTIFICATION_ID = 1_399_999_999

function Switch({ checked, onChange, label, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ' + (checked ? 'bg-emerald-500' : 'bg-slate-600')}
    >
      <span className={'inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ' + (checked ? 'translate-x-5' : 'translate-x-0.5')} />
    </button>
  )
}

export default function NativeReminderSettings() {
  const [preferences, setPreferences] = useState(DEFAULT_REMINDER_PREFERENCES)
  const [fixedPayments, setFixedPayments] = useState([])
  const [permission, setPermission] = useState('prompt')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [scheduledCount, setScheduledCount] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      if (!hasNativeReminderPlugin()) {
        throw new Error('Esta APK no tiene enlazado el servicio nativo de notificaciones. Instala la versión actualizada de Finanzas.')
      }
      const [{ data: { user }, error: userError }, checkedPermission] = await Promise.all([
        supabase.auth.getUser(),
        LocalNotifications.checkPermissions(),
      ])
      if (userError) throw userError
      if (!user) throw new Error('Tu sesión ha caducado. Vuelve a iniciar sesión.')

      // Ask for Android's native permission the first time the user opens Avisos.
      // This is a contextual request at the point of use, not a surprise at login.
      let devicePermission = checkedPermission
      if (['prompt', 'prompt-with-rationale'].includes(devicePermission.display)) {
        devicePermission = await LocalNotifications.requestPermissions()
      }
      setPermission(devicePermission.display || 'prompt')
      const data = await getNativeReminderData(supabase, user.id)
      setPreferences(data.preferences)
      setFixedPayments(data.fixedPayments)
      if (devicePermission.display === 'granted') {
        const result = await syncNativeReminders(data)
        setScheduledCount(result.scheduled)
      }
    } catch (loadError) {
      setError(loadError.message || 'No se pudieron cargar los recordatorios.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const activate = async () => {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const result = await requestNativeReminderPermission()
      setPermission(result.display || 'prompt')
      if (result.display !== 'granted') {
        throw new Error(result.display === 'denied'
          ? 'El permiso está bloqueado. Actívalo en Ajustes de Android > Aplicaciones > Finanzas > Notificaciones.'
          : 'No se concedió el permiso de notificaciones.')
      }
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError
      if (!user) throw new Error('Inicia sesión para activar los recordatorios.')
      const data = await getNativeReminderData(supabase, user.id)
      const resultSync = await syncNativeReminders(data)
      setScheduledCount(resultSync.scheduled)
      setNotice('Notificaciones permitidas. Finanzas ha programado ' + resultSync.scheduled + ' avisos futuros.')
    } catch (activateError) {
      setError(activateError.message || 'No se pudieron activar los recordatorios.')
    } finally {
      setSaving(false)
    }
  }

  const savePreferences = async (patch) => {
    const next = { ...preferences, ...patch, timezone: 'Europe/Madrid' }
    setPreferences(next)
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError
      if (!user) throw new Error('Tu sesión ha caducado. Vuelve a iniciar sesión.')
      const { error: saveError } = await supabase.from('notification_preferences').upsert({
        user_id: user.id,
        ...next,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
      if (saveError) throw saveError

      if (permission === 'granted') {
        const data = await getNativeReminderData(supabase, user.id)
        const result = await syncNativeReminders(data)
        setScheduledCount(result.scheduled)
      }
      setNotice('Preferencias guardadas y avisos actualizados.')
    } catch (saveError) {
      setError(saveError.message || 'No se pudieron guardar las preferencias.')
      await load()
    } finally {
      setSaving(false)
    }
  }

  const savePaymentReminder = async (paymentId, enabled) => {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError
      if (!user) throw new Error('Tu sesión ha caducado. Vuelve a iniciar sesión.')
      const { error: updateError } = await supabase.from('fixed_payments')
        .update({ notification_enabled: enabled, updated_at: new Date().toISOString() })
        .eq('id', paymentId)
        .eq('user_id', user.id)
      if (updateError) throw updateError
      setFixedPayments((current) => current.map((item) =>
        item.id === paymentId ? { ...item, notification_enabled: enabled } : item
      ))
      if (permission === 'granted') {
        const data = await getNativeReminderData(supabase, user.id)
        const result = await syncNativeReminders(data)
        setScheduledCount(result.scheduled)
      }
      setNotice(enabled ? 'Aviso activado para este pago.' : 'Aviso desactivado para este pago.')
    } catch (updateError) {
      setError(updateError.message || 'No se pudo actualizar el aviso del pago.')
      await load()
    } finally {
      setSaving(false)
    }
  }

  const testNotification = async () => {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      if (permission !== 'granted') throw new Error('Primero activa el permiso de notificaciones.')
      const pending = await LocalNotifications.getPending()
      if ((pending.notifications || []).some((item) => item.id === TEST_NOTIFICATION_ID)) {
        await LocalNotifications.cancel({ notifications: [{ id: TEST_NOTIFICATION_ID }] })
      }
      await LocalNotifications.schedule({
        notifications: [{
          id: TEST_NOTIFICATION_ID,
          title: 'Finanzas está lista',
          body: 'Las notificaciones de tu móvil funcionan correctamente.',
          schedule: { at: new Date(Date.now() + 6000), allowWhileIdle: false },
          channelId: 'finanzas-reminders',
          smallIcon: 'ic_stat_finanzas',
          iconColor: '#18B887',
          isExactNotification: false,
        }],
      })
      setNotice('Prueba preparada. Bloquea la pantalla y espera unos segundos.')
    } catch (testError) {
      setError(testError.message || 'No se pudo programar la notificación de prueba.')
    } finally {
      setSaving(false)
    }
  }

  const permissionLabel = permission === 'granted'
    ? 'Permiso concedido'
    : permission === 'denied'
      ? 'Permiso bloqueado'
      : 'Pendiente de autorización'

  return (
    <section className="mx-auto w-full max-w-4xl space-y-6 pb-8">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">Centro de avisos</p>
        <h1 className="finance-page-title">Recordatorios</h1>
        <p className="finance-muted">Configura avisos de pagos fijos y cuotas directamente en este móvil.</p>
      </header>

      {error && <div role="alert" className="rounded-xl border border-rose-800/60 bg-rose-950/30 p-4 text-sm text-rose-200">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-800/60 bg-emerald-950/30 p-4 text-sm text-emerald-200">{notice}</div>}

      <div className="finance-panel overflow-hidden">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-300">
            {permission === 'granted' ? <BellRing className="h-6 w-6" /> : <Smartphone className="h-6 w-6" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold text-white">Notificaciones del dispositivo</h2>
              <span className={'rounded-full px-2.5 py-1 text-xs font-medium ' + (permission === 'granted' ? 'bg-emerald-500/10 text-emerald-300' : permission === 'denied' ? 'bg-rose-500/10 text-rose-300' : 'bg-amber-500/10 text-amber-300')}>
                {permissionLabel}
              </span>
            </div>
            <p className="mt-1 text-sm leading-6 text-slate-400">
              Los avisos se programan en Android y pueden aparecer aunque cierres Finanzas. No dependen de mantener la web abierta.
            </p>
          </div>
          <button type="button" onClick={activate} disabled={loading || saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
            {permission === 'granted' ? 'Comprobar notificaciones' : 'Volver a solicitar permiso'}
          </button>
        </div>
        <div className="grid gap-3 border-t border-slate-800/80 bg-slate-950/30 p-4 sm:grid-cols-2">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            Tus preferencias se guardan en tu cuenta protegida.
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Volume2 className="h-4 w-4 text-emerald-400" />
            Android controla el sonido y la visualización de los avisos.
          </div>
        </div>
      </div>

      <div className="finance-panel space-y-4 p-5">
        <div>
          <h2 className="font-semibold text-white">Qué avisos recibir</h2>
          <p className="mt-1 text-sm text-slate-400">Los cambios se guardan en tu cuenta y se sincronizan al abrir Finanzas.</p>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-xl bg-slate-800/45 p-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-100">Pagos fijos</p>
            <p className="mt-1 text-xs leading-5 text-slate-400">Alquiler, teléfono, abogado y otros compromisos con aviso activado.</p>
          </div>
          <Switch checked={preferences.fixed_payments_enabled} disabled={loading || saving} label="Recordatorios de pagos fijos" onChange={(value) => savePreferences({ fixed_payments_enabled: value })} />
        </div>

        <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/35 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-100">Avisos por pago fijo</p>
              <p className="mt-1 text-xs text-slate-400">Elige qué pagos deben generar recordatorio.</p>
            </div>
            <span className="rounded-full bg-slate-800 px-2.5 py-1 text-[11px] text-slate-300">{fixedPayments.filter((item) => item.notification_enabled).length}/{fixedPayments.length}</span>
          </div>
          {fixedPayments.length === 0 ? (
            <p className="rounded-lg bg-slate-800/45 p-3 text-xs text-slate-400">No hay pagos fijos activos configurados.</p>
          ) : (
            <div className="divide-y divide-slate-800/80">
              {fixedPayments.map((payment) => (
                <div key={payment.id} className="flex items-center justify-between gap-3 py-3 first:pt-1 last:pb-1">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-200">{payment.name}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {new Intl.NumberFormat('es-ES', { style: 'currency', currency: payment.currency_code || 'EUR' }).format(Number(payment.amount || 0))}
                      {payment.next_due_on ? ' · Próximo: ' + new Date(String(payment.next_due_on).slice(0, 10) + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : ''}
                    </p>
                  </div>
                  <Switch checked={Boolean(payment.notification_enabled)} disabled={loading || saving || permission !== 'granted'} label={'Aviso para ' + payment.name} onChange={(value) => savePaymentReminder(payment.id, value)} />
                </div>
              ))}
            </div>
          )}
          {permission !== 'granted' && <p className="text-[11px] text-amber-300">Activa primero las notificaciones del dispositivo para cambiar estos avisos.</p>}
        </div>

        <div className="flex items-center justify-between gap-4 rounded-xl bg-slate-800/45 p-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-100">Cuotas pendientes</p>
            <p className="mt-1 text-xs leading-5 text-slate-400">Compras financiadas y vencimientos todavía no pagados.</p>
          </div>
          <Switch checked={preferences.installments_enabled} disabled={loading || saving} label="Recordatorios de cuotas" onChange={(value) => savePreferences({ installments_enabled: value })} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="rounded-xl bg-slate-800/45 p-4">
            <span className="block text-sm font-medium text-slate-100">Antelación</span>
            <span className="mt-1 block text-xs text-slate-400">Cuántos días antes avisar</span>
            <select value={preferences.reminder_days_before} disabled={loading || saving} onChange={(event) => savePreferences({ reminder_days_before: Number(event.target.value) })} className="mt-3 min-h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-white">
              {[1, 2, 3, 5, 7].map((days) => <option key={days} value={days}>{days} {days === 1 ? 'día antes' : 'días antes'}</option>)}
            </select>
          </label>
          <label className="rounded-xl bg-slate-800/45 p-4">
            <span className="block text-sm font-medium text-slate-100">Hora</span>
            <span className="mt-1 block text-xs text-slate-400">Zona horaria Europe/Madrid</span>
            <select value={preferences.reminder_hour} disabled={loading || saving} onChange={(event) => savePreferences({ reminder_hour: Number(event.target.value) })} className="mt-3 min-h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-white">
              {[7, 8, 9, 10, 11, 12, 18, 19, 20].map((hour) => <option key={hour} value={hour}>{String(hour).padStart(2, '0')}:00</option>)}
            </select>
          </label>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-xl bg-slate-800/45 p-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-100">Aviso el mismo día</p>
            <p className="mt-1 text-xs leading-5 text-slate-400">Además del aviso anticipado, recibirás otro cuando venza.</p>
          </div>
          <Switch checked={preferences.same_day_enabled} disabled={loading || saving} label="Aviso el mismo día" onChange={(value) => savePreferences({ same_day_enabled: value })} />
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-800 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-slate-400">
            <p className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-emerald-400" /> {scheduledCount == null ? 'Avisos pendientes por calcular' : scheduledCount + ' avisos locales programados'}</p>
            <p className="mt-1">Android puede retrasar avisos no exactos por ahorro de batería.</p>
          </div>
          <button type="button" onClick={testNotification} disabled={loading || saving || permission !== 'granted'} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-slate-800 disabled:opacity-40">
            <BellRing className="h-4 w-4" /> Enviar notificación de prueba
          </button>
        </div>
        {loading && <p className="flex items-center gap-2 text-xs text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando preferencias…</p>}
        {!loading && !saving && notice && <p className="flex items-center gap-2 text-xs text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" /> Configuración actualizada</p>}
      </div>
    </section>
  )
}
