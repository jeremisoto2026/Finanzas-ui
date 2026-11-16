import { useEffect, useMemo, useState } from 'react'
import { BanknotesIcon, CalendarDaysIcon, CreditCardIcon, ArrowPathIcon, ScaleIcon, WalletIcon } from '@heroicons/react/24/outline'
import { sumMoney, sumMonthlyEquivalent } from '@/lib/finance-core'

const euro = (value) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(value || 0))

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
    const plans = data.installments.filter((plan) => plan.activo !== false)
    const allInstallments = plans.flatMap((plan) => (plan.historialCuotas || []).map((installment) => ({ ...installment, planName: plan.concepto })))
    const pendingInstallments = allInstallments.filter((installment) => !installment.pagada)
    const unlinkedPaid = allInstallments.filter((installment) => installment.pagada && !installment.transactionId)
    const activeFixed = data.fixed.filter((item) => item.activo !== false)
    const activeDebts = data.debts.filter((item) => !['settled', 'written_off'].includes(item.status))
    const replenishments = data.replenishments.filter((item) => Number(item.outstandingAmount || 0) > 0)
    const upcoming = pendingInstallments.filter((item) => item.fecha).sort((a, b) => a.fecha.localeCompare(b.fecha)).slice(0, 3)
    return {
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
    }
  }, [data])

  const cards = [
    {
      title: 'Cuotas pendientes',
      value: euro(summary.pendingInstallmentAmount),
      detail: summary.pendingInstallments.length + ' cuotas por pagar',
      icon: CreditCardIcon,
      tone: 'text-violet-300',
      secondary: summary.unlinkedPaid.length > 0 ? summary.unlinkedPaid.length + ' pagadas sin gasto vinculado' : 'Pagos enlazados con su movimiento real',
    },
    {
      title: 'Pagos fijos',
      value: euro(summary.fixedMonthly) + ' / mes',
      detail: summary.activeFixed.length + ' compromisos activos',
      icon: CalendarDaysIcon,
      tone: 'text-sky-300',
      secondary: 'Equivalente mensual planificado',
    },
    {
      title: 'Deudas y préstamos',
      value: euro(summary.receivable + summary.payable),
      detail: 'Te deben: ' + euro(summary.receivable),
      icon: ScaleIcon,
      tone: 'text-emerald-300',
      secondary: 'Debes: ' + euro(summary.payable),
    },
    {
      title: 'Dinero por reponer',
      value: euro(summary.replenishmentTotal),
      detail: summary.replenishments.length + ' reposiciones abiertas',
      icon: BanknotesIcon,
      tone: 'text-amber-300',
      secondary: 'No se suma al saldo hasta registrar el ingreso',
    },
  ]

  if (data.loading) {
    return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{[1, 2, 3, 4].map((item) => <div key={item} className="h-32 animate-pulse rounded-xl border border-slate-800 bg-slate-900/60" />)}</div>
  }

  if (data.error) {
    return <div role="alert" className="rounded-xl border border-amber-800/50 bg-amber-950/20 p-4 text-sm text-amber-200">{data.error}</div>
  }

  return (
    <section aria-label="Resumen de obligaciones y próximos pagos" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-400">Planificación y obligaciones</p>
          <h2 className="mt-1 text-lg font-semibold text-white">Lo que tienes pendiente</h2>
        </div>
        <p className="text-xs text-slate-500">Separado del saldo bancario real</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <article key={card.title} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-300">{card.title}</p>
                <Icon className={`h-5 w-5 ${card.tone}`} />
              </div>
              <p className="mt-3 text-2xl font-bold tracking-tight text-white">{card.value}</p>
              <p className="mt-1 text-xs text-slate-400">{card.detail}</p>
              <p className="mt-2 border-t border-slate-800 pt-2 text-xs text-slate-500">{card.secondary}</p>
            </article>
          )
        })}
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="mb-3 flex items-center gap-2">
          <CalendarDaysIcon className="h-4 w-4 text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-200">Próximas cuotas previstas</h3>
        </div>
        {summary.upcoming.length === 0 ? (
          <p className="text-sm text-slate-500">No hay cuotas pendientes con fecha programada.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            {summary.upcoming.map((item) => (
              <div key={item.installmentId || item.planName + item.numero} className="flex items-center justify-between gap-3 rounded-lg bg-slate-950/60 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-200">{item.planName} · Cuota {item.numero}</p>
                  <p className="text-xs text-slate-500">{new Date(item.fecha + 'T00:00:00').toLocaleDateString('es-ES')}</p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-white">{euro(item.monto)}</span>
              </div>
            ))}
          </div>
        )}
        {summary.unlinkedPaid.length > 0 && (
          <p className="mt-3 text-xs leading-5 text-amber-300">{summary.unlinkedPaid.length} cuota(s) constan como pagadas, pero necesitan vincular su gasto. No se han descontado automáticamente.</p>
        )}
      </div>
    </section>
  )
}
