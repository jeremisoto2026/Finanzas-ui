import { useEffect, useMemo, useState } from 'react'
import { BanknotesIcon, CalendarDaysIcon, CreditCardIcon, ScaleIcon } from '@heroicons/react/24/outline'
import { sumMoney, sumMonthlyEquivalent } from '@/lib/finance-core'

const euro = (value) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(value || 0))

function dateKeyToday() {
  const now = new Date()
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-')
}

function monthLabel(value) {
  if (!value) return 'sin vencimientos'
  const [year, month] = value.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
}

export default function ResumenObligaciones() {
  const [data, setData] = useState({ installments: [], fixed: [], debts: [], replenishments: [], loading: true, error: '' })

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const [installmentsResponse, fixedResponse, debtsResponse, replenishmentsResponse] = await Promise.all([
          fetch('/api/compras-cuotas', { cache: 'no-store' }),
          fetch('/api/pagos-fijos', { cache: 'no-store' }),
          fetch('/api/deudas', { cache: 'no-store' }),
          fetch('/api/compromisos', { cache: 'no-store' }),
        ])
        const responses = [installmentsResponse, fixedResponse, debtsResponse, replenishmentsResponse]
        if (responses.some((response) => !response.ok)) throw new Error('No se pudo actualizar el resumen de obligaciones.')
        const [installments, fixed, debts, replenishments] = await Promise.all(responses.map((response) => response.json()))
        if (!active) return
        setData({
          installments: Array.isArray(installments) ? installments : [],
          fixed: Array.isArray(fixed) ? fixed : [],
          debts: Array.isArray(debts) ? debts : [],
          replenishments: Array.isArray(replenishments) ? replenishments : [],
          loading: false,
          error: '',
        })
      } catch (error) {
        if (!active) return
        setData((current) => ({ ...current, loading: false, error: error.message || 'Error al cargar las obligaciones.' }))
      }
    }
    load()
    return () => { active = false }
  }, [])

  const summary = useMemo(() => {
    const todayKey = dateKeyToday()
    const currentMonth = todayKey.slice(0, 7)
    const plans = data.installments.filter((plan) => plan.activo !== false)
    const allInstallments = plans.flatMap((plan) => (plan.historialCuotas || []).map((installment) => ({
      ...installment,
      planName: plan.concepto,
      month: String(installment.fecha || '').slice(0, 7),
    })))
    const pendingAll = allInstallments
      .filter((installment) => !installment.pagada && /^\d{4}-\d{2}$/.test(installment.month))
      .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))

    // Focus on one month only: overdue month first, current month if it has pending items,
    // otherwise the nearest future month. This prevents the dashboard from accumulating
    // every future installment into one misleading figure.
    const overdueFirst = pendingAll.find((item) => item.fecha < todayKey)
    const currentMonthPending = pendingAll.filter((item) => item.month === currentMonth)
    const focusMonth = overdueFirst?.month || (currentMonthPending.length ? currentMonth : pendingAll[0]?.month || currentMonth)
    const pendingInstallments = pendingAll.filter((item) => item.month === focusMonth)
    const unlinkedPaid = allInstallments.filter((item) => item.month === focusMonth && item.pagada && !item.transactionId)
    const activeFixed = data.fixed.filter((item) => item.activo !== false)
    const activeDebts = data.debts.filter((item) => !['settled', 'written_off'].includes(item.status))
    const replenishments = data.replenishments.filter((item) => Number(item.outstandingAmount || 0) > 0)
    const upcoming = pendingInstallments
      .filter((item) => item.fecha && item.fecha >= todayKey)
      .slice(0, 3)
    const overdue = pendingInstallments.filter((item) => item.fecha && item.fecha < todayKey)

    return {
      focusMonth,
      pendingInstallments,
      pendingInstallmentAmount: sumMoney(pendingInstallments, (item) => item.monto || 0),
      unlinkedPaid,
      activeFixed,
      fixedMonthly: sumMonthlyEquivalent(activeFixed, (item) => item.monto, (item) => item.frecuencia || 'mensual'),
      receivable: sumMoney(activeDebts.filter((item) => item.direction === 'receivable'), (item) => item.outstandingAmount || 0),
      payable: sumMoney(activeDebts.filter((item) => item.direction === 'payable'), (item) => item.outstandingAmount || 0),
      replenishments,
      replenishmentTotal: sumMoney(replenishments, (item) => item.outstandingAmount || 0),
      upcoming,
      overdue,
    }
  }, [data])

  const cards = [
    {
      title: 'Cuotas · ' + monthLabel(summary.focusMonth),
      value: euro(summary.pendingInstallmentAmount),
      detail: summary.pendingInstallments.length
        ? summary.pendingInstallments.length + ' cuotas pendientes en ese mes'
        : 'Sin cuotas pendientes en ese mes',
      icon: CreditCardIcon,
      tone: 'violet',
      secondary: summary.unlinkedPaid.length > 0
        ? summary.unlinkedPaid.length + ' pagadas sin gasto vinculado'
        : 'Solo se muestra el mes prioritario',
    },
    {
      title: 'Pagos fijos',
      value: euro(summary.fixedMonthly) + ' / mes',
      detail: summary.activeFixed.length + ' compromisos activos',
      icon: CalendarDaysIcon,
      tone: 'sky',
      secondary: 'Coste mensual equivalente previsto',
    },
    {
      title: 'Deudas y préstamos',
      value: euro(summary.receivable + summary.payable),
      detail: 'Te deben: ' + euro(summary.receivable),
      icon: ScaleIcon,
      tone: 'emerald',
      secondary: 'Debes: ' + euro(summary.payable),
    },
    {
      title: 'Dinero por reponer',
      value: euro(summary.replenishmentTotal),
      detail: summary.replenishments.length + ' reposiciones abiertas',
      icon: BanknotesIcon,
      tone: 'amber',
      secondary: 'No se suma al saldo hasta registrar el ingreso',
    },
  ]

  if (data.loading) {
    return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{[1, 2, 3, 4].map((item) => <div key={item} className="h-32 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/60" />)}</div>
  }

  if (data.error) {
    return <div role="alert" className="rounded-xl border border-amber-800/50 bg-amber-950/20 p-4 text-sm text-amber-200">{data.error}</div>
  }

  return (
    <section aria-label="Resumen de cuotas, pagos fijos, deudas y reposiciones" className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon
          const toneClasses = {
            violet: 'bg-violet-500/10 text-violet-300',
            sky: 'bg-sky-500/10 text-sky-300',
            emerald: 'bg-emerald-500/10 text-emerald-300',
            amber: 'bg-amber-500/10 text-amber-300',
          }
          return (
            <article key={card.title} className="group rounded-2xl border border-slate-800 bg-slate-900/65 p-4 shadow-sm transition-colors hover:border-slate-700 hover:bg-slate-900/90">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium capitalize text-slate-300">{card.title}</p>
                <span className={'rounded-lg p-2 ' + toneClasses[card.tone]}>
                  <Icon className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-4 text-xl font-semibold tracking-tight tabular-nums text-white">{card.value}</p>
              <p className="mt-1 text-xs text-slate-400">{card.detail}</p>
              <p className="mt-3 border-t border-slate-800 pt-3 text-[11px] leading-5 text-slate-500">{card.secondary}</p>
            </article>
          )
        })}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/45 p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CalendarDaysIcon className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-semibold capitalize text-white">Cuotas de {monthLabel(summary.focusMonth)}</h3>
          </div>
          <span className="text-xs text-slate-500">Un mes prioritario cada vez</span>
        </div>

        {summary.pendingInstallments.length === 0 ? (
          <p className="py-2 text-sm text-slate-500">No hay cuotas pendientes en {monthLabel(summary.focusMonth)}.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            {summary.upcoming.map((item) => (
              <div key={item.installmentId || item.planName + item.numero} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/55 px-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-200">{item.planName} · Cuota {item.numero}</p>
                  <p className="mt-1 text-xs text-slate-500">{new Date(item.fecha + 'T00:00:00').toLocaleDateString('es-ES')}</p>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-white">{euro(item.monto)}</span>
              </div>
            ))}
            {summary.upcoming.length === 0 && <p className="py-2 text-sm text-slate-500">Quedan cuotas vencidas pendientes de revisar.</p>}
          </div>
        )}

        {summary.overdue.length > 0 && (
          <p className="mt-3 rounded-lg border border-amber-800/40 bg-amber-950/20 px-3 py-2 text-xs leading-5 text-amber-200">
            Hay {summary.overdue.length} cuota(s) vencida(s) pendientes de registrar como pagadas.
          </p>
        )}
        {summary.unlinkedPaid.length > 0 && (
          <p className="mt-3 rounded-lg border border-amber-800/40 bg-amber-950/20 px-3 py-2 text-xs leading-5 text-amber-200">
            {summary.unlinkedPaid.length} cuota(s) figuran como pagadas, pero no tienen un gasto real vinculado. No se han descontado del saldo bancario.
          </p>
        )}
      </div>
    </section>
  )
}
