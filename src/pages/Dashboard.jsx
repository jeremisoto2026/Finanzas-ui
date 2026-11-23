import { lazy, Suspense } from 'react'
import { CalendarDays, BarChart3, Sparkles, TrendingUp, WalletCards } from 'lucide-react'
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

function SectionHeading({ icon: Icon, eyebrow, title, description }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 rounded-xl border border-emerald-500/15 bg-emerald-500/[0.08] p-2.5">
        <Icon className="h-4 w-4 text-emerald-400" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-400/80">{eyebrow}</p>
        <h2 className="mt-1 text-base font-semibold tracking-tight text-white sm:text-lg">{title}</h2>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-400 sm:text-sm">{description}</p>
      </div>
    </div>
  )
}

export default function Dashboard() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-7 pb-8 md:space-y-9">
      <header className="relative isolate overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/35 px-5 py-6 shadow-xl shadow-black/10 sm:px-7 sm:py-8">
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-24 -z-10 h-64 w-64 rounded-full border border-emerald-400/10 bg-emerald-400/[0.04] blur-[1px]" />
        <div aria-hidden="true" className="pointer-events-none absolute right-12 top-10 -z-10 h-28 w-28 rounded-full border border-emerald-400/[0.08]" />
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/[0.08] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-300">
              <Sparkles className="h-3.5 w-3.5" />
              Finanzas personales y familiares
            </div>
            <h1 className="mt-4 text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-4xl">
              Tu dinero, <span className="text-emerald-400">bajo control.</span>
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400 sm:text-base">
              Una visión clara de tus cuentas, compromisos y evolución financiera para tomar mejores decisiones cada día.
            </p>
          </div>
          <div className="inline-flex w-fit shrink-0 items-center gap-2.5 rounded-2xl border border-slate-700/80 bg-slate-950/55 px-4 py-3 text-xs text-slate-300 shadow-inner shadow-black/10">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10">
              <CalendarDays className="h-4 w-4 text-emerald-400" />
            </span>
            <span>
              <span className="block text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">Hoy</span>
              <span className="mt-0.5 block capitalize font-semibold text-slate-200">{dateLabel}</span>
            </span>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-800/80 pt-4 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Saldos de tus cuentas</span>
          <span className="inline-flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-sky-400" /> Compromisos y planificación</span>
          <span className="inline-flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-violet-400" /> Evolución de movimientos</span>
        </div>
      </header>

      <section aria-label="Dinero disponible" className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <WalletCards className="h-4 w-4 text-emerald-400" />
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Tu posición actual</p>
        </div>
        <DineroDisponible />
      </section>

      <section aria-label="Obligaciones y pendientes" className="space-y-4">
        <SectionHeading
          icon={BarChart3}
          eyebrow="Planificación"
          title="Compromisos y pendientes"
          description="Cuotas, pagos recurrentes, deudas y dinero por reponer, organizados para que sepas qué tienes por delante."
        />
        <ResumenObligaciones />
      </section>

      <section aria-label="Evolución financiera" className="space-y-4">
        <div className="flex flex-col gap-3 border-b border-slate-800/80 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <SectionHeading
            icon={TrendingUp}
            eyebrow="Seguimiento"
            title="Evolución de tus movimientos"
            description="Consulta cómo se comportan tus ingresos y gastos durante el periodo."
          />
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-800 bg-slate-900/60 px-3 py-1.5 text-[11px] text-slate-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Datos contabilizados
          </span>
        </div>
        <div className="grid grid-cols-1 items-stretch gap-5 xl:grid-cols-2">
          <Suspense fallback={<div className="h-80 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/60" />}><GraficoIngresos /></Suspense>
          <Suspense fallback={<div className="h-80 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/60" />}><GraficoGastos /></Suspense>
        </div>
      </section>
    </div>
  )
}
