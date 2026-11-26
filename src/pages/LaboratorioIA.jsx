import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, ArrowDownCircle, ArrowUpCircle, BrainCircuit, CheckCircle2, Loader2, RotateCcw, ShieldCheck, Sparkles } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const EXAMPLES = [
  { label: 'Nómina recibida', value: 'BBVA: Tu nómina de 740,00 EUR ha sido abonada en tu cuenta.' },
  { label: 'Compra con tarjeta', value: 'Revolut: Has realizado un pago con tarjeta de 12,95 EUR en MERCADONA.' },
  { label: 'Transferencia propia', value: 'Revolut: Has recibido 150,00 EUR mediante transferencia desde tu cuenta BBVA.' },
  { label: 'Reembolso', value: 'Revolut: Se ha abonado un reembolso de 32,50 EUR por una compra en MERCADONA.' },
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
  const [autoTesting, setAutoTesting] = useState(false)
  const [autoResults, setAutoResults] = useState([])
  const [autoProgress, setAutoProgress] = useState(0)

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

  const AUTO_TESTS = [
    { label: 'Nómina explícita', description: 'BBVA: Tu nómina de 740,00 EUR ha sido abonada en tu cuenta.', direction: 'income', amount: 740, categoryCandidates: ['Nómina', 'Ingresos laborales'] },
    { label: 'Pago supermercado', description: 'Revolut: Has realizado un pago con tarjeta de 12,95 EUR en MERCADONA.', direction: 'expense', amount: 12.95, categoryCandidates: ['Alimentación'] },
    { label: 'Transferencia recibida de tercero', description: 'BBVA: Has recibido 85,00 EUR de Juan mediante transferencia bancaria.', direction: 'income', amount: 85, categoryMustBeEmpty: true },
    { label: 'Devolución de préstamo', description: 'Revolut: Juan te ha devuelto 85,00 EUR de un préstamo anterior.', direction: 'income', amount: 85, categoryCandidates: ['Devolución de préstamo', 'Devoluciones', 'Reembolsos'] },
    { label: 'Reembolso de compra', description: 'Revolut: Se ha abonado un reembolso de 32,50 EUR por una compra en MERCADONA.', direction: 'income', amount: 32.5, categoryCandidates: ['Devoluciones', 'Reembolsos'] },
    { label: 'Transferencia propia', description: 'BBVA: Has enviado una transferencia de 200,00 EUR a tu cuenta Revolut.', direction: 'transfer', amount: 200, categoryMustBeEmpty: true },
    { label: 'Retirada de efectivo', description: 'Revolut: Has retirado 60,00 EUR en efectivo en un cajero automático.', direction: 'transfer', amount: 60, categoryMustBeEmpty: true },
    { label: 'Ingreso de efectivo', description: 'BBVA: Has ingresado 120,00 EUR en efectivo en tu cuenta bancaria.', direction: 'transfer', amount: 120, categoryMustBeEmpty: true },
    { label: 'Recibo electricidad', description: 'BBVA: Se ha cargado en tu cuenta un recibo de electricidad de 87,75 EUR.', direction: 'expense', amount: 87.75, categoryCandidates: ['Hogar', 'Suministros', 'Servicios', 'Vivienda'] },
    { label: 'Pago farmacia', description: 'Revolut: Has realizado un pago con tarjeta de 18,75 EUR en FARMACIA CENTRAL.', direction: 'expense', amount: 18.75, categoryCandidates: ['Salud e higiene', 'Salud', 'Farmacia'] },
  ]

  async function analyzeWithGemini(text) {
    const { data, error: invokeError } = await supabase.functions.invoke('finance-ai-lab', {
      body: { description: text, categories: uniqueCategories },
    })
    if (invokeError) {
      let serverMessage = ''
      try {
        const payload = await invokeError.context?.json?.()
        serverMessage = typeof payload?.error === 'string' ? payload.error : ''
      } catch { /* Keep original client error. */ }
      throw new Error(serverMessage || invokeError.message || 'No se pudo conectar con el proveedor de IA.')
    }
    if (!data?.ok) throw new Error(data?.error || 'La IA no pudo completar la prueba.')
    return data.result
  }

  async function analyzeBatchWithGemini(tests) {
    const { data, error: invokeError } = await supabase.functions.invoke('finance-ai-lab', {
      body: {
        batch: tests.map((test, index) => ({ id: String(index), description: test.description })),
        categories: uniqueCategories,
      },
    })
    if (invokeError) {
      let serverMessage = ''
      try {
        const payload = await invokeError.context?.json?.()
        serverMessage = typeof payload?.error === 'string' ? payload.error : ''
      } catch { /* Keep original client error. */ }
      throw new Error(serverMessage || invokeError.message || 'No se pudo conectar con Gemini.')
    }
    if (!data?.ok || !Array.isArray(data?.results)) {
      throw new Error(data?.error || 'El proveedor de IA no devolvió los resultados de las pruebas.')
    }
    return data.results
  }

  async function runAutomaticTests() {
    if (!uniqueCategories.length || autoTesting || loading) return
    setAutoTesting(true)
    setAutoResults([])
    setAutoProgress(0)
    setError('')
    let results = []
    try {
      const analyses = await analyzeBatchWithGemini(AUTO_TESTS)
      results = AUTO_TESTS.map((test, index) => {
        const analysis = analyses.find((item) => String(item.id) === String(index)) || analyses[index]
        if (!analysis || analysis.error) {
          return { ...test, serviceError: analysis?.error || 'Gemini no devolvió este caso.', passed: false }
        }
        const directionOk = analysis.direction === test.direction
        const amountOk = test.amount === null
          ? analysis.amount === null
          : Number.isFinite(Number(analysis.amount)) && Math.abs(Number(analysis.amount) - test.amount) < 0.011
        const categoryExpected = test.categoryCandidates?.find((name) =>
          uniqueCategories.some((category) => category.name.toLocaleLowerCase('es') === name.toLocaleLowerCase('es'))
        )
        const categoryOk = test.categoryMustBeEmpty
          ? !analysis.category
          : !categoryExpected || String(analysis.category || '').toLocaleLowerCase('es') === categoryExpected.toLocaleLowerCase('es')
        return { ...test, analysis, passed: directionOk && amountOk && categoryOk, directionOk, amountOk, categoryOk }
      })
    } catch (err) {
      const message = err?.message || 'No se pudo conectar con Gemini.'
      results = AUTO_TESTS.map((test) => ({ ...test, serviceError: message, passed: false }))
    }
    setAutoResults(results)
    setAutoProgress(AUTO_TESTS.length)
    setAutoTesting(false)
  }

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
      const analysis = await analyzeWithGemini(clean)
      setResult(analysis)
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
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Escribe un concepto y La IA intentará identificar por sí solo si es un gasto o un ingreso, su categoría y el importe. El resultado es una sugerencia: no se guarda en tus movimientos.</p>
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
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-200"><CheckCircle2 className="h-4 w-4" /> Análisis de {result.provider || 'IA'}{result.ruleOverride ? ' · reglas de seguridad aplicadas' : ''}</div>
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

        <div className="lg:col-span-2 rounded-2xl border border-violet-400/20 bg-slate-900/70 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Pruebas automáticas</h2>
              <p className="mt-1 text-xs leading-5 text-slate-400">El proveedor de IA analizará 10 notificaciones bancarias ficticias. Se comparan tipo e importe esperados. No se crean movimientos ni se modifican saldos.</p>
            </div>
            <button type="button" onClick={runAutomaticTests} disabled={autoTesting || loading || loadingCategories || !uniqueCategories.length} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-violet-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50">
              {autoTesting ? <><Loader2 className="h-4 w-4 animate-spin" /> Ejecutando {autoProgress}/{AUTO_TESTS.length}</> : <><BrainCircuit className="h-4 w-4" /> Ejecutar pruebas automáticas</>}
            </button>
          </div>
          {autoResults.length > 0 && <div className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-emerald-400/20 bg-emerald-400/5 px-3 py-1.5 text-emerald-200">Correctas: {autoResults.filter((item) => item.passed).length}</span>
              <span className="rounded-full border border-rose-400/20 bg-rose-400/5 px-3 py-1.5 text-rose-200">Fallidas: {autoResults.filter((item) => !item.passed && !item.skipped && !item.serviceError).length}</span>
              {autoResults.some((item) => item.serviceError) && <span className="rounded-full border border-amber-400/20 bg-amber-400/5 px-3 py-1.5 text-amber-200">No evaluadas: {autoResults.filter((item) => item.serviceError).length}</span>}
            </div>
            <div className="space-y-2">
              {autoResults.map((item) => <div key={item.label} className="flex flex-col gap-1 rounded-xl border border-slate-800 bg-slate-950/50 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white">{item.label} <span className="font-normal text-slate-500">· {item.description}</span></p>
                  <p className="mt-1 text-[11px] text-slate-400">{item.serviceError || ('Detectado: ' + (DIRECTION_LABELS[item.analysis?.direction] || 'No identificado') + ' · ' + formatAmount(item.analysis?.amount) + (item.analysis?.category ? ' · ' + item.analysis.category : ''))}</p>
                </div>
                <span className={'inline-flex shrink-0 items-center gap-1 text-xs font-semibold ' + (item.serviceError ? 'text-amber-300' : item.passed ? 'text-emerald-300' : 'text-rose-300')}>
                  {item.serviceError ? 'No evaluada' : item.passed ? <><CheckCircle2 className="h-4 w-4" /> Correcta</> : <><AlertCircle className="h-4 w-4" /> Revisar</>}
                </span>
              </div>)}
            </div>
            <p className="text-[10px] leading-4 text-slate-500">La categoría detectada se muestra como información; el aprobado automático exige coincidencia de tipo e importe. Los 10 casos se envían en una sola llamada al proveedor de IA; aun así, pueden aplicarse límites del servicio.</p>
          </div>}
        </div>
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
              <li>• Solo se envían al proveedor configurado en Preview la descripción escrita y los nombres de categorías permitidas.</li>
              <li>• No se envían fechas, datos de cuentas ni saldos.</li>
              <li>• No registra ni modifica movimientos.</li>
              <li>• La respuesta siempre requiere revisión humana.</li>
              <li>• La solicitud se procesa con el proveedor indicado en el resultado. No se envían saldos ni identificadores de cuentas.</li>
            </ul>
          </div>
        </aside>
      </section>
    </div>
  )
}
