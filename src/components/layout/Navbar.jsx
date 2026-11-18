import { BellRing, Menu, Plus, WalletCards } from 'lucide-react'

export default function Navbar({ onMenu, onAdd, activePage = 'Dashboard' }) {
  return (
    <header className="app-topbar sticky top-0 z-30 flex min-h-[4.25rem] items-center justify-between border-b border-slate-800/80 bg-[#080F1C]/90 px-4 py-3 backdrop-blur-xl sm:px-6 md:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-400/15 bg-emerald-400/10 text-emerald-300">
          <WalletCards className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.19em] text-emerald-400">Finanzas</p>
          <h1 className="truncate text-sm font-semibold text-white sm:text-base">{activePage}</h1>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button type="button" onClick={onAdd} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-600 px-3.5 text-xs font-semibold text-white shadow-lg shadow-emerald-950/25 transition hover:bg-emerald-500 sm:text-sm">
          <Plus className="h-4 w-4" />
          <span className="hidden xs:inline">Nuevo gasto</span>
          <span className="xs:hidden">Añadir</span>
        </button>
        <button type="button" onClick={onMenu} aria-label="Abrir más herramientas" className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/80 text-slate-300 transition hover:border-slate-700 hover:text-white md:hidden">
          <Menu className="h-5 w-5" />
        </button>
        <div className="hidden items-center gap-2 rounded-full border border-slate-800 bg-slate-900/60 px-3 py-2 text-[11px] text-slate-400 sm:flex">
          <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.55)]" />
          Libro sincronizado
        </div>
        <BellRing className="hidden h-4 w-4 text-slate-500 md:block" />
      </div>
    </header>
  )
}
