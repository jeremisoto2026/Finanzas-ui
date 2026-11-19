import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BellRing,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Upload,
  Link2,
  Plus,
  Trash2,
} from 'lucide-react'
import {
  getLocalCaptureState,
  isFinanzasAndroid,
  listenForCaptureChanges,
  openNotificationAccessSettings,
  syncLocalCaptures,
} from '@/lib/native-captures'
import { supabase } from '@/lib/supabase'
import { getAccountMappingSuggestion, getAccountOptionLabel, getBankSourceLabel, isExactAccountNameMatch } from '@/lib/account-notification-mapping'

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
        accountId: items.find((item) => item.account_id)?.account_id || null,
        merchant: first.parsed_merchant || first.notification_title || 'Comercio no identificado',
        amount: Number(first.parsed_amount || 0),
        currencyCode: String(first.currency_code || 'EUR').trim(),
        occurredAt: first.occurred_at,
        sources,
        categorySuggestion: first.category_suggestion || null,
        eventIds: items.map((item) => item.id),
        accountLabel: items.find((item) => item.account_label)?.account_label || null,
        paymentChannel: first.payment_channel || null,
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
  const [accountMappings, setAccountMappings] = useState([])
  const [categories, setCategories] = useState([])
  const [mappingSource, setMappingSource] = useState('revolut')
  const [mappingAccountId, setMappingAccountId] = useState('')
  const [mappingSelectionTouched, setMappingSelectionTouched] = useState(false)
  const [mappingFeedback, setMappingFeedback] = useState('')
  const [savingMapping, setSavingMapping] = useState(false)
  const autoSaveAttemptRef = useRef('')
  const mappingSourceLabel = getBankSourceLabel(mappingSource, SOURCE_LABELS)
  const availableBankSources = useMemo(() => {
    const sources = new Set(['revolut', 'bbva'])
    for (const mapping of accountMappings) {
      if (mapping.source_app && mapping.source_app !== 'google_wallet') sources.add(mapping.source_app)
    }
    for (const event of remoteEvents) {
      if (event.source_app && event.source_app !== 'google_wallet') sources.add(event.source_app)
    }
    return [...sources].sort((a, b) =>
      getBankSourceLabel(a, SOURCE_LABELS).localeCompare(getBankSourceLabel(b, SOURCE_LABELS), 'es')
    )
  }, [accountMappings, remoteEvents])
  const [accountSelections, setAccountSelections] = useState({})
  const [categorySelections, setCategorySelections] = useState({})
  const [savingReviewId, setSavingReviewId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const reviewItems = useMemo(() => groupRemoteEvents(remoteEvents), [remoteEvents])

  const mappingSuggestion = useMemo(
    () => getAccountMappingSuggestion(
      accounts,
      accountMappings,
      mappingSource,
      mappingSourceLabel,
    ),
    [accounts, accountMappings, mappingSource, mappingSourceLabel],
  )
  const currentSourceMapping = accountMappings.find((mapping) => mapping.source_app === mappingSource)
  const mappingAlreadySaved = Boolean(
    currentSourceMapping && currentSourceMapping.account_id === mappingAccountId,
  )

  useEffect(() => {
    if (mappingSelectionTouched) return
    setMappingAccountId(mappingSuggestion.accountId || '')
  }, [mappingSuggestion, mappingSelectionTouched])

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

      const [eventsResult, accountsResult, categoriesResult, mappingsResult] = await Promise.all([
        supabase
          .from('notification_capture_events')
          .select('id, source_app, pair_key, notification_title, parsed_merchant, parsed_amount, currency_code, category_id, category_suggestion, account_label, account_id, payment_channel, occurred_at, status')
          .in('status', ['paired', 'needs_review'])
          .order('occurred_at', { ascending: false })
          .limit(200),
        supabase
          .from('accounts')
          .select('id, name, institution, currency_code, is_active')
          .eq('user_id', authData.user.id)
          .eq('is_active', true)
          .order('name', { ascending: true }),
        supabase
          .from('categories')
          .select('id, name')
          .eq('user_id', authData.user.id)
          .eq('is_active', true)
          .in('direction', ['expense', 'both'])
          .order('name', { ascending: true }),
        supabase
          .from('account_notification_sources')
          .select('id, source_app, account_id, is_active')
          .eq('user_id', authData.user.id)
          .eq('is_active', true)
          .order('source_app', { ascending: true }),
      ])
      if (eventsResult.error) throw eventsResult.error
      if (accountsResult.error) throw accountsResult.error
      if (categoriesResult.error) throw categoriesResult.error
      if (mappingsResult.error) throw mappingsResult.error
      setRemoteEvents(Array.isArray(eventsResult.data) ? eventsResult.data : [])
      setAccounts((accountsResult.data || []).filter((account) => String(account.currency_code || 'EUR').trim().toUpperCase() === 'EUR'))
      setAccountMappings(mappingsResult.data || [])
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

  const persistAccountMapping = useCallback(async ({
    sourceApp = mappingSource,
    accountId = mappingAccountId,
    automatic = false,
    selectionChange = false,
  } = {}) => {
    const account = accounts.find((item) => item.id === accountId)
    if (!account) {
      setError('Selecciona una cuenta activa para vincular con la aplicación bancaria.')
      setMappingFeedback('')
      return false
    }

    const existingMapping = accountMappings.find((item) =>
      item.source_app === sourceApp &&
      item.account_id === accountId &&
      item.is_active !== false
    )
    if (existingMapping) {
      setError('')
      setMappingFeedback(`Vinculada con tu cuenta ${account.name}.`)
      return true
    }

    setSavingMapping(true)
    setError('')
    setMappingFeedback('Guardando la vinculación…')
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (authError || !authData?.user) throw new Error('Tu sesión ha caducado. Inicia sesión de nuevo.')

      const { data: savedMapping, error: saveError } = await supabase
        .from('account_notification_sources')
        .upsert({
          user_id: authData.user.id,
          source_app: sourceApp,
          account_id: accountId,
          is_active: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,source_app' })
        .select('id, source_app, account_id, is_active')
        .single()
      if (saveError) throw saveError

      setAccountMappings((current) => [
        ...current.filter((item) => item.source_app !== sourceApp),
        savedMapping,
      ])
      setMappingFeedback(automatic
        ? `Vinculada automáticamente con tu cuenta ${account.name}.`
        : selectionChange
          ? `Cambio guardado automáticamente: ${account.name}.`
          : `Vinculación guardada: ${account.name}.`)
      setNotice('')
      return true
    } catch (mappingError) {
      setMappingFeedback('No se pudo guardar automáticamente. Puedes reintentarlo con el botón.')
      setError(mappingError?.message || 'No se pudo guardar la vinculación bancaria.')
      return false
    } finally {
      setSavingMapping(false)
    }
  }, [accounts, accountMappings, mappingAccountId, mappingSource])

  const saveAccountMapping = () => persistAccountMapping({
    sourceApp: mappingSource,
    accountId: mappingAccountId,
    automatic: false,
  })

  useEffect(() => {
    if (mappingSelectionTouched || mappingSuggestion.reason !== 'matching' || !mappingSuggestion.accountId) return

    const suggestedAccount = accounts.find((account) => account.id === mappingSuggestion.accountId)
    const sourceLabel = mappingSourceLabel
    if (!isExactAccountNameMatch(suggestedAccount, sourceLabel)) return
    if (mappingAccountId !== mappingSuggestion.accountId || mappingAlreadySaved) return

    const attemptKey = `${mappingSource}:${mappingSuggestion.accountId}`
    if (autoSaveAttemptRef.current === attemptKey) return
    autoSaveAttemptRef.current = attemptKey

    void persistAccountMapping({
      sourceApp: mappingSource,
      accountId: mappingSuggestion.accountId,
      automatic: true,
    })
  }, [
    accounts,
    mappingAccountId,
    mappingAlreadySaved,
    mappingSelectionTouched,
    mappingSource,
    mappingSourceLabel,
    mappingSuggestion,
    persistAccountMapping,
  ])

  const deactivateAccountMapping = async (mappingId) => {
    setSavingMapping(true)
    setError('')
    setNotice('')
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (authError || !authData?.user) throw new Error('Tu sesión ha caducado. Inicia sesión de nuevo.')
      const { error: updateError } = await supabase
        .from('account_notification_sources')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', mappingId)
        .eq('user_id', authData.user.id)
      if (updateError) throw updateError
      setNotice('Vinculación desactivada. No se borró el historial de compras.')
      await loadCaptures(false)
    } catch (mappingError) {
      setError(mappingError?.message || 'No se pudo desactivar la vinculación.')
    } finally {
      setSavingMapping(false)
    }
  }

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
    const accountId = accountSelections[item.id] || item.accountId || ''
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
      // The review group id is the same pair_key used by the sync function.
      // This avoids a second transaction if the bank alert arrives after manual review.
      const idempotencyKey = item.id || item.eventIds?.[0]
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
          account_id: accountId,
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
        <div className="flex items-start gap-3">
          <Link2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
          <div>
            <h2 className="text-lg font-semibold text-white">Vincular bancos con tus cuentas</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              Elige la aplicación bancaria y la cuenta de Finanzas donde deben registrarse sus movimientos.
              Android identifica automáticamente la app que envía cada aviso. No solicitamos ni guardamos datos de tarjetas bancarias. Cada aplicación bancaria reconocida puede vincularse con estas mismas reglas automáticas.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-slate-300">Aplicación del banco
            <select
              value={mappingSource}
              onChange={(event) => {
                autoSaveAttemptRef.current = ''
                setMappingSelectionTouched(false)
                setMappingFeedback('')
                setMappingSource(event.target.value)
              }}
              disabled={savingMapping}
              className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white"
            >
              {availableBankSources.map((sourceApp) => (
                <option key={sourceApp} value={sourceApp}>
                  {getBankSourceLabel(sourceApp, SOURCE_LABELS)}
                </option>
              ))}
            </select>
          </label>
          <div>
            <span className="text-xs font-medium text-slate-300">Cuenta que recibe el cargo</span>
            {accounts.length === 0 ? (
              <div className="mt-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-400">
                Crea primero una cuenta activa en Finanzas.
              </div>
            ) : accounts.length === 1 ? (
              <div className="mt-1.5 rounded-lg border border-emerald-700/50 bg-emerald-950/20 px-3 py-2.5" aria-live="polite">
                <p className="text-sm font-medium text-white">
                  {getAccountOptionLabel(accounts[0], mappingSourceLabel)}
                </p>
                <p className="mt-0.5 text-[11px] text-emerald-300">
                  Única cuenta activa: se selecciona automáticamente.
                </p>
              </div>
            ) : (
              <select
                value={mappingAccountId}
                onChange={(event) => {
                  const accountId = event.target.value
                  autoSaveAttemptRef.current = ''
                  setMappingSelectionTouched(true)
                  setMappingAccountId(accountId)
                  setMappingFeedback('')
                  if (accountId) {
                    void persistAccountMapping({
                      sourceApp: mappingSource,
                      accountId,
                      automatic: false,
                      selectionChange: true,
                    })
                  }
                }}
                disabled={savingMapping}
                className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white"
              >
                <option value="">Selecciona una cuenta</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {getAccountOptionLabel(account, mappingSourceLabel)}
                  </option>
                ))}
              </select>
            )}
            {mappingSuggestion.reason === 'matching' &&
              mappingAccountId === mappingSuggestion.accountId && (
                <p className="mt-1.5 text-[11px] leading-relaxed text-emerald-300">
                  Hemos preseleccionado esta cuenta porque su nombre o banco coincide con {SOURCE_LABELS[mappingSource]}. Puedes cambiarla.
                </p>
              )}
            {mappingSuggestion.reason === 'existing' && !mappingFeedback && (
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
                Esta aplicación ya está vinculada a la cuenta seleccionada.
              </p>
            )}
            {mappingFeedback && (
              <p
                role="status"
                aria-live="polite"
                className={`mt-1.5 text-[11px] leading-relaxed ${mappingFeedback.startsWith('No se pudo') ? 'text-amber-300' : 'text-emerald-300'}`}
              >
                {savingMapping && <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />}
                {mappingFeedback}
              </p>
            )}
          </div>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-slate-400">
          Si el nombre de la cuenta coincide con la aplicación (sin distinguir mayúsculas ni espacios repetidos), la vinculación se guarda automáticamente. Si eliges otra cuenta manualmente, el cambio también se guarda al instante. El botón queda como respaldo.
          Los avisos del banco se registran directamente en esta cuenta. Si también llega Google Wallet,
          unimos ambos avisos por importe exacto, comercio y hora (hasta 3 minutos) para evitar duplicados.
          Si solo llega Wallet y tienes una única app bancaria vinculada, usaremos esa cuenta; si hay varias,
          dejaremos la compra para revisión para no asignarla incorrectamente.
        </p>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={saveAccountMapping}
            disabled={savingMapping || accounts.length === 0 || !mappingAccountId || mappingAlreadySaved}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {savingMapping ? <Loader2 className="h-4 w-4 animate-spin" /> : mappingAlreadySaved ? <CheckCircle2 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {mappingAlreadySaved ? 'Vinculación guardada' : currentSourceMapping ? 'Actualizar vinculación' : 'Guardar vinculación'}
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {accountMappings.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-700 p-3 text-xs text-slate-400">
              Todavía no has vinculado ninguna aplicación bancaria. Sin esta configuración, las compras quedarán para revisión manual.
            </p>
          ) : accountMappings.map((mapping) => {
            const account = accounts.find((item) => item.id === mapping.account_id)
            return (
              <div key={mapping.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">
                    {getBankSourceLabel(mapping.source_app, SOURCE_LABELS)}
                     · Cuenta automática
                  </p>
                  <p className="text-xs text-slate-400">{account?.name || 'Cuenta no disponible'}</p>
                </div>
                <button
                  type="button"
                  onClick={() => deactivateAccountMapping(mapping.id)}
                  disabled={savingMapping}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Desvincular
                </button>
              </div>
            )
          })}
        </div>
      </div>

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
                  {item.accountLabel || 'Origen detectado automáticamente'}
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-medium text-slate-300">Cuenta del cargo
                    <select
                      value={accountSelections[item.id] ?? item.accountId ?? ''}
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
              Solo se sincronizan el nombre de la aplicación emisora, comercio, importe, fecha y categoría sugerida.
              No se envía el texto completo del aviso ni se solicitan o almacenan datos de tarjetas bancarias.
              Finanzas usa tu vinculación de app a cuenta y empareja Wallet por importe, comercio y hora para evitar duplicados.
              Los casos ambiguos quedan pendientes de revisión. Todo se guarda bajo tu sesión y RLS.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
