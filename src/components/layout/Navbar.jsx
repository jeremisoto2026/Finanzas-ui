import { useEffect, useRef, useState } from 'react'
import { ArrowDownCircle, LogOut, Plus, Receipt } from 'lucide-react'

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
    <header className="app-topbar sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-800/80 bg-[#080F1C]/95 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <img
          src="/finanzas-logo-horizontal-dark.webp"
          alt="Finanzas"
          className="h-7 w-auto max-w-[160px] shrink-0 object-contain sm:h-8 sm:max-w-[190px]"
          draggable="false"
        />
        <span className="hidden truncate border-l border-slate-700 pl-3 text-sm font-medium text-slate-400 xl:inline-flex">
          {activePage}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <div ref={addMenuRef} className="relative">
          <button
            type="button"
            onClick={() => setAddMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={addMenuOpen}
            aria-controls="finanzas-quick-add-menu"
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-600 px-3.5 text-xs font-semibold text-white shadow-lg shadow-emerald-950/25 transition hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 sm:text-sm"
          >
            <Plus className="h-4 w-4" />
            <span>Añadir</span>
          </button>

          {addMenuOpen && (
            <div
              id="finanzas-quick-add-menu"
              role="menu"
              aria-label="Añadir movimiento"
              className="absolute right-0 top-full z-50 mt-2 w-60 rounded-2xl border border-slate-700 bg-slate-900 p-2 shadow-2xl shadow-black/40"
            >
              <p className="px-3 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                ¿Qué quieres registrar?
              </p>
              <button
                type="button"
                role="menuitem"
                onClick={() => seleccionarMovimiento('expense')}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-300">
                  <Receipt className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-white">Gasto</span>
                  <span className="mt-0.5 block text-xs text-slate-400">Registrar una salida de dinero</span>
                </span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => seleccionarMovimiento('income')}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-300">
                  <ArrowDownCircle className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-white">Ingreso</span>
                  <span className="mt-0.5 block text-xs text-slate-400">Registrar una entrada de dinero</span>
                </span>
              </button>
            </div>
          )}
        </div>
        <button type="button" onClick={onSignOut} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-800 px-3 text-xs font-medium text-slate-400 transition hover:bg-slate-900 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400" aria-label="Cerrar sesión" title="Cerrar sesión">
          <LogOut className="h-4 w-4" /><span className="hidden lg:inline">Salir</span>
        </button>
      </div>
    </header>
  )
}
