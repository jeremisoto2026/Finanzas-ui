import { useEffect, useMemo, useState } from 'react'
import { merchantKeyFromName } from '@/lib/merchant-classifier'
import { getLocalCaptureState, isFinanzasAndroid, openNotificationAccessSettings } from '@/lib/native-captures'
import {
  AlertCircle,
  BellRing,
  CheckCircle2,
  ChevronRight,
  Globe2,
  Info,
  Loader2,
  MapPin,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Store,
  Trash2,
  WalletCards,
} from 'lucide-react'

const LOCAL_RULES_KEY = 'finanzas-ui:merchant-rules:v1'
const LOCAL_LOOKUP_CACHE_KEY = 'finanzas-ui:merchant-lookups:v1'
const LOCAL_CACHE_TTL = 30 * 24 * 60 * 60 * 1000

function readLocalLookupCache(key) {
  try {
    const cache = JSON.parse(window.localStorage.getItem(LOCAL_LOOKUP_CACHE_KEY) || '{}')
    const entry = cache?.[key]
    if (!entry || Date.now() - Number(entry.savedAt || 0) > LOCAL_CACHE_TTL) return null
    return entry.data || null
  } catch {
    return null
  }
}

function writeLocalLookupCache(key, data) {
  try {
    const cache = JSON.parse(window.localStorage.getItem(LOCAL_LOOKUP_CACHE_KEY) || '{}')
    cache[key] = { savedAt: Date.now(), data }
    const entries = Object.entries(cache)
      .sort((a, b) => Number(b[1]?.savedAt || 0) - Number(a[1]?.savedAt || 0))
      .slice(0, 100)
    window.localStorage.setItem(LOCAL_LOOKUP_CACHE_KEY, JSON.stringify(Object.fromEntries(entries)))
  } catch (error) {
    console.warn('No se pudo guardar la caché de comercios:', error)
  }
}

function readLocalRules() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LOCAL_RULES_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeLocalRules(rules) {
  try {
    window.localStorage.setItem(LOCAL_RULES_KEY, JSON.stringify(rules))
  } catch (error) {
    console.warn('No se pudieron guardar las reglas locales:', error)
  }
}

function confidenceLabel(value) {
  const confidence = Number(value || 0)
  if (confidence >= 0.9) return 'Alta'
  if (confidence >= 0.7) return 'Media'
  return 'Baja'
}

