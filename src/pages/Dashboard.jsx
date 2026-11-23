import { lazy, Suspense } from 'react'
import { CalendarDays, ChartNoAxesCombined, CircleDollarSign, LayoutDashboard, Sparkles } from 'lucide-react'
const GraficoGastos = lazy(() => import('@/components/dashboard/GraficoGastos'))
const GraficoIngresos = lazy(() => import('@/components/dashboard/GraficoIngresos'))
import DineroDisponible from '@/components/dashboard/DineroDisponible'
import ResumenObligaciones from '@/components/dashboard/ResumenObligaciones'

const today = new Date()
const dateLabel = today.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

function BlockTitle({ icon: Icon, kicker, title, description }) {
  return <div className="flex min-w-0 items-start gap-3">
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.08] text-emerald-300"><Icon className="h-[18px] w-[18px]" /></div>
    <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-400/80">{kicker}</p><h2 className="mt-1 text-lg font-bold tracking-tight text-white sm:text-xl">{title}</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-400 sm:text-sm">{description}</p></div>
  </div>
}

function ChartPanel({ children }) {
  return <div className="min-w-0 overflow-hidden rounded-[1.5rem] border border-slate-700/80 bg-gradient-to-b from-slate-900 to-slate-950 p-3 shadow-xl shadow-black/15 sm:p-4">{children}</div>
}

export default function Dashboard() {
  return <div className="mx-auto w-full max-w-[1500px] space-y-8 pb-8 md:space-y-10">
    <header className="relative isolate overflow-hidden rounded-[1.8rem] border border-slate-700/80 bg-[#0b1424] shadow-2xl shadow-black/20">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,rgba(16,185,129,0.2),transparent_48%),linear-gradient(115deg,rgba(15,23,42,0.2),rgba(2,6,23,0.72))]" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-28 -z-10 h-80 w-80 rounded-full border border-emerald-300/[0.08]" />
      <div className="flex flex-col gap-5 p-5 sm:p-7 lg:flex-row lg:items-end lg:justify-between lg:p-8">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/[0.08] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300"><Sparkles className="h-3.5 w-3.5" /> Tu centro de control</div>
          <div className="mt-4 flex items-center gap-2 text-slate-400"><LayoutDashboard className="h-4 w-4 text-emerald-400" /><span className="text-xs font-semibold uppercase tracking-[0.16em]">Panel financiero</span></div>
          <h1 className="mt-2 text-3xl font-bold tracking-[-0.045em] text-white sm:text-4xl lg:text-[2.7rem]">Resumen <span className="text-emerald-400">general</span></h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400 sm:text-base">Todo lo importante de tus finanzas, reunido en un solo lugar. Consulta tu dinero, anticipa compromisos y sigue tus movimientos.</p>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-slate-700/90 bg-slate-950/55 px-4 py-3 shadow-inner shadow-black/20 backdrop-blur">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300"><CalendarDays className="h-5 w-5" /></span>
          <span><span className="block text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">Fecha de hoy</span><span className="mt-1 block text-sm font-semibold capitalize text-slate-100">{dateLabel}</span></span>
        </div>
      </div>
      <div className="grid grid-cols-1 border-t border-slate-800/90 bg-slate-950/25 sm:grid-cols-3">
        <div className="flex items-center gap-3 px-5 py-3.5 sm:px-7"><CircleDollarSign className="h-4 w-4 text-emerald-400" /><span className="text-xs font-medium text-slate-300">Cuentas y dinero disponible</span></div>
        <div className="flex items-center gap-3 border-t border-slate-800/70 px-5 py-3.5 sm:border-l sm:border-t-0 sm:px-7"><CalendarDays className="h-4 w-4 text-sky-400" /><span className="text-xs font-medium text-slate-300">Pagos y compromisos próximos</span></div>
        <div className="flex items-center gap-3 border-t border-slate-800/70 px-5 py-3.5 sm:border-l sm:border-t-0 sm:px-7"><ChartNoAxesCombined className="h-4 w-4 text-violet-400" /><span className="text-xs font-medium text-slate-300">Evolución de ingresos y gastos</span></div>
      </div>
    </header>
    <section aria-label="Posición financiera" className="space-y-4"><BlockTitle icon={CircleDollarSign} kicker="01 · Posición financiera" title="Tu dinero, de un vistazo" description="Saldos reales por cuenta, dinero reservado y disponibilidad después de reservas." /><DineroDisponible /></section>
    <section aria-label="Compromisos financieros" className="space-y-4"><BlockTitle icon={CalendarDays} kicker="02 · Organización" title="Lo que tienes por delante" description="Cuotas, pagos fijos, deudas y reposiciones para anticiparte a tus próximos compromisos." /><ResumenObligaciones /></section>
    <section aria-label="Análisis de movimientos" className="space-y-5">
      <div className="flex flex-col gap-3 border-b border-slate-800/90 pb-4 sm:flex-row sm:items-end sm:justify-between"><BlockTitle icon={ChartNoAxesCombined} kicker="03 · Análisis" title="Tu evolución financiera" description="Visualiza el comportamiento de tus ingresos y gastos registrados." /><span className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-700/80 bg-slate-900/70 px-3 py-2 text-[11px] font-medium text-slate-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Historial contabilizado</span></div>
      <div className="grid grid-cols-1 items-start gap-4 2xl:grid-cols-2"><ChartPanel><Suspense fallback={<div className="h-80 animate-pulse rounded-xl bg-slate-800/50" />}><GraficoIngresos /></Suspense></ChartPanel><ChartPanel><Suspense fallback={<div className="h-80 animate-pulse rounded-xl bg-slate-800/50" />}><GraficoGastos /></Suspense></ChartPanel></div>
    </section>
  </div>
}
