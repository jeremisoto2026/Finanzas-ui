import { lazy, Suspense, useState } from 'react'
import { Home, Receipt, TrendingUp, Settings } from 'lucide-react'
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
const Ajustes = lazy(() => import('@/pages/Ajustes'))
const Cuentas = lazy(() => import('@/pages/Cuentas'))

const primaryItems = [
  { name: 'Dashboard', label: 'Inicio', icon: Home },
  { name: 'Gastos', label: 'Gastos', icon: Receipt },
  { name: 'Ingresos', label: 'Ingresos', icon: TrendingUp },
  { name: 'Ajustes', label: 'Ajustes', icon: Settings },
]

function PageContent({ activePage, onNavigate }) {
  if (activePage === 'Dashboard') return <Dashboard />
  if (activePage === 'Gastos') return <Gastos />
  if (activePage === 'Ingresos') return <Ingresos />
  if (activePage === 'Ajustes') return <Ajustes onNavigate={onNavigate} />
  if (activePage === 'Recordatorios') return <Recordatorios />
  if (activePage === 'Automatizaciones') return <Automatizaciones onNavigate={onNavigate} />
  if (activePage === 'Compras pendientes') return <CapturasAutomaticas />
  if (activePage === 'Gestión financiera') return <Configuracion />
  if (activePage === 'Cuentas') return <Cuentas />
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

  const cambiarPagina = (page) => {
    setActivePage(page)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const abrirNuevoMovimiento = async (tipo = 'expense') => {
    const esIngreso = tipo === 'income'
    const pagina = esIngreso ? 'Ingresos' : 'Gastos'
    const evento = esIngreso ? 'finanzas:open-new-income' : 'finanzas:open-new-expense'

    if (esIngreso) {
      await import('@/pages/Ingresos')
    } else {
      await import('@/pages/Gastos')
    }

    cambiarPagina(pagina)
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      window.dispatchEvent(new Event(evento))
    }))
  }

  return (
    <div className="app-shell min-h-screen text-slate-100 lg:flex">
      <Sidebar activePage={activePage} setActivePage={cambiarPagina} />

      <div className="min-w-0 flex-1">
        <Navbar activePage={activePage} onAdd={abrirNuevoMovimiento} onSignOut={onSignOut} />

        <main className="app-main mx-auto min-w-0 w-full max-w-[1760px] px-3 pb-28 pt-5 sm:px-5 md:px-7 md:pt-7 lg:px-8 lg:pb-10 2xl:px-10">
          <Suspense fallback={<LoadingView />}>
            <PageContent activePage={activePage} onNavigate={cambiarPagina} />
          </Suspense>
        </main>
      </div>

      <nav aria-label="Navegación móvil" className="app-bottom-nav lg:hidden">
        {primaryItems.map((item) => {
          const Icon = item.icon
          const active = activePage === item.name || (item.name === 'Ajustes' && [
            'Recordatorios',
            'Automatizaciones',
            'Compras pendientes',
            'Gestión financiera',
            'Cuentas',
            'Deudas',
            'Compromisos',
          ].includes(activePage))
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
      </nav>
    </div>
  )
}
