import { lazy, Suspense, useEffect, useState } from 'react'
import { Home, Receipt, TrendingUp, Landmark, MoreHorizontal, X, ChevronRight, ArrowLeftRight, Wallet, CalendarDays, CircleDollarSign, Sparkles, ArrowDownCircle, BellRing, Settings } from 'lucide-react'
import Sidebar from './Sidebar'
import Navbar from './Navbar'
import { useSettingsAttention } from '@/hooks/useSettingsAttention'
import { consumePendingNotificationNavigation, isFinanzasAndroid } from '@/lib/native-captures'

const Dashboard = lazy(() => import('@/pages/Dashboard'))
const Gastos = lazy(() => import('@/pages/Gastos'))
const Ingresos = lazy(() => import('@/pages/Ingresos'))
const Automatizaciones = lazy(() => import('@/pages/Automatizaciones'))
const CapturasAutomaticas = lazy(() => import('@/pages/CapturasAutomaticas'))
const Configuracion = lazy(() => import('@/pages/Configuracion'))
const DeudasYReposiciones = lazy(() => import('@/pages/DeudasYReposiciones'))
const Reservas = lazy(() => import('@/pages/Reservas'))
const Recordatorios = lazy(() => import('@/pages/Recordatorios'))
const Ajustes = lazy(() => import('@/pages/Ajustes'))
const Cuentas = lazy(() => import('@/pages/Cuentas'))
const Transferencias = lazy(() => import('@/pages/Transferencias'))
const CalendarioFinanciero = lazy(() => import('@/pages/CalendarioFinanciero'))

const primaryItems = [
  { name: 'Dashboard', label: 'Inicio', icon: Home },
  { name: 'Gastos', label: 'Gastos', icon: Receipt },
  { name: 'Ingresos', label: 'Ingresos', icon: TrendingUp },
  { name: 'Cuentas', label: 'Cuentas', icon: Landmark },
  { name: 'Mas', label: 'Más', icon: MoreHorizontal },
]

const mobileSections = [
  {
    title: 'Cuentas',
    items: [
      { name: 'Transferencias', description: 'Mueve dinero entre tus propias cuentas', icon: ArrowLeftRight },
    ],
  },
  {
    title: 'Planificación',
    items: [
      { name: 'Gestión financiera', description: 'Pagos fijos, cuotas y presupuestos', icon: Wallet },
      { name: 'Calendario', description: 'Fechas importantes y vencimientos', icon: CalendarDays },
    ],
  },
  {
    title: 'Seguimiento',
    items: [
      { name: 'Deudas y reposiciones', description: 'Controla préstamos y dinero pendiente de recuperar', icon: CircleDollarSign },
      { name: 'Reservas', description: 'Consulta el dinero que has apartado', icon: Wallet },
    ],
  },
  {
    title: 'Automatización',
    items: [
      { name: 'Automatizaciones', description: 'Configura reglas para tus movimientos', icon: Sparkles },
      { name: 'Compras pendientes', description: 'Revisa movimientos detectados antes de confirmarlos', icon: ArrowDownCircle },
    ],
  },
  {
    title: 'Sistema',
    items: [
      { name: 'Recordatorios', description: 'Avisos de pagos y fechas importantes', icon: BellRing },
      { name: 'Ajustes', description: 'Seguridad y protección de la aplicación', icon: Settings },
    ],
  },
]

