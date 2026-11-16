import { Bars3Icon } from '@heroicons/react/24/outline'

export default function Navbar({ onMenu }) {
  return (
    <header className="flex items-center justify-between border-b border-slate-800 bg-slate-950 px-4 py-3 md:hidden">
      <button
        type="button"
        onClick={onMenu}
        aria-label="Abrir menú de navegación"
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-slate-300 transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
      >
        <Bars3Icon className="h-5 w-5" />
      </button>

      <div className="text-center">
        <h1 className="text-sm font-semibold text-emerald-400">Finanzas</h1>
        <p className="mt-0.5 text-[10px] text-slate-500">Control personal y familiar</p>
      </div>

      <span className="flex h-10 w-10 items-center justify-center" aria-label="Libro de cuentas activo">
        <span className="h-2 w-2 rounded-full bg-emerald-400" />
      </span>
    </header>
  )
}
