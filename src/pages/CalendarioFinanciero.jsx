import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, RefreshCw, Wallet, Receipt, CreditCard, CheckCircle2, Clock3, AlertCircle } from 'lucide-react'

const money = (value) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(value) || 0)
const pad = (value) => String(value).padStart(2, '0')
const dateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const parseDate = (value) => {
  if (!value) return null
  const raw = String(value).slice(0, 10)
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
}
const addMonthsClamped = (date, amount) => {
  const result = new Date(date.getFullYear(), date.getMonth() + amount, 1)
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate()
  result.setDate(Math.min(date.getDate(), lastDay))
  return result
}
const frequencyStep = (frequency) => {
  const value = String(frequency || 'mensual').toLowerCase()
  if (value.includes('seman')) return { days: 7 }
  if (value.includes('quinc')) return { days: 15 }
  if (value.includes('trimes')) return { months: 3 }
  if (value.includes('anual')) return { months: 12 }
  return { months: 1 }
}
const shiftDate = (date, index, step) => step.days
  ? new Date(date.getFullYear(), date.getMonth(), date.getDate() + index * step.days)
  : addMonthsClamped(date, index * step.months)

function buildCalendarEvents(fixedPayments, installmentPlans, expenses, monthStart, monthEnd) {
  const events = []
  const start = new Date(monthStart.getFullYear(), monthStart.getMonth() - 12, 1)
  fixedPayments.filter((item) => item.activo !== false).forEach((payment) => {
    const firstDate = parseDate(payment.fechaInicio)
    if (!firstDate) return
    const step = frequencyStep(payment.frecuencia)
    for (let index = 0; index < 500; index += 1) {
      const date = shiftDate(firstDate, index, step)
      if (date > monthEnd) break
      if (date >= monthStart && date <= monthEnd) events.push({
        id: `fixed-${payment.id}-${dateKey(date)}`,
        date: dateKey(date), title: payment.nombre || 'Pago fijo',
        amount: payment.monto, type: 'fixed', status: 'planned', detail: 'Pago recurrente previsto'
      })
      if (date < start && index > 0) continue
    }
  })

  installmentPlans.filter((plan) => plan.activo !== false).forEach((plan) => {
    const history = Array.isArray(plan.historialCuotas) ? plan.historialCuotas : []
    if (history.length) {
      history.forEach((installment, index) => {
        const date = parseDate(installment.fecha)
        if (!date || date < monthStart || date > monthEnd) return
        events.push({
          id: `installment-${plan.id}-${installment.id || index}`,
          date: dateKey(date), title: `${plan.concepto || plan.nombre || 'Compra a cuotas'} · cuota ${installment.numero || index + 1}`,
          amount: installment.monto ?? plan.montoCuota, type: 'installment',
          status: installment.pagada ? 'paid' : 'planned',
          detail: installment.pagada ? 'Cuota marcada como pagada' : 'Vencimiento previsto'
        })
      })
      return
    }
    const firstDate = parseDate(plan.fechaInicio)
    const total = Number(plan.cuotasTotales || plan.cuotas || 0)
    if (!firstDate || total <= 0) return
    const step = frequencyStep(plan.frecuenciaPago || plan.frecuencia)
    const amount = Number(plan.montoCuota) || (Number(plan.montoTotal) / total)
    for (let index = 0; index < total; index += 1) {
      const date = shiftDate(firstDate, index, step)
      if (date < monthStart || date > monthEnd) continue
      events.push({
        id: `installment-${plan.id}-${index}`,
        date: dateKey(date), title: `${plan.concepto || plan.nombre || 'Compra a cuotas'} · cuota ${index + 1}`,
        amount, type: 'installment',
        status: index < Number(plan.cuotasPagadas || 0) ? 'paid' : 'planned',
        detail: index < Number(plan.cuotasPagadas || 0) ? 'Cuota marcada como pagada' : 'Vencimiento estimado'
      })
    }
  })

  expenses.forEach((expense) => {
    const date = parseDate(expense.fecha)
    if (!date || date < monthStart || date > monthEnd) return
    events.push({
      id: `expense-${expense.id}`, date: dateKey(date),
      title: expense.descripcion || expense.concepto || expense.nombre || expense.categoria || 'Gasto registrado',
      amount: expense.monto, type: 'expense', status: 'paid',
      detail: expense.categoria || 'Gasto contabilizado'
    })
  })
  return events.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title))
}

