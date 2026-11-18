import { lazy, Suspense, useState } from 'react'
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

export default function Layout() {
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [activePage, setActivePage] = useState('Dashboard')

  const cambiarPagina = (page) => {
    setActivePage(page)
    setMenuAbierto(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="min-h-screen text-slate-100 md:flex">
      <Sidebar activePage={activePage} setActivePage={cambiarPagina} />

      <div className="min-w-0 flex-1">
        <Navbar onMenu={() => setMenuAbierto(true)} />

        {menuAbierto && (
          <div className="fixed inset-0 z-50 flex md:hidden">
            <button
              type="button"
              aria-label="Cerrar menú de navegación"
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => setMenuAbierto(false)}
            />
            <div className="relative z-10 h-full">
              <Sidebar mobile activePage={activePage} setActivePage={cambiarPagina} />
            </div>
          </div>
        )}

        <main className="min-w-0 px-3 py-5 sm:px-5 md:px-7 md:py-7 xl:px-9">
          <Suspense
            fallback={
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
            }
          >
            {activePage === 'Dashboard' && <Dashboard />}
            {activePage === 'Gastos' && <Gastos />}
            {activePage === 'Ingresos' && <Ingresos />}
            {activePage === 'Automatizaciones' && <Automatizaciones />}
            {activePage === 'Capturas automáticas' && <CapturasAutomaticas />}
            {activePage === 'Gestión financiera' && <Configuracion />}
            {activePage === 'Deudas' && <Deudas />}
            {activePage === 'Compromisos' && <Compromisos />}
          </Suspense>
        </main>
      </div>
    </div>
  )
}
