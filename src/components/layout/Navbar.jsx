import { useEffect, useRef, useState } from 'react'
import { ArrowDownCircle, LogOut, Plus, Receipt, ChevronDown, Sparkles } from 'lucide-react'

const pageLabels = {
  Dashboard: 'Resumen de tus finanzas',
  Gastos: 'Control de gastos',
  Ingresos: 'Control de ingresos',
  Ajustes: 'Preferencias y configuración',
  Calendario: 'Planificación financiera',
  Cuentas: 'Tus cuentas y saldos',
  Transferencias: 'Movimientos entre cuentas',
  Deudas: 'Seguimiento de deudas',
  Compromisos: 'Reservas y reposiciones',
  Recordatorios: 'Avisos y recordatorios',
  Automatizaciones: 'Reglas automáticas',
  'Compras pendientes': 'Revisión de movimientos',
  'Gestión financiera': 'Pagos y presupuestos',
}

export default function Navbar({ onAdd, onSignOut, activePage = 'Dashboard' }) {
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const addMenuRef = useRef(null)

  useEffect(() => {
    if (!addMenuOpen) return undefined
    const closeOnOutsidePress = (event) => {
      if (!addMenuRef.current?.contains(event.target)) setAddMenuOpen(false)
    }
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setAddMenuOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePress)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [addMenuOpen])

  const seleccionarMovimiento = (tipo) => {
    setAddMenuOpen(false)
    onAdd?.(tipo)
  }

  return (
    <header className="app-topbar sticky top-0 z-40 flex items-center justify-between gap-3 px-3 sm:px-5 lg:px-8">
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <img
          src="/finanzas-logo-horizontal-dark.svg"
          alt="Finanzas"
          className="h-7 w-auto max-w-[142px] shrink-0 object-contain sm:h-8 sm:max-w-[175px]"
          draggable="false"
        />
        <span className="app-topbar-divider hidden h-8 w-px md:block" aria-hidden="true" />
        <div className="hidden min-w-0 md:block">
          <p className="truncate text-sm font-semibold tracking-tight text-slate-100">{activePage}</p>
          <p className="mt-0.5 truncate text-[11px] text-slate-500">{pageLabels[activePage] || 'Tu espacio financiero'}</p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <div ref={addMenuRef} className="relative">
          <button
            type="button"
            onClick={() => setAddMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={addMenuOpen}
            aria-controls="finanzas-quick-add-menu"
            className="topbar-add-button inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3.5 text-xs font-semibold text-white transition sm:px-4 sm:text-sm"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            <span>Añadir</span>
            <ChevronDown className={'hidden h-3.5 w-3.5 opacity-75 transition sm:block ' + (addMenuOpen ? 'rotate-180' : '')} />
          </button>

          {addMenuOpen && (
            <div
              id="finanzas-quick-add-menu"
              role="menu"
              aria-label="Añadir movimiento"
              className="quick-add-menu absolute right-0 top-full z-50 mt-3 w-[min(18rem,calc(100vw-1.5rem))] rounded-2xl p-2.5"
            >
              <div className="flex items-center gap-2 px-3 pb-2.5 pt-1">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-300"><Sparkles className="h-3.5 w-3.5" /></span>
                <div>
                  <p className="text-xs font-semibold text-slate-100">Nuevo movimiento</p>
                  <p className="text-[10px] text-slate-500">Elige qué quieres registrar</p>
                </div>
              </div>
              <button
                type="button"
                role="menuitem"
                onClick={() => seleccionarMovimiento('expense')}
                className="quick-add-option flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-300"><Receipt className="h-5 w-5" /></span>
                <span className="min-w-0"><span className="block text-sm font-semibold text-white">Registrar gasto</span><span className="mt-0.5 block text-xs text-slate-400">Añadir una salida de dinero</span></span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => seleccionarMovimiento('income')}
                className="quick-add-option flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-300"><ArrowDownCircle className="h-5 w-5" /></span>
                <span className="min-w-0"><span className="block text-sm font-semibold text-white">Registrar ingreso</span><span className="mt-0.5 block text-xs text-slate-400">Añadir una entrada de dinero</span></span>
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="topbar-signout inline-flex h-10 items-center justify-center gap-2 rounded-xl px-3 text-xs font-medium transition"
          aria-label="Cerrar sesión"
          title="Cerrar sesión"
        >
          <LogOut className="h-4 w-4" /><span className="hidden lg:inline">Salir</span>
        </button>
      </div>
    </header>
  )
}
