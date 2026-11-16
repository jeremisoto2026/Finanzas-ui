import { lazy, Suspense } from 'react'
import { CalendarDays, BarChart3 } from 'lucide-react'
const GraficoGastos = lazy(() => import('@/components/dashboard/GraficoGastos'))
const GraficoIngresos = lazy(() => import('@/components/dashboard/GraficoIngresos'))
import DineroDisponible from '@/components/dashboard/DineroDisponible'
import ResumenObligaciones from '@/components/dashboard/ResumenObligaciones'

const today = new Date()
const dateLabel = today.toLocaleDateString('es-ES', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

export default function Dashboard() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-7 pb-8 md:space-y-9">
      <header className="flex flex-col gap-4 border-b border-slate-800/80 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">
            Finanzas personales y familiares
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Tu panorama financiero
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Saldos reales, compromisos pendientes y evolución de tus movimientos en un solo lugar.
          </p>
        </div>
        <div className="inline-flex w-fit items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-xs capitalize text-slate-300">
          <CalendarDays className="h-4 w-4 text-emerald-400" />
          {dateLabel}
        </div>
      </header>

      <section aria-label="Dinero disponible">
        <DineroDisponible />
      </section>

      <section aria-label="Obligaciones y pendientes" className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-slate-800/80 p-2">
            <BarChart3 className="h-4 w-4 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">Compromisos y pendientes</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Cuotas, pagos recurrentes, deudas y dinero por reponer.
            </p>
          </div>
        </div>
        <ResumenObligaciones />
      </section>

      <section aria-label="Evolución financiera" className="space-y-4">
        <div className="border-b border-slate-800/80 pb-3">
          <h2 className="text-base font-semibold text-white">Evolución de tus movimientos</h2>
          <p className="mt-1 text-xs text-slate-500">
            Distribución de ingresos y gastos contabilizados durante el periodo.
          </p>
        </div>
        <div className="grid grid-cols-1 items-stretch gap-5 xl:grid-cols-2">
          <Suspense fallback={<div className="h-80 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/60" />}><GraficoIngresos /></Suspense>
          <Suspense fallback={<div className="h-80 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/60" />}><GraficoGastos /></Suspense>
        </div>
      </section>
    </div>
  )
}
