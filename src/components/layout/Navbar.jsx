import { LogOut, Plus, Wallet } from 'lucide-react'

export default function Navbar({ onAdd, onSignOut, activePage = 'Dashboard' }) {
  return (
    <header className="app-topbar sticky top-0 z-30 flex min-h-[4.5rem] items-center justify-between gap-3 border-b border-slate-800/80 bg-[#080F1C]/95 px-4 py-3 backdrop-blur-xl sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-400/15 bg-emerald-400/10 text-emerald-300">
          <Wallet className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.19em] text-emerald-400">Finanzas</p>
          <h1 className="truncate text-sm font-semibold text-white sm:text-base">{activePage}</h1>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-600 px-3.5 text-xs font-semibold text-white shadow-lg shadow-emerald-950/25 transition hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 sm:text-sm"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Nuevo gasto</span>
          <span className="sm:hidden">Añadir</span>
        </button>
        <button
          type="button"
          onClick={onSignOut}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-800 px-3 text-xs font-medium text-slate-400 transition hover:bg-slate-900 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          aria-label="Cerrar sesión"
          title="Cerrar sesión"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden lg:inline">Salir</span>
        </button>
      </div>
    </header>
  )
}
