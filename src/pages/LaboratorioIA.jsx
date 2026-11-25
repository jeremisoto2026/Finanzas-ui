import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, ArrowDownCircle, ArrowUpCircle, BrainCircuit, CheckCircle2, Loader2, RotateCcw, ShieldCheck, Sparkles } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const EXAMPLES = [
  { label: 'Nómina recibida', value: 'NÓMINA RECIBIDA 740 €' },
  { label: 'Compra con tarjeta', value: 'PAGO TARJETA - PANADERÍA EL MOLINO 12,50 €' },
  { label: 'Bizum recibido', value: 'BIZUM RECIBIDO DE JUAN 50 €' },
  { label: 'Recibo de electricidad', value: 'RECIBO ELECTRICIDAD 68 €' },
]

const DIRECTION_LABELS = {
  income: 'Ingreso',
  expense: 'Gasto',
  transfer: 'Transferencia entre cuentas',
  unknown: 'Tipo no identificado',
}

function formatAmount(amount) {
  if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) return 'No detectado'
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(amount))
}

export default function LaboratorioIA() {
  const [description, setDescription] = useState('')
  const [categories, setCategories] = useState([])
  const [loadingCategories, setLoadingCategories] = useState(true)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function loadCategories() {
      try {
        const { data: auth } = await supabase.auth.getUser()
        if (!auth?.user) throw new Error('Inicia sesión para utilizar el laboratorio.')
        const { data, error: queryError } = await supabase
          .from('categories')
          .select('name, direction')
          .eq('user_id', auth.user.id)
          .order('name', { ascending: true })
        if (queryError) throw queryError
        if (active) setCategories((data || []).map((item) => ({
          name: String(item.name || '').trim(),
          direction: item.direction || 'both',
        })).filter((item) => item.name))
      } catch (err) {
        if (active) setError(err?.message || 'No se pudieron cargar las categorías.')
      } finally {
        if (active) setLoadingCategories(false)
      }
    }
    void loadCategories()
    return () => { active = false }
  }, [])

  const uniqueCategories = useMemo(() => {
    const seen = new Set()
    return categories.filter((item) => {
      const key = item.name.toLocaleLowerCase('es')
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }).slice(0, 60)
  }, [categories])

  async function runTest(event) {
    event.preventDefault()
    setError('')
    setResult(null)
    const clean = description.trim()
    if (clean.length < 3) {
      setError('Escribe una descripción de al menos 3 caracteres.')
      return
    }
    if (!uniqueCategories.length) {
      setError('No hay categorías disponibles para analizar el movimiento.')
      return
    }
    setLoading(true)
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('finance-ai-lab', {
        body: { description: clean, categories: uniqueCategories },
      })
      if (invokeError) {
        let serverMessage = ''
        try {
          const payload = await invokeError.context?.json?.()
          serverMessage = typeof payload?.error === 'string' ? payload.error : ''
        } catch {
          // Keep the original client error when the response body is unavailable.
        }
        throw new Error(serverMessage || invokeError.message || 'No se pudo conectar con Gemini.')
      }
      if (!data?.ok) throw new Error(data?.error || 'La IA no pudo completar la prueba.')
      setResult(data.result)
    } catch (err) {
      setError(err?.message || 'No se pudo conectar con Gemini.')
    } finally {
      setLoading(false)
    }
  }

  function useExample(example) {
    setDescription(example.value)
    setResult(null)
    setError('')
  }

  const detectedDirection = result?.direction || 'unknown'
  const DirectionIcon = detectedDirection === 'income' ? ArrowUpCircle : ArrowDownCircle

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-400/10 px-3 py-1 text-[11px] font-semibold text-violet-200">
            <Sparkles className="h-3.5 w-3.5" /> Inteligencia artificial · Preview
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Laboratorio de IA</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Escribe un concepto y Gemini intentará identificar por sí solo si es un gasto o un ingreso, su categoría y el importe. El resultado es una sugerencia: no se guarda en tus movimientos.</p>
        </div>
        <div className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-3 py-2 text-xs font-medium text-emerald-200">
          <ShieldCheck className="h-4 w-4" /> Sin acceso a tus saldos
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <form onSubmit={runTest} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-xl shadow-black/10 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-400/10 text-violet-300"><BrainCircuit className="h-5 w-5" /></span>
            <div><h2 className="text-base font-semibold text-white">Nueva prueba</h2><p className="text-xs text-slate-400">Introduce solo un concepto ficticio o anonimizado.</p></div>
          </div>

          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between gap-2">
              <label htmlFor="ai-description" className="text-xs font-semibold text-slate-300">Descripción del movimiento</label>
              <span className="text-[10px] tabular-nums text-slate-500">{description.length}/180</span>
            </div>
            <textarea id="ai-description" value={description} onChange={(event) => { setDescription(event.target.value.slice(0, 180)); setResult(null) }} rows={3} maxLength={180} className="w-full resize-y rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-violet-400/60 focus:ring-2 focus:ring-violet-400/10" placeholder="Ej. NÓMINA RECIBIDA 740 €" />
            <p className="mt-2 text-[11px] text-slate-500">No selecciones ingreso ni gasto: la IA debe deducirlo del texto.</p>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] text-slate-500">{loadingCategories ? 'Cargando tus categorías…' : uniqueCategories.length + ' categorías disponibles'}</p>
            <button type="submit" disabled={loading || loadingCategories || !description.trim()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-violet-950/30 transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50">
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Analizando…</> : <><Sparkles className="h-4 w-4" /> Analizar movimiento</>}
            </button>
          </div>

          {error && <div role="alert" className="mt-4 flex gap-2 rounded-xl border border-rose-400/20 bg-rose-400/5 p-3 text-xs leading-5 text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

          {result && <div className="mt-5 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.06] p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-200"><CheckCircle2 className="h-4 w-4" /> Análisis de Gemini</div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Tipo detectado</p>
                <div className="mt-2 flex items-center gap-2 text-sm font-bold text-white"><DirectionIcon className={'h-4 w-4 ' + (detectedDirection === 'income' ? 'text-emerald-300' : detectedDirection === 'expense' ? 'text-rose-300' : 'text-sky-300')} />{DIRECTION_LABELS[detectedDirection] || DIRECTION_LABELS.unknown}</div>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Categoría</p>
                <p className="mt-2 text-sm font-bold text-white">{result.category || 'Sin categoría clara'}</p>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Importe detectado</p>
                <p className="mt-2 text-sm font-bold text-white">{formatAmount(result.amount)}</p>
              </div>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-300">{result.explanation}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
              <span className="rounded-full border border-slate-700 bg-slate-950/60 px-2.5 py-1 text-slate-300">Confianza orientativa: {Math.round((result.confidence || 0) * 100)}%</span>
              <span className="rounded-full border border-amber-400/20 bg-amber-400/5 px-2.5 py-1 text-amber-200">Siempre requiere revisión</span>
            </div>
          </div>}
        </form>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <h3 className="text-sm font-semibold text-white">Pruebas rápidas</h3>
            <p className="mt-1 text-xs leading-5 text-slate-400">Ejemplos ficticios para comprobar los tres datos que debe detectar.</p>
            <div className="mt-3 space-y-2">
              {EXAMPLES.map((example) => <button key={example.label} type="button" onClick={() => useExample(example)} className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-3 text-left text-xs text-slate-300 transition hover:border-violet-400/30 hover:bg-slate-800/70"><span>{example.label}<span className="mt-1 block text-[10px] text-slate-500">{example.value}</span></span><RotateCcw className="h-3.5 w-3.5 shrink-0 text-slate-500" /></button>)}
            </div>
          </div>
          <div className="rounded-2xl border border-amber-400/15 bg-amber-400/[0.04] p-4">
            <h3 className="text-xs font-semibold text-amber-100">Privacidad y seguridad</h3>
            <ul className="mt-2 space-y-2 text-[11px] leading-5 text-slate-400">
              <li>• Solo se envían a Gemini la descripción escrita y los nombres de categorías permitidas.</li>
              <li>• No se envían fechas, datos de cuentas ni saldos.</li>
              <li>• No registra ni modifica movimientos.</li>
              <li>• La respuesta siempre requiere revisión humana.</li>
              <li>• En el nivel gratuito de Gemini, Google puede usar el contenido para mejorar sus productos.</li>
            </ul>
          </div>
        </aside>
      </section>
    </div>
  )
}
