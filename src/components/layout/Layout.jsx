import { lazy, Suspense, useState } from 'react'
import {
  BellRing,
  TrendingUp,
  MoreHorizontal,
  CreditCard,
  DollarSign,
  Home,
  Receipt,
  Settings,
  Smartphone,
  Wallet,
  X,
} from 'lucide-react'
import Sidebar from './Sidebar'
import Navbar from './Navbar'

const Dashboard = lazy(() => import('@/pages/Dashboard'))
const Gastos = lazy(() => import('@/pages/Gastos'))
const Ingresos = lazy(() => import('@/pages/Ingresos'))
const Automatizaciones = lazy(() => import('@/pages/Automatizaciones'))
const CapturasAutomaticas = lazy(() => import('@/pages/CapturasAutomaticas'))
const Configuracion = lazy(() => import('@/pages/Configuracion'))
const Deudas = lazy(() => import('@/pages/Deudas'))
const Compromisos = lazy(() => import('@/pages/Compromisos'))
const Recordatorios = lazy(() => import('@/pages/Recordatorios'))

const primaryItems = [
  { name: 'Dashboard', label: 'Inicio', icon: Home },
  { name: 'Gastos', label: 'Gastos', icon: Receipt },
  { name: 'Ingresos', label: 'Ingresos', icon: TrendingUp },
  { name: 'Recordatorios', label: 'Avisos', icon: BellRing },
]

const moreItems = [
  { name: 'Automatizaciones', description: 'Reglas y procesos automáticos', icon: Settings },
  { name: 'Capturas automáticas', description: 'Compras detectadas en el móvil', icon: Smartphone },
  { name: 'Gestión financiera', description: 'Pagos fijos, cuotas y presupuestos', icon: Wallet },
  { name: 'Deudas', description: 'Dinero por cobrar o devolver', icon: DollarSign },
  { name: 'Compromisos', description: 'Reservas y dinero por reponer', icon: CreditCard },
]

function PageContent({ activePage }) {
  if (activePage === 'Dashboard') return <Dashboard />
  if (activePage === 'Gastos') return <Gastos />
  if (activePage === 'Ingresos') return <Ingresos />
  if (activePage === 'Recordatorios') return <Recordatorios />
  if (activePage === 'Automatizaciones') return <Automatizaciones />
  if (activePage === 'Capturas automáticas') return <CapturasAutomaticas />
  if (activePage === 'Gestión financiera') return <Configuracion />
  if (activePage === 'Deudas') return <Deudas />
  if (activePage === 'Compromisos') return <Compromisos />
  return <Dashboard />
}

function LoadingView() {
  return (
    <div role="status" className="mx-auto flex min-h-64 max-w-7xl items-center justify-center">
      <div className="w-full max-w-md animate-pulse space-y-3">
        <div className="h-5 w-40 rounded-lg bg-slate-800" />
        <div className="h-3 w-64 max-w-full rounded-lg bg-slate-800/80" />
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="h-36 rounded-2xl border border-slate-800 bg-slate-900/60" />
          <div className="h-36 rounded-2xl border border-slate-800 bg-slate-900/60" />
        </div>
      </div>
    </div>
  )
}

export default function Layout({ onSignOut }) {
  const [activePage, setActivePage] = useState('Dashboard')
  const [moreOpen, setMoreOpen] = useState(false)

  const cambiarPagina = (page) => {
    setActivePage(page)
    setMoreOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const isMoreActive = moreItems.some((item) => item.name === activePage)

  return (
    <div className="app-shell min-h-screen text-slate-100 md:flex">
      <Sidebar activePage={activePage} setActivePage={cambiarPagina} />

      <div className="min-w-0 flex-1">
        <Navbar activePage={activePage} onMenu={() => setMoreOpen(true)} onAdd={() => cambiarPagina('Gastos')} onSignOut={onSignOut} />

        <main className="app-main mx-auto min-w-0 w-full max-w-[1600px] px-3 py-5 sm:px-5 md:px-7 md:py-7 xl:px-9">
          <Suspense fallback={<LoadingView />}>
            <PageContent activePage={activePage} />
          </Suspense>
        </main>
      </div>

      <nav aria-label="Navegación móvil" className="app-bottom-nav md:hidden">
        {primaryItems.map((item) => {
          const Icon = item.icon
          const active = activePage === item.name
          return (
            <button
              key={item.name}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => cambiarPagina(item.name)}
              className={'mobile-nav-item ' + (active ? 'is-active' : '')}
            >
              <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 1.8} />
              <span>{item.label}</span>
            </button>
          )
        })}
        <button
          type="button"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen(true)}
          className={'mobile-nav-item ' + (isMoreActive || moreOpen ? 'is-active' : '')}
        >
          <MoreHorizontal className="h-5 w-5" />
          <span>Más</span>
        </button>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-[70] flex items-end md:hidden" role="presentation">
          <button type="button" aria-label="Cerrar menú" className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm" onClick={() => setMoreOpen(false)} />
          <section role="dialog" aria-modal="true" aria-labelledby="more-menu-title" className="relative z-10 w-full rounded-t-[1.75rem] border border-slate-700/80 bg-[#0b1422] px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-4 shadow-2xl">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-600" />
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 id="more-menu-title" className="text-base font-semibold text-white">Más herramientas</h2>
                <p className="mt-1 text-xs text-slate-400">Gestión y control de tus finanzas</p>
              </div>
              <button type="button" aria-label="Cerrar" onClick={() => setMoreOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 text-slate-300"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {moreItems.map((item) => {
                const Icon = item.icon
                const active = activePage === item.name
                return (
                  <button key={item.name} type="button" onClick={() => cambiarPagina(item.name)} className={'flex min-h-[4.5rem] items-center gap-3 rounded-2xl border p-3 text-left transition ' + (active ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-slate-800 bg-slate-900/65 hover:bg-slate-800')}>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-emerald-300"><Icon className="h-5 w-5" /></span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-slate-100">{item.name}</span>
                      <span className="mt-1 block text-xs leading-4 text-slate-400">{item.description}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