export default function Automatizaciones({ onNavigate }) {
  const [categories, setCategories] = useState([])
  const [rules, setRules] = useState([])
  const [merchant, setMerchant] = useState('')
  const [lookup, setLookup] = useState(null)
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedResultIndex, setSelectedResultIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingRuleId, setDeletingRuleId] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [cloudRulesAvailable, setCloudRulesAvailable] = useState(false)
  const [notificationInboxAvailable, setNotificationInboxAvailable] = useState(false)
  const [captureEvents, setCaptureEvents] = useState([])
  const [notificationPermissionEnabled, setNotificationPermissionEnabled] = useState(false)
  const [localCaptureCount, setLocalCaptureCount] = useState(0)
  const [openingNotificationSettings, setOpeningNotificationSettings] = useState(false)
  const isNativeAndroid = isFinanzasAndroid()
  const pendingPurchaseCount = useMemo(() => {
    const keys = new Set(captureEvents
      .filter((event) => ['needs_review', 'paired'].includes(event.status))
      .map((event) => event.pairKey || event.pair_key || event.id))
    return keys.size
  }, [captureEvents])

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      setRules(readLocalRules())

      try {
        const [categoriesResponse, rulesResponse, capturesResponse] = await Promise.all([
          fetch('/api/gastos?resource=categories', { cache: 'no-store' }),
          fetch('/api/gastos?resource=merchant-rules', { cache: 'no-store' }),
          fetch('/api/gastos?resource=notification-captures', { cache: 'no-store' }),
        ])

        if (!categoriesResponse.ok) throw new Error('No se pudieron cargar tus categorías.')
        const categoryRows = await categoriesResponse.json()
        if (!active) return
        const availableCategories = Array.isArray(categoryRows) ? categoryRows : []
        setCategories(availableCategories)
        setSelectedCategory(availableCategories.includes('Alimentación') ? 'Alimentación' : availableCategories[0] || '')

        if (rulesResponse.ok) {
          const data = await rulesResponse.json()
          if (!active) return
          setCloudRulesAvailable(Boolean(data.available))
          if (data.available && Array.isArray(data.rules)) {
            const local = readLocalRules()
            const combined = [...data.rules]
            for (const rule of local) {
              if (!combined.some((item) => item.merchantKey === rule.merchantKey)) combined.push(rule)
            }
            setRules(combined)
          }
        }

        if (capturesResponse.ok) {
          const captureData = await capturesResponse.json()
          if (active) {
            setNotificationInboxAvailable(Boolean(captureData.available))
            setCaptureEvents(Array.isArray(captureData.events) ? captureData.events : [])
          }
        }
      } catch (loadError) {
        if (active) setError(loadError.message || 'No se pudo preparar la automatización.')
      } finally {
        if (active) setLoading(false)
      }
    }

    if (isNativeAndroid) {
      getLocalCaptureState()
        .then((state) => {
          if (!active) return
          setNotificationPermissionEnabled(Boolean(state?.permissionEnabled))
          setLocalCaptureCount(Array.isArray(state?.captures) ? state.captures.length : 0)
        })
        .catch((captureError) => console.warn('No se pudo consultar el lector de pagos:', captureError?.message || captureError))
    }

    load()
    return () => { active = false }
  }, [isNativeAndroid])

  async function openAndroidNotificationSettings() {
    setOpeningNotificationSettings(true)
    setError('')
    try {
      await openNotificationAccessSettings()
    } catch (settingsError) {
      setError(settingsError?.message || 'No se pudieron abrir los ajustes de Android.')
    } finally {
      setOpeningNotificationSettings(false)
    }
  }

  async function searchMerchant(event) {
    event.preventDefault()
    const value = merchant.trim()
    const merchantKey = merchantKeyFromName(value)
    if (value.length < 2 || !merchantKey || searching) return

    setSearching(true)
    setError('')
    setNotice('')
    setLookup(null)
    setSelectedResultIndex(0)

    try {
      const savedRule = rules.find((rule) => rule.merchantKey === merchantKey)
      if (savedRule) {
        const data = {
          merchantName: value,
          source: 'saved-rule',
          suggestion: {
            name: savedRule.merchantName,
            category: savedRule.category,
            confidence: 1,
            requiresConfirmation: false,
            reason: 'Este comercio ya tiene una categoría que confirmaste anteriormente.',
          },
          results: [],
          cached: true,
          attribution: '© OpenStreetMap contributors',
          attributionUrl: 'https://www.openstreetmap.org/copyright',
        }
        setLookup(data)
        setSelectedCategory(savedRule.category)
        setNotice('Este comercio ya tiene una regla que confirmaste anteriormente.')
        return
      }

      const localCached = readLocalLookupCache(merchantKey)
      if (localCached) {
        const data = { ...localCached, cached: true }
        setLookup(data)
        const cachedCategory = data.suggestion?.category || data.results?.[0]?.category
        if (cachedCategory && categories.includes(cachedCategory)) setSelectedCategory(cachedCategory)
        else if (categories.includes('Otros')) setSelectedCategory('Otros')
        setNotice('Resultado recuperado de la caché local. No se ha repetido la búsqueda en Internet.')
        return
      }

      const response = await fetch('/api/gastos?resource=merchant-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchant: value }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'No se pudo buscar el establecimiento.')

      setLookup(data)
      const suggested = data.suggestion?.category || data.results?.[0]?.category
      if (suggested && categories.includes(suggested)) setSelectedCategory(suggested)
      else if (categories.includes('Otros')) setSelectedCategory('Otros')

      if (data.source !== 'saved-rule' && !data.lookupWarning) {
        writeLocalLookupCache(merchantKey, data)
      }

      if (data.source === 'saved-rule') {
        setNotice('Este comercio ya tiene una regla que confirmaste anteriormente.')
      } else if (data.lookupWarning) {
        setNotice(data.lookupWarning)
      } else if (data.cached) {
        setNotice('Resultado recuperado de la caché del servidor para evitar repetir una consulta externa.')
      }
    } catch (searchError) {
      setError(searchError.message || 'No se pudo consultar el establecimiento.')
    } finally {
      setSearching(false)
    }
  }

  async function saveRule() {
    if (!merchant.trim() || !selectedCategory || saving) return

    setSaving(true)
    setError('')
    setNotice('')

    const key = merchantKeyFromName(merchant.trim())

    const localRule = {
      id: `local-${key}`,
      merchantName: merchant.trim(),
      merchantKey: key,
      category: selectedCategory,
      confidence: 1,
      source: 'user',
      local: true,
      createdAt: new Date().toISOString(),
    }

    try {
      const response = await fetch('/api/gastos?resource=merchant-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchantName: merchant.trim(), category: selectedCategory }),
      })
      const data = await response.json()

      if (response.ok && data.available && data.rule) {
        const next = [data.rule, ...rules.filter((rule) => rule.merchantKey !== data.rule.merchantKey)]
        setRules(next)
        setCloudRulesAvailable(true)
        setNotice('Regla guardada en tu cuenta. La próxima compra reconocida usará esta categoría.')
      } else if (data.available === false) {
        const next = [localRule, ...rules.filter((rule) => rule.merchantKey !== key)]
        setRules(next)
        writeLocalRules(next.filter((rule) => rule.local))
        setNotice('Regla guardada en este dispositivo durante la preparación de Preview. Se sincronizará con tu cuenta cuando se active la nueva tabla.')
      } else {
        throw new Error(data.error || 'No se pudo guardar la regla.')
      }
    } catch (saveError) {
      setError(saveError.message || 'No se pudo guardar la regla.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteRule(rule) {
    setDeletingRuleId(rule.id)
    setError('')
    setNotice('')

    try {
      if (rule.local) {
        const next = rules.filter((item) => item.id !== rule.id)
        setRules(next)
        writeLocalRules(next.filter((item) => item.local))
        setNotice('Regla local eliminada.')
        return
      }

      const response = await fetch('/api/gastos?resource=merchant-rules', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rule.id }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'No se pudo eliminar la regla.')
      setRules((current) => current.filter((item) => item.id !== rule.id))
      setNotice('Regla eliminada.')
    } catch (deleteError) {
      setError(deleteError.message || 'No se pudo eliminar la regla.')
    } finally {
      setDeletingRuleId(null)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto flex min-h-72 max-w-5xl items-center justify-center text-sm text-slate-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Preparando automatizaciones…
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <div className="flex items-center gap-2 text-sm text-emerald-300">
          <Sparkles className="h-4 w-4" /> Automatización inteligente
        </div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">Automatizaciones y reglas</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          Finanzas detecta avisos compatibles, identifica el banco y el comercio, y registra automáticamente las compras fiables. Solo te pedirá intervenir cuando no pueda determinar la cuenta o la categoría con seguridad.
        </p>
      </header>

      <section aria-label="Cómo funcionan las automatizaciones" className="grid gap-3 md:grid-cols-3">
        <article className="rounded-2xl border border-slate-800 bg-slate-900/65 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10 text-sky-300">
            <Smartphone className="h-5 w-5" />
          </div>
          <h2 className="mt-3 text-sm font-semibold text-white">1. Captura de avisos</h2>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            El servicio nativo filtra avisos compatibles de Revolut, BBVA y Google Wallet. Guarda únicamente los datos necesarios de forma cifrada y puede seguir capturando con la pantalla de Finanzas cerrada.
          </p>
        </article>

        <article className="rounded-2xl border border-slate-800 bg-slate-900/65 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-300">
            <Store className="h-5 w-5" />
          </div>
          <h2 className="mt-3 text-sm font-semibold text-white">2. Reglas de comercios</h2>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Busca un establecimiento, confirma su categoría y guarda una regla para reutilizarla. Las búsquedas externas solo se realizan cuando pulsas «Buscar comercio».
          </p>
        </article>

        <article className="rounded-2xl border border-slate-800 bg-slate-900/65 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-300">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <h2 className="mt-3 text-sm font-semibold text-white">3. Registro inteligente</h2>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Cuando banco, cuenta y categoría están identificados, Finanzas registra un único gasto. Los casos dudosos quedan pendientes para que selecciones los datos que faltan.
          </p>
        </article>
      </section>

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-rose-900/60 bg-rose-950/30 p-3 text-sm text-rose-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}
      {notice && (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-emerald-900/60 bg-emerald-950/25 p-3 text-sm text-emerald-200">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {notice}
        </div>
      )}

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.8fr)]">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg shadow-black/10">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-sky-500/10 p-2.5 text-sky-300">
              <Store className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-white">Buscador de establecimientos</h2>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                Busca un comercio manualmente en OpenStreetMap. No hacemos búsquedas automáticas en cada pago ni autocompletado.
              </p>
            </div>
          </div>

          <form onSubmit={searchMerchant} className="mt-5 flex flex-col gap-2 sm:flex-row">
            <label className="sr-only" htmlFor="merchant-search">Nombre del establecimiento</label>
            <input
              id="merchant-search"
              type="text"
              value={merchant}
              onChange={(event) => setMerchant(event.target.value)}
              placeholder="Ejemplo: Mercadona, Consum, Farmacia..."
              maxLength={100}
              className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-sky-500"
            />
            <button
              type="submit"
              disabled={searching || merchant.trim().length < 2}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {searching ? 'Buscando…' : 'Buscar comercio'}
            </button>
          </form>

          <div className="mt-3 flex items-start gap-2 text-[11px] leading-5 text-slate-500">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            La búsqueda se ejecuta solo cuando pulsas el botón. Los resultados se guardan en caché para evitar consultas repetidas.
          </div>

          {lookup && (
            <div className="mt-5 space-y-3 border-t border-slate-800 pt-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-white">Resultado de la búsqueda</div>
                {lookup.cached && <span className="rounded-full bg-slate-800 px-2.5 py-1 text-[10px] text-slate-400">En caché</span>}
              </div>

              {lookup.source === 'saved-rule' && (
                <div className="rounded-xl border border-emerald-900/50 bg-emerald-950/20 p-3 text-sm text-emerald-200">
                  Ya existe una regla guardada: <strong>{lookup.suggestion?.category}</strong>.
                </div>
              )}

              {lookup.results?.length > 0 ? (
                <div className="space-y-2">
                  {lookup.results.map((result, index) => (
                    <button
                      key={`${result.osmType || 'item'}-${result.osmId || index}`}
                      type="button"
                      onClick={() => {
                        setSelectedResultIndex(index)
                        if (categories.includes(result.category)) setSelectedCategory(result.category)
                      }}
                      className={`w-full rounded-xl border p-3 text-left transition ${selectedResultIndex === index ? 'border-sky-500/60 bg-sky-500/[0.07]' : 'border-slate-800 bg-slate-950/50 hover:border-slate-700'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium text-slate-100">{result.name}</div>
                          <div className="mt-1 text-xs leading-5 text-slate-500">{result.displayName}</div>
                          <div className="mt-2 text-xs text-slate-300">
                            Categoría sugerida: <strong>{result.category}</strong>
                          </div>
                          <div className="mt-1 text-[11px] text-slate-500">{result.reason}</div>
                        </div>
                        <div className="shrink-0 text-right">
                          <span className={`rounded-full px-2 py-1 text-[10px] ${result.confidence >= 0.85 ? 'bg-emerald-500/10 text-emerald-300' : result.confidence >= 0.7 ? 'bg-amber-500/10 text-amber-300' : 'bg-slate-800 text-slate-400'}`}>
                            Confianza {confidenceLabel(result.confidence)}
                          </span>
                          <div className="mt-2 flex justify-end">
                            {selectedResultIndex === index ? <CheckCircle2 className="h-4 w-4 text-sky-300" /> : <ChevronRight className="h-4 w-4 text-slate-600" />}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : lookup.suggestion ? (
                <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                  <div className="font-medium text-white">{lookup.suggestion.name || merchant}</div>
                  <div className="mt-1 text-sm text-slate-300">Categoría sugerida: <strong>{lookup.suggestion.category}</strong></div>
                  <div className="mt-1 text-xs text-slate-500">{lookup.suggestion.reason}</div>
                </div>
              ) : (
                <div className="rounded-xl border border-amber-900/40 bg-amber-950/20 p-3 text-sm text-amber-200">
                  No encontramos una ficha suficientemente clara. Puedes elegir una categoría manualmente.
                </div>
              )}

              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                <label htmlFor="merchant-category" className="mb-2 block text-xs font-medium text-slate-400">Categoría que guardarás para este comercio</label>
                <select
                  id="merchant-category"
                  value={selectedCategory}
                  onChange={(event) => setSelectedCategory(event.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500"
                >
                  {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
                <button
                  type="button"
                  onClick={saveRule}
                  disabled={saving || !selectedCategory || !merchant.trim()}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {saving ? 'Guardando…' : 'Confirmar y guardar regla'}
                </button>
                <p className="mt-2 text-[11px] leading-5 text-slate-500">
                  La regla se aplicará a futuras compras que coincidan con este comercio. No cambia movimientos anteriores.
                </p>
              </div>

              <div className="flex items-center gap-2 text-[10px] text-slate-500">
                <Globe2 className="h-3.5 w-3.5" />
                Datos de OpenStreetMap · <a className="underline hover:text-slate-300" href={lookup.attributionUrl || 'https://www.openstreetmap.org/copyright'} target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-emerald-500/10 p-2.5 text-emerald-300">
                <WalletCards className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-semibold text-white">Reglas guardadas</h2>
                <p className="mt-0.5 text-xs text-slate-500">Comercios que ya sabrá clasificar</p>
              </div>
            </div>
            <div className="mt-4 flex items-end gap-2">
              <div className="text-3xl font-bold tabular-nums text-white">{rules.length}</div>
              <div className="pb-1 text-xs text-slate-500">reglas</div>
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
              {cloudRulesAvailable
                ? <><CheckCircle2 className="h-4 w-4 text-emerald-400" /> Sincronizadas con tu cuenta</>
                : <><Info className="h-4 w-4 text-amber-400" /> Guardado local mientras se prepara Preview</>}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-violet-500/10 p-2.5 text-violet-300">
                <Smartphone className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 className="font-semibold text-white">Detección en segundo plano</h2>
                <p className="mt-0.5 text-xs text-slate-500">Revolut · BBVA · Google Wallet</p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-3">
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <BellRing className="h-4 w-4 text-slate-400" />
                Permiso de notificaciones
              </div>
              <span className={notificationPermissionEnabled ? "text-xs font-semibold text-emerald-300" : "text-xs font-semibold text-amber-300"}>
                {isNativeAndroid ? (notificationPermissionEnabled ? "Activado" : "Pendiente") : "Solo APK Android"}
              </span>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-400">
              Capturas cifradas en este móvil: {localCaptureCount}. Los avisos de otras aplicaciones se ignoran.
              Una compra solo se registra sola cuando coinciden Google Wallet y el aviso del banco, existe una cuenta vinculada
              y la categoría es fiable. Si falta un aviso o hay ambigüedad, queda pendiente de revisión.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {isNativeAndroid && (
                <button type="button" onClick={openAndroidNotificationSettings} disabled={openingNotificationSettings} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50">
                  {openingNotificationSettings ? "Abriendo ajustes…" : "Permisos Android"}
                </button>
              )}
              <button type="button" onClick={() => onNavigate?.("Compras pendientes")} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500">
                {pendingPurchaseCount > 0 ? `Revisar ${pendingPurchaseCount} compra(s)` : "Ver compras pendientes"}
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-white">Memoria de comercios</h2>
            <p className="mt-1 text-xs text-slate-500">Tus correcciones tienen prioridad sobre una sugerencia externa.</p>
          </div>
          <span className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-[10px] text-slate-400">Categorías actuales</span>
        </div>

        {rules.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed border-slate-700 p-6 text-center">
            <Store className="mx-auto h-7 w-7 text-slate-600" />
            <p className="mt-2 text-sm text-slate-300">Todavía no hay comercios guardados</p>
            <p className="mt-1 text-xs text-slate-500">Puedes probar ahora mismo buscando Mercadona o cualquier otro establecimiento. No necesitas realizar una compra.</p>
          </div>
        ) : (
          <div className="mt-4 divide-y divide-slate-800">
            {rules.map((rule) => (
              <div key={rule.id || rule.merchantKey} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-100">{rule.merchantName}</div>
                  <div className="mt-1 text-xs text-slate-500">{rule.category} · {rule.local ? 'Este dispositivo' : 'Cuenta Finanzas'}</div>
                </div>
                <button
                  type="button"
                  onClick={() => deleteRule(rule)}
                  disabled={deletingRuleId === rule.id}
                  aria-label={`Eliminar regla de ${rule.merchantName}`}
                  className="rounded-lg p-2 text-slate-500 hover:bg-rose-950/40 hover:text-rose-300 disabled:opacity-50"
                >
                  {deletingRuleId === rule.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-800/80 bg-slate-950/50 p-4">
        <div className="flex items-start gap-3">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
          <div>
            <div className="text-xs font-medium text-slate-300">Cómo funciona la clasificación</div>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">
              Primero se comprueban tus reglas confirmadas; después se consulta la ficha del comercio. Si la actividad no coincide con una categoría que ya tienes o la confianza es baja, Finanzas pedirá confirmación. Fuente de datos: OpenStreetMap, con sus límites de uso y atribución.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
