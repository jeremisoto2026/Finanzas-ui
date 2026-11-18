import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BellRing,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Upload,
} from 'lucide-react'
import {
  getLocalCaptureState,
  isFinanzasAndroid,
  listenForCaptureChanges,
  openNotificationAccessSettings,
  syncLocalCaptures,
} from '@/lib/native-captures'
import { supabase } from '@/lib/supabase'

const SOURCE_LABELS = {
  revolut: 'Revolut',
  bbva: 'BBVA',
  google_wallet: 'Google Wallet',
}

const formatAmount = (amount, currencyCode = 'EUR') => new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: currencyCode || 'EUR',
}).format(Number(amount || 0))

const formatDate = (value) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible'
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function groupRemoteEvents(events) {
  const groups = new Map()
  for (const event of events) {
    const key = event.pair_key || event.id
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(event)
  }

  return [...groups.values()]
    .map((items) => {
      const first = items[0]
      const sources = [...new Set(items.map((item) => item.source_app))]
      return {
        id: first.pair_key || first.id,
        merchant: first.parsed_merchant || first.notification_title || 'Comercio no identificado',
        amount: Number(first.parsed_amount || 0),
        currencyCode: String(first.currency_code || 'EUR').trim(),
        occurredAt: first.occurred_at,
        sources,
        categorySuggestion: first.category_suggestion || null,
        eventIds: items.map((item) => item.id),
        accountLabel: items.find((item) => item.account_label)?.account_label || null,
        paymentChannel: first.payment_channel || null,
        cardLast4: items.find((item) => item.card_last4)?.card_last4 || null,
        isPaired: sources.length > 1 || items.some((item) => item.status === 'paired'),
      }
    })
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
}

