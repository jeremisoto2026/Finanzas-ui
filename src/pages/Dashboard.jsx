import { lazy, Suspense } from 'react'
import { CalendarDays, BarChart3, CircleDollarSign, Wallet, PiggyBank, Target } from 'lucide-react'

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
    <div className="finance-section-heading flex min-w-0 items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-400/15 bg-emerald-400/[0.08] text-emerald-300">
        <Icon className="h-[18px] w-[18px]" strokeWidth={1.9} />
      </span>
      <div className="min-w-0">
        <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-emerald-400/85">{eyebrow}</p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-white sm:text-xl">{title}</h2>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-400 sm:text-sm">{description}</p>
      </div>
    </div>
  )
}

function MeaningCard({ icon: Icon, title, description }) {
  return (
    <article className="dashboard-meaning-card flex items-start gap-3 rounded-xl border border-slate-800/90 bg-slate-900/55 p-3.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-800/90 text-emerald-300">
        <Icon className="h-[17px] w-[17px]" strokeWidth={1.9} />
      </span>
      <div className="min-w-0">
        <h3 className="text-xs font-semibold text-slate-100">{title}</h3>
        <p className="mt-1 text-[11px] leading-[1.55] text-slate-400">{description}</p>
      </div>
    </article>
  )
}

function ChartPanel({ children }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-800/90 bg-slate-900/65 p-3 shadow-lg shadow-black/10 sm:p-4">
      {children}
    </div>
  )
}

export default function Dashboard() {
  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-7 pb-8 md:space-y-9">
      <header className="dashboard-welcome relative isolate overflow-hidden rounded-2xl border border-slate-700/80 bg-[#101D2E] shadow-lg shadow-black/15">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,rgba(16,185,129,0.13),transparent_52%)]" />
        <div className="flex flex-col gap-4 p-5 sm:p-7 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Tu centro financiero
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl lg:text-[2.15rem]">
              Todo claro. Todo bajo control.
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">
              Aquí puedes ver cuánto dinero tienes, qué pagos se acercan y cómo evolucionan tus ingresos y gastos.
            </p>
          </div>
          <div className="flex w-fit items-center gap-3 rounded-xl border border-slate-700/80 bg-slate-950/45 px-3.5 py-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-300">
              <CalendarDays className="h-[17px] w-[17px]" />
            </span>
            <span>
              <span className="block text-[9px] font-bold uppercase tracking-[0.15em] text-slate-500">Hoy</span>
              <span className="mt-0.5 block text-xs font-semibold capitalize text-slate-100">{dateLabel}</span>
            </span>
          </div>
        </div>
      </header>

      <section aria-label="Cómo interpretar el resumen" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2 px-1">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500">Guía rápida</p>
            <h2 className="mt-1 text-sm font-semibold text-slate-100">Entiende tus cifras</h2>
          </div>
          <p className="text-[10px] text-slate-500">Tres conceptos que no debes confundir</p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <MeaningCard
            icon={Wallet}
            title="Saldo de tus cuentas"
            description="Es el dinero que figura en tus bancos, tarjetas, efectivo y monederos."
          />
          <MeaningCard
            icon={PiggyBank}
            title="Dinero reservado"
            description="Es una parte del saldo que has apartado para un objetivo. No crea un gasto ni mueve dinero en el banco."
          />
          <MeaningCard
            icon={Target}
            title="Presupuesto"
            description="Es un límite para controlar cuánto quieres gastar. No significa que ese dinero esté apartado."
          />
        </div>
      </section>

      <section aria-label="Dinero disponible" className="space-y-4">
        <SectionHeading
          icon={CircleDollarSign}
          eyebrow="01 · TU DINERO"
          title="Dinero disponible"
          description="Consulta los saldos de tus cuentas y cuánto queda libre después de las reservas."
        />
        <DineroDisponible />
      </section>

      <section aria-label="Próximos compromisos" className="space-y-4">
        <SectionHeading
          icon={CalendarDays}
          eyebrow="02 · LO QUE VIENE"
          title="Pagos y compromisos"
          description="Ten a la vista cuotas, pagos fijos, vencimientos y cantidades pendientes."
        />
        <ResumenObligaciones />
      </section>

      <section aria-label="Evolución financiera" className="space-y-4">
        <div className="flex flex-col gap-3 border-b border-slate-800/80 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <SectionHeading
            icon={BarChart3}
            eyebrow="03 · EVOLUCIÓN"
            title="Ingresos y gastos"
            description="Compara lo que entra y sale según los movimientos que has registrado."
          />
          <span className="inline-flex w-fit items-center gap-2 rounded-lg border border-slate-700/80 bg-slate-900/60 px-3 py-2 text-[10px] font-medium text-slate-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Datos registrados
          </span>
        </div>
        <div className="grid grid-cols-1 items-start gap-4 2xl:grid-cols-2">
          <ChartPanel>
            <Suspense fallback={<div className="h-72 animate-pulse rounded-xl bg-slate-800/50" />}>
              <GraficoIngresos />
            </Suspense>
          </ChartPanel>
          <ChartPanel>
            <Suspense fallback={<div className="h-72 animate-pulse rounded-xl bg-slate-800/50" />}>
              <GraficoGastos />
            </Suspense>
          </ChartPanel>
        </div>
      </section>
    </div>
  )
}