export default function CalendarioFinanciero() {
  const [month, setMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [data, setData] = useState({ fixed: [], installments: [], expenses: [], budgets: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()))

  const monthKey = `${month.getFullYear()}-${pad(month.getMonth() + 1)}`
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1)
  const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [fixedRes, installmentRes, expenseRes, budgetRes] = await Promise.all([
        fetch('/api/pagos-fijos', { cache: 'no-store' }),
        fetch('/api/compras-cuotas', { cache: 'no-store' }),
        fetch('/api/gastos', { cache: 'no-store' }),
        fetch('/api/presupuestos', { cache: 'no-store' }),
      ])
      const responses = [fixedRes, installmentRes, expenseRes, budgetRes]
      const failed = responses.find((response) => !response.ok)
      if (failed) throw new Error('No se pudieron cargar todos los datos del calendario.')
      const [fixed, installments, expenses, budgets] = await Promise.all(responses.map((response) => response.json()))
      setData({
        fixed: Array.isArray(fixed) ? fixed : [],
        installments: Array.isArray(installments) ? installments : [],
        expenses: Array.isArray(expenses) ? expenses : [],
        budgets: Array.isArray(budgets) ? budgets : [],
      })
    } catch (loadError) {
      setError(loadError.message || 'Error cargando el calendario.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const events = useMemo(
    () => buildCalendarEvents(data.fixed, data.installments, data.expenses, monthStart, monthEnd),
    [data, monthKey]
  )
  const eventsByDate = useMemo(() => events.reduce((map, event) => {
    map[event.date] = [...(map[event.date] || []), event]
    return map
  }, {}), [events])
  const budgetRows = useMemo(() => data.budgets.filter((item) => item.month === monthKey).map((budget) => {
    const spent = data.expenses.filter((expense) => {
      const date = parseDate(expense.fecha)
      return date && date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth()
        && (expense.categoria || 'Otros') === budget.category
    }).reduce((sum, expense) => sum + (Number(expense.monto) || 0), 0)
    const limit = Number(budget.amount) || 0
    return { ...budget, spent, limit, percent: limit > 0 ? Math.min(100, spent / limit * 100) : 0 }
  }), [data, monthKey])
  const days = useMemo(() => {
    const offset = (monthStart.getDay() + 6) % 7
    const count = monthEnd.getDate()
    const cells = Array.from({ length: offset }, () => null)
    for (let day = 1; day <= count; day += 1) cells.push(new Date(month.getFullYear(), month.getMonth(), day))
    while (cells.length % 7) cells.push(null)
    return cells
  }, [monthKey])
  const selectedEvents = eventsByDate[selectedDate] || []
  const monthName = month.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
  const todayKey = dateKey(new Date())
  const typeStyles = {
    fixed: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
    installment: 'border-violet-500/30 bg-violet-500/10 text-violet-200',
    expense: 'border-sky-500/30 bg-sky-500/10 text-sky-200',
  }

  return (
    <section className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-emerald-300"><CalendarDays className="h-5 w-5" /><span className="text-xs font-semibold uppercase tracking-wider">Planificación financiera</span></div>
          <h1 className="text-2xl font-bold capitalize text-white">Calendario financiero</h1>
          <p className="mt-1 text-sm text-slate-400">Consulta pagos previstos, cuotas y gastos contabilizados por fecha.</p>
        </div>
        <button type="button" onClick={() => void load()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-200 hover:bg-slate-800"><RefreshCw className="h-4 w-4" />Actualizar</button>
      </header>

      {error && <div role="alert" className="rounded-xl border border-rose-700/50 bg-rose-950/30 p-4 text-sm text-rose-200"><AlertCircle className="mr-2 inline h-4 w-4" />{error}</div>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(18rem,0.8fr)]">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5">
          <div className="mb-5 flex items-center justify-between gap-3">
            <button type="button" aria-label="Mes anterior" onClick={() => { const next = new Date(month.getFullYear(), month.getMonth() - 1, 1); setMonth(next); setSelectedDate(dateKey(next)); }} className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:bg-slate-800"><ChevronLeft className="h-5 w-5" /></button>
            <h2 className="text-lg font-semibold capitalize text-white">{monthName}</h2>
            <button type="button" aria-label="Mes siguiente" onClick={() => { const next = new Date(month.getFullYear(), month.getMonth() + 1, 1); setMonth(next); setSelectedDate(dateKey(next)); }} className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:bg-slate-800"><ChevronRight className="h-5 w-5" /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">{['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map((day) => <div key={day} className="py-2">{day}</div>)}</div>
          {loading ? <div className="grid grid-cols-7 gap-1">{Array.from({ length: 35 }, (_, i) => <div key={i} className="h-20 animate-pulse rounded-lg bg-slate-800/70" />)}</div> : (
            <div className="grid grid-cols-7 gap-1">
              {days.map((date, index) => {
                if (!date) return <div key={`empty-${index}`} className="min-h-20 rounded-lg bg-slate-950/30 sm:min-h-24" />
                const key = dateKey(date)
                const dayEvents = eventsByDate[key] || []
                const active = selectedDate === key
                return <button key={key} type="button" onClick={() => setSelectedDate(key)} aria-pressed={active} className={`min-h-20 rounded-lg border p-1.5 text-left transition sm:min-h-24 sm:p-2 ${active ? 'border-emerald-400 bg-emerald-500/10' : 'border-slate-800 bg-slate-950/40 hover:border-slate-600'}`}>
                  <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${key === todayKey ? 'bg-emerald-500 font-bold text-white' : 'text-slate-300'}`}>{date.getDate()}</span>
                  <span className="mt-1 flex flex-wrap gap-1">{dayEvents.slice(0, 3).map((event) => <span key={event.id} title={event.title} className={`h-1.5 w-1.5 rounded-full ${event.type === 'fixed' ? 'bg-amber-400' : event.type === 'installment' ? 'bg-violet-400' : 'bg-sky-400'}`} />)}{dayEvents.length > 3 && <span className="text-[9px] text-slate-400">+{dayEvents.length - 3}</span>}</span>
                  <span className="mt-1 hidden truncate text-[10px] text-slate-400 sm:block">{dayEvents.length ? `${dayEvents.length} evento(s)` : ''}</span>
                </button>
              })}
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-4 border-t border-slate-800 pt-4 text-xs text-slate-400">
            <span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-amber-400" />Pagos fijos previstos</span>
            <span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-violet-400" />Cuotas</span>
            <span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-sky-400" />Gastos contabilizados</span>
          </div>
        </div>

        <aside className="space-y-5">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <h3 className="mb-3 flex items-center gap-2 font-semibold text-white"><CalendarDays className="h-4 w-4 text-emerald-300" />{parseDate(selectedDate)?.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' }) || 'Eventos del día'}</h3>
            {loading ? <p className="text-sm text-slate-500">Cargando eventos…</p> : selectedEvents.length === 0 ? <p className="text-sm text-slate-500">No hay eventos registrados para este día.</p> : <div className="space-y-3">{selectedEvents.map((event) => <div key={event.id} className={`rounded-xl border p-3 ${typeStyles[event.type]}`}><div className="flex items-start justify-between gap-2"><div className="min-w-0 text-sm font-medium">{event.title}</div><div className="shrink-0 text-sm font-semibold">{money(event.amount)}</div></div><div className="mt-1 flex items-center gap-1 text-xs opacity-75">{event.status === 'paid' ? <CheckCircle2 className="h-3 w-3" /> : <Clock3 className="h-3 w-3" />}{event.detail}</div></div>)}</div>}
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <h3 className="mb-3 flex items-center gap-2 font-semibold text-white"><Wallet className="h-4 w-4 text-sky-300" />Presupuestos de {month.toLocaleDateString('es-ES', { month: 'long' })}</h3>
            {budgetRows.length === 0 ? <p className="text-sm text-slate-500">No hay presupuestos para este mes.</p> : <div className="space-y-4">{budgetRows.map((budget) => <div key={budget.id}><div className="mb-1 flex items-center justify-between gap-2 text-sm"><span className="truncate text-slate-200">{budget.category}</span><span className="shrink-0 text-slate-300">{money(budget.spent)} / {money(budget.limit)}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-800"><div className={`h-full rounded-full ${budget.percent >= 100 ? 'bg-rose-500' : budget.percent >= 80 ? 'bg-amber-400' : 'bg-emerald-500'}`} style={{ width: `${budget.percent}%` }} /></div><div className="mt-1 text-right text-xs text-slate-500">{(budget.limit > 0 ? budget.spent / budget.limit * 100 : 0).toFixed(0)} % consumido</div></div>)}</div>}
          </div>
        </aside>
      </div>
      <p className="text-xs text-slate-500">Los pagos fijos y cuotas aparecen como previsiones. Solo los gastos contabilizados representan movimientos reales; consultar el calendario no modifica cuentas, saldos ni historial.</p>
    </section>
  )
}