export default function CapturasAutomaticas() {
  const isNative = isFinanzasAndroid()
  const [permissionEnabled, setPermissionEnabled] = useState(false)
  const [localCaptures, setLocalCaptures] = useState([])
  const [remoteEvents, setRemoteEvents] = useState([])
  const [accounts, setAccounts] = useState([])
  const [categories, setCategories] = useState([])
  const [accountSelections, setAccountSelections] = useState({})
  const [categorySelections, setCategorySelections] = useState({})
  const [savingReviewId, setSavingReviewId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const reviewItems = useMemo(() => groupRemoteEvents(remoteEvents), [remoteEvents])

  const loadCaptures = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true)
    setError('')

    try {
      if (isNative) {
        const localState = await getLocalCaptureState()
        setPermissionEnabled(Boolean(localState.permissionEnabled))
        setLocalCaptures(Array.isArray(localState.captures) ? localState.captures : [])
      } else {
        setPermissionEnabled(false)
        setLocalCaptures([])
      }

      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError
      if (!authData?.user) throw new Error('Inicia sesión para consultar las compras pendientes.')

      const [eventsResult, accountsResult, categoriesResult] = await Promise.all([
        supabase
          .from('notification_capture_events')
          .select('id, source_app, pair_key, notification_title, parsed_merchant, parsed_amount, currency_code, category_id, category_suggestion, account_label, payment_channel, card_last4, occurred_at, status')
          .in('status', ['paired', 'needs_review'])
          .order('occurred_at', { ascending: false })
          .limit(200),
        supabase
          .from('accounts')
          .select('id, name, currency_code')
          .eq('user_id', authData.user.id)
          .order('name', { ascending: true }),
        supabase
          .from('categories')
          .select('id, name')
          .eq('user_id', authData.user.id)
          .eq('is_active', true)
          .in('direction', ['expense', 'both'])
          .order('name', { ascending: true }),
      ])
      if (eventsResult.error) throw eventsResult.error
      if (accountsResult.error) throw accountsResult.error
      if (categoriesResult.error) throw categoriesResult.error
      setRemoteEvents(Array.isArray(eventsResult.data) ? eventsResult.data : [])
      setAccounts((accountsResult.data || []).filter((account) => String(account.currency_code || 'EUR').toUpperCase() === 'EUR'))
      setCategories(categoriesResult.data || [])
    } catch (loadError) {
      setError(loadError?.message || 'No se pudieron consultar las capturas.')
    } finally {
      setLoading(false)
    }
  }, [isNative])

  useEffect(() => {
    let active = true
    let listenerHandle = null
    const refresh = () => {
      if (active) void loadCaptures(false)
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh()
    }

    void loadCaptures()
    if (isNative) {
      listenForCaptureChanges(refresh)
        .then((handle) => {
          if (active) listenerHandle = handle
          else handle.remove()
        })
        .catch(() => {})
    }

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

  const syncNow = async () => {
    setSyncing(true)
    setError('')
    setNotice('')
    try {
      const localState = await getLocalCaptureState()
      setPermissionEnabled(Boolean(localState.permissionEnabled))
      const captures = Array.isArray(localState.captures) ? localState.captures : []
      setLocalCaptures(captures)

      if (!localState.permissionEnabled) {
        throw new Error('Activa primero el acceso a notificaciones de Finanzas en Android.')
      }
      if (captures.length === 0) {
        setNotice('No hay nuevas capturas locales para sincronizar.')
        await loadCaptures(false)
        return
      }

      const result = await syncLocalCaptures(captures)
      await loadCaptures(false)
      setNotice(`Sincronización completada: ${result.autoPosted || 0} gastos registrados automáticamente y ${result.pendingReview || 0} compras pendientes de revisión.`)
    } catch (syncError) {
      setError(syncError?.message || 'No se pudieron sincronizar las capturas.')
    } finally {
      setSyncing(false)
    }
  }

  const registerPendingPurchase = async (item) => {
    const accountId = accountSelections[item.id] || accounts.find((account) =>
      item.accountLabel && account.name.trim().toLocaleLowerCase('es') === item.accountLabel.trim().toLocaleLowerCase('es')
    )?.id || ''
    const categoryId = categorySelections[item.id] || categories.find((category) =>
      item.categorySuggestion && category.name.trim().toLocaleLowerCase('es') === item.categorySuggestion.trim().toLocaleLowerCase('es')
    )?.id || ''

    if (!accountId || !accounts.some((account) => account.id === accountId)) {
      setError('Selecciona la cuenta donde se realizó el cargo.')
      return
    }
    if (!categoryId || !categories.some((category) => category.id === categoryId)) {
      setError('Selecciona una categoría para registrar el gasto.')
      return
    }

    setSavingReviewId(item.id)
    setError('')
    setNotice('')
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (authError || !authData?.user) throw new Error('Tu sesión ha caducado. Inicia sesión de nuevo.')
      const userId = authData.user.id
      const idempotencyKey = item.eventIds?.[0]
      if (!idempotencyKey) throw new Error('No se encontró el identificador de esta compra.')

      let transaction
      const { data: existing, error: existingError } = await supabase
        .from('transactions')
        .select('id')
        .eq('user_id', userId)
        .eq('idempotency_key', idempotencyKey)
        .eq('kind', 'expense')
        .maybeSingle()
      if (existingError) throw existingError
      transaction = existing
      if (!transaction?.id) {
        const occurredOn = new Intl.DateTimeFormat('sv-SE', {
          timeZone: 'Europe/Madrid',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date(item.occurredAt))
        const { data: inserted, error: insertError } = await supabase
          .from('transactions')
          .insert({
            user_id: userId,
            account_id: accountId,
            category_id: categoryId,
            kind: 'expense',
            status: 'posted',
            amount: Math.round((item.amount + Number.EPSILON) * 100) / 100,
            occurred_on: occurredOn,
            description: item.merchant,
            payment_method: 'Tarjeta',
            idempotency_key: idempotencyKey,
          })
          .select('id')
          .single()
        if (insertError) throw insertError
        transaction = inserted
      }

      const { error: updateError } = await supabase
        .from('notification_capture_events')
        .update({
          status: 'posted',
          matched_transaction_id: transaction.id,
          account_label: accounts.find((account) => account.id === accountId)?.name || null,
          category_id: categoryId,
        })
        .eq('user_id', userId)
        .in('id', item.eventIds)
      if (updateError) throw updateError

      setNotice(`Gasto de ${formatAmount(item.amount, item.currencyCode)} registrado en ${accounts.find((account) => account.id === accountId)?.name || 'la cuenta seleccionada'}.`)
      await loadCaptures(false)
    } catch (saveError) {
      setError(saveError?.message || 'No se pudo registrar esta compra.')
    } finally {
      setSavingReviewId(null)
    }
  }

  const ignorePendingPurchase = async (item) => {
    setSavingReviewId(item.id)
    setError('')
    setNotice('')
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (authError || !authData?.user) throw new Error('Tu sesión ha caducado. Inicia sesión de nuevo.')
      const { error: updateError } = await supabase
        .from('notification_capture_events')
        .update({ status: 'ignored' })
        .eq('user_id', authData.user.id)
        .in('id', item.eventIds)
      if (updateError) throw updateError
      setNotice('Compra descartada de la bandeja de revisión.')
      await loadCaptures(false)
    } catch (ignoreError) {
      setError(ignoreError?.message || 'No se pudo descartar la compra.')
    } finally {
      setSavingReviewId(null)
    }
  }

  return (
    <section className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">Automatización</p>
          <h1 className="mt-2 text-2xl font-bold text-white">Compras pendientes de revisión</h1>
          <p className="mt-1 text-sm text-slate-400">Solo aparecen las compras que Finanzas no pudo registrar con suficiente seguridad.</p>
        </div>
        <button
          type="button"
          onClick={() => loadCaptures()}
          disabled={loading || syncing}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
        >
          <RefreshCw className={'h-4 w-4 ' + (loading ? 'animate-spin' : '')} />
          Actualizar
        </button>
      </div>

      {error && <p role="alert" className="rounded-xl border border-rose-800/60 bg-rose-950/30 p-3 text-sm text-rose-200">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-800/60 bg-emerald-950/30 p-3 text-sm text-emerald-200">{notice}</p>}

      {isNative ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-emerald-500/10 p-3 text-emerald-300">
                <BellRing className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-semibold text-white">Acceso a notificaciones</h2>
                <p className="mt-1 text-xs text-slate-400">Finanzas procesa avisos compatibles de Revolut, BBVA y Google Wallet. Las demás aplicaciones se ignoran.</p>
              </div>
            </div>
            <span className={'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ' + (permissionEnabled ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300')}>
              {permissionEnabled ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
              {permissionEnabled ? 'Acceso activado' : 'Permiso pendiente'}
            </span>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openSettings}
              className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-800"
            >
              Ajustes de notificaciones
            </button>
            <button
              type="button"
              onClick={syncNow}
              disabled={syncing || loading || !permissionEnabled}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {syncing ? 'Sincronizando…' : 'Sincronizar ahora'}
            </button>
            <span className="text-xs text-slate-500">{localCaptures.length} capturas guardadas cifradas en este móvil</span>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-start gap-3">
            <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-sky-300" />
            <div>
              <h2 className="text-sm font-semibold text-white">Capturas desde tu móvil Android</h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                Esta pantalla muestra las compras que ya se han sincronizado desde la APK. Para capturar nuevos pagos,
                el acceso a notificaciones debe estar activado en la aplicación Finanzas de tu POCO.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Bandeja de revisión</h2>
            <p className="mt-1 text-xs text-slate-400">Una compra aparece una sola vez aunque llegue por el banco y por Google Wallet.</p>
          </div>
          <span className="rounded-full bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300">
            {reviewItems.length} pendientes
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" /> Consultando capturas…
          </div>
        ) : reviewItems.length === 0 ? (
          <div className="py-12 text-center">
            <Smartphone className="mx-auto h-8 w-8 text-slate-600" />
            <p className="mt-3 text-sm text-slate-300">Todavía no hay compras pendientes de revisión.</p>
            <p className="mt-1 text-xs text-slate-500">Los pagos identificados se registran solos. Aquí solo verás los casos que necesitan tu ayuda.</p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {reviewItems.map((item) => (
              <article key={item.id} className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-white">{item.merchant}</h3>
                    <p className="mt-1 text-xs text-slate-500">{formatDate(item.occurredAt)}</p>
                  </div>
                  <span className={'rounded-full px-2.5 py-1 text-[11px] font-semibold ' + (item.isPaired ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300')}>
                    {item.isPaired ? 'Avisos unidos' : 'Pendiente de revisión'}
                  </span>
                </div>
                <p className="mt-3 text-2xl font-bold text-emerald-300">{formatAmount(item.amount, item.currencyCode)}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {item.sources.map((source) => (
                    <span key={source} className="rounded-md bg-slate-800 px-2 py-1 text-[11px] text-slate-300">
                      {SOURCE_LABELS[source] || source}
                    </span>
                  ))}
                  {item.categorySuggestion && (
                    <span className="rounded-md bg-sky-500/10 px-2 py-1 text-[11px] text-sky-300">
                      Sugerencia: {item.categorySuggestion}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {[item.accountLabel, item.cardLast4 ? 'Tarjeta ··' + item.cardLast4 : null].filter(Boolean).join(' · ')}
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-medium text-slate-300">Cuenta del cargo
                    <select
                      value={accountSelections[item.id] ?? accounts.find((account) => item.accountLabel && account.name.trim().toLocaleLowerCase('es') === item.accountLabel.trim().toLocaleLowerCase('es'))?.id ?? ''}
                      onChange={(event) => setAccountSelections((current) => ({ ...current, [item.id]: event.target.value }))}
                      className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white"
                    >
                      <option value="">Selecciona una cuenta</option>
                      {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                    </select>
                  </label>
                  <label className="text-xs font-medium text-slate-300">Categoría del gasto
                    <select
                      value={categorySelections[item.id] ?? categories.find((category) => item.categorySuggestion && category.name.trim().toLocaleLowerCase('es') === item.categorySuggestion.trim().toLocaleLowerCase('es'))?.id ?? ''}
                      onChange={(event) => setCategorySelections((current) => ({ ...current, [item.id]: event.target.value }))}
                      className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white"
                    >
                      <option value="">Selecciona una categoría</option>
                      {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                    </select>
                  </label>
                </div>
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <button type="button" onClick={() => ignorePendingPurchase(item)} disabled={savingReviewId === item.id} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-50">Descartar</button>
                  <button type="button" onClick={() => registerPendingPurchase(item)} disabled={savingReviewId === item.id || accounts.length === 0 || categories.length === 0} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">{savingReviewId === item.id ? 'Guardando…' : 'Registrar gasto'}</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
          <div>
            <h2 className="text-sm font-semibold text-white">Privacidad y seguridad</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              Solo se sincronizan el comercio, importe, fecha, banco identificado, últimos cuatro dígitos de la
              tarjeta y categoría sugerida. No se envía el texto completo de la notificación. Cuando banco y categoría
              coinciden con datos fiables, Finanzas registra automáticamente un único gasto; los casos ambiguos
              permanecen pendientes para que elijas la cuenta y categoría. Todo se guarda bajo tu sesión y RLS.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
