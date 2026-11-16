import { lazy, Suspense, useState } from 'react'
import Sidebar from './Sidebar'
import Navbar from './Navbar'
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const Gastos = lazy(() => import('@/pages/Gastos'))
const Ingresos = lazy(() => import('@/pages/Ingresos'))
const Configuracion = lazy(() => import('@/pages/Configuracion'))
const Deudas = lazy(() => import('@/pages/Deudas'))
const Compromisos = lazy(() => import('@/pages/Compromisos'))

export default function Layout() {
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [activePage, setActivePage] = useState('Dashboard')

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 md:flex">
      
      {/* Sidebar desktop ✅ */}
      <Sidebar
        activePage={activePage}
        setActivePage={setActivePage}
      />

      <div className="min-w-0 flex-1">
        <Navbar onMenu={() => setMenuAbierto(true)} />

        {/* Sidebar móvil ✅ */}
        {menuAbierto && (
          <div className="fixed inset-0 z-50 md:hidden flex">
            <button
              type="button"
              aria-label="Cerrar menú de navegación"
              className="absolute inset-0 cursor-default bg-black/60"
              onClick={() => setMenuAbierto(false)}
            />
            <div className="relative z-10 h-full w-64">
              <Sidebar
                mobile
                activePage={activePage}
                setActivePage={(page) => {
                  setActivePage(page)
                  setMenuAbierto(false)
                }}
              />
            </div>
          </div>
        )}

        <main className="min-w-0 p-4 md:p-6">
          <Suspense
            fallback={
              <div role="status" className="mx-auto flex min-h-64 max-w-7xl items-center justify-center">
                <div className="w-full max-w-md animate-pulse space-y-3">
                  <div className="h-5 w-40 rounded bg-slate-800" />
                  <div className="h-3 w-64 max-w-full rounded bg-slate-800/80" />
                  <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="h-36 rounded-xl border border-slate-800 bg-slate-900/60" />
                    <div className="h-36 rounded-xl border border-slate-800 bg-slate-900/60" />
                  </div>
                </div>
              </div>
            }
          >
            {activePage === 'Dashboard' && <Dashboard />}
            {activePage === 'Gastos' && <Gastos />}
            {activePage === 'Ingresos' && <Ingresos />}
            {activePage === 'Configuración' && <Configuracion />}
            {activePage === 'Deudas' && <Deudas />}
            {activePage === 'Compromisos' && <Compromisos />}
          </Suspense>
        </main>
      </div>
    </div>
  )
}