function PageContent({ activePage, onNavigate, attentionCounts }) {
  if (activePage === 'Dashboard') return <Dashboard />
  if (activePage === 'Gastos') return <Gastos />
  if (activePage === 'Ingresos') return <Ingresos />
  if (activePage === 'Ajustes') return <Ajustes onNavigate={onNavigate} attentionCounts={attentionCounts} />
  if (activePage === 'Recordatorios') return <Recordatorios />
  if (activePage === 'Automatizaciones') return <Automatizaciones onNavigate={onNavigate} />
  if (activePage === 'Compras pendientes') return <CapturasAutomaticas />
  if (activePage === 'Gestión financiera') return <Configuracion />
  if (activePage === 'Cuentas') return <Cuentas />
  if (activePage === 'Transferencias') return <Transferencias />
  if (activePage === 'Calendario') return <CalendarioFinanciero />
  if (activePage === 'Deudas y reposiciones') return <DeudasYReposiciones />
  if (activePage === 'Reservas') return <Reservas />
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
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false)
  const { counts: attentionCounts, total: attentionTotal, markViewed, ready: attentionReady } = useSettingsAttention()

  useEffect(() => {
    if (!attentionReady) return
    markViewed(activePage)
  }, [activePage, attentionReady, markViewed])

  const cambiarPagina = (page) => {
    setMobileMoreOpen(false)
    if (page === 'Mas') { setMobileMoreOpen(true); return }
    const legacyDebtRoute = page === 'Deudas'
    const legacyReplenishmentRoute = page === 'Compromisos'
    const targetPage = legacyDebtRoute || legacyReplenishmentRoute ? 'Deudas y reposiciones' : page

    setActivePage(targetPage)
    window.scrollTo({ top: 0, behavior: 'smooth' })

    if (legacyDebtRoute || legacyReplenishmentRoute) {
      const eventName = legacyReplenishmentRoute ? 'finanzas:show-replenishments' : 'finanzas:show-debts'
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        window.dispatchEvent(new Event(eventName))
      }))
    }
  }
  useEffect(() => {
    if (!isFinanzasAndroid()) return undefined
    let active = true
    let reading = false

    const consumeRoute = async () => {
      if (reading || !active) return
      reading = true
      try {
        const payload = await consumePendingNotificationNavigation()
        if (!active || !payload?.route) return
        if (payload.route === 'income-review') {
          cambiarPagina('Compras pendientes')
        } else if (payload.route === 'budgets') {
          cambiarPagina('Gestión financiera')
        } else if (payload.route === 'incomes') {
          cambiarPagina('Ingresos')
        } else if (payload.route === 'commitments') {
          cambiarPagina('Deudas y reposiciones')
          window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
            window.dispatchEvent(new Event('finanzas:show-replenishments'))
          }))
        } else if (payload.route === 'accounts') {
          cambiarPagina('Cuentas')
        } else if (payload.route === 'reminders') {
          cambiarPagina('Recordatorios')
        } else if (payload.route === 'expenses') {
          cambiarPagina('Gastos')
          window.__finanzasPendingExpenseFocus = payload
          window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
            window.dispatchEvent(new CustomEvent('finanzas:focus-expense', { detail: payload }))
          }))
        }
        window.dispatchEvent(new Event('finanzas:attention-refresh'))
      } catch (error) {
        console.warn('No se pudo abrir el destino de la notificación:', error?.message || error)
      } finally {
        reading = false
      }
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') void consumeRoute()
    }
    void consumeRoute()
    window.addEventListener('focus', consumeRoute)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      active = false
      window.removeEventListener('focus', consumeRoute)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])


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
      <Sidebar activePage={activePage} setActivePage={cambiarPagina} attentionCount={attentionTotal} />

      <div className="min-w-0 flex-1">
        <Navbar activePage={activePage} onAdd={abrirNuevoMovimiento} onSignOut={onSignOut} />

        <main className="app-main mx-auto min-w-0 w-full max-w-[1760px] px-3 pb-28 pt-5 sm:px-5 md:px-7 md:pt-7 lg:px-8 lg:pb-10 2xl:px-10">
          <Suspense fallback={<LoadingView />}>
            <PageContent activePage={activePage} onNavigate={cambiarPagina} attentionCounts={attentionCounts} />
          </Suspense>
        </main>
      </div>

      {mobileMoreOpen && (
        <div
          className="mobile-more-backdrop lg:hidden"
          onClick={() => setMobileMoreOpen(false)}
          onKeyDown={(event) => { if (event.key === 'Escape') setMobileMoreOpen(false) }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-more-title"
            className="mobile-more-sheet"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-emerald-400">Menú principal</p>
                <h2 id="mobile-more-title" className="mt-1 text-lg font-semibold text-white">Más secciones</h2>
                <p className="mt-1 text-xs text-slate-400">Encuentra cada herramienta según lo que necesitas hacer.</p>
              </div>
              <button type="button" onClick={() => setMobileMoreOpen(false)} aria-label="Cerrar menú" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-slate-300">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4">
              {mobileSections.map((section) => (
                <div key={section.title}>
                  <h3 className="mb-2 px-1 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">{section.title}</h3>
                  <div className="grid grid-cols-1 gap-1.5">
                    {section.items.map((item) => (
                      <button
                        key={item.name}
                        type="button"
                        onClick={() => cambiarPagina(item.name)}
                        className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-800/90 bg-slate-900/70 px-3 py-2.5 text-left transition-colors hover:border-emerald-500/25 hover:bg-slate-800/90"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-semibold text-slate-100">{item.name}</span>
                          <span className="mt-0.5 block text-[10px] leading-4 text-slate-400">{item.description}</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      <nav aria-label="Navegación móvil" className="app-bottom-nav lg:hidden">
        {primaryItems.map((item) => {
          const Icon = item.icon
          const active = item.name === 'Mas'
            ? mobileMoreOpen || !['Dashboard', 'Gastos', 'Ingresos', 'Cuentas'].includes(activePage)
            : activePage === item.name
          return (
            <button
              key={item.name}
              type="button"
              aria-current={active ? 'page' : undefined}
              aria-expanded={item.name === 'Mas' ? mobileMoreOpen : undefined}
              onClick={() => cambiarPagina(item.name)}
              className={'mobile-nav-item ' + (active ? 'is-active' : '')}
            >
              <span className="relative inline-flex">
                <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 1.8} />
                {item.name === 'Mas' && attentionTotal > 0 && <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold leading-none text-white">{attentionTotal > 99 ? '99+' : attentionTotal}</span>}
              </span>
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
