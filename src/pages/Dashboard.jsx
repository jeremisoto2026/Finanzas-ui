import { CalendarDays, ShieldCheck } from 'lucide-react'
import GraficoGastos from '@/components/dashboard/GraficoGastos'
import GraficoIngresos from '@/components/dashboard/GraficoIngresos'
import DineroDisponible from '@/components/dashboard/DineroDisponible'
import PagosFijos from '@/components/dashboard/PagosFijos'
import ResumenObligaciones from '@/components/dashboard/ResumenObligaciones'

const today = new Date()
const dateLabel = today.toLocaleDateString('es-ES', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})
const monthLabel = today.toLocaleDateString('es-ES', {
  month: 'long',
  year: 'numeric',
})

export default function Dashboard() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 md:space-y-8">
      <header className="flex flex-col gap-4 border-b border-slate-800/80 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">
            Finanzas personales y familiares
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Resumen financiero
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Consulta tus saldos reales, compromisos recurrentes y evolución de ingresos y gastos.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <span className="inline-flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">
            <CalendarDays className="h-4 w-4 text-slate-500" />
            {dateLabel}
          </span>
          <span className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 capitalize">
            {monthLabel}
          </span>
        </div>
      </header>

      <section aria-label="Saldos y compromisos" className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.9fr)]">
        <DineroDisponible />
        <PagosFijos />
      </section>

      <ResumenObligaciones />

      <section aria-label="Evolución financiera" className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <GraficoIngresos />
        <GraficoGastos />
      </section>

      <aside className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3 text-sm leading-6 text-slate-400">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
        <p>
          <span className="font-medium text-slate-200">Criterio contable:</span>{' '}
          el saldo y los gráficos de gastos e ingresos se calculan con movimientos contabilizados.
          Los pagos fijos, presupuestos, cuotas pendientes, reservas y deudas se muestran por separado
          para evitar duplicar importes o confundir previsiones con dinero ya pagado.
        </p>
      </aside>
    </div>
  )
}
