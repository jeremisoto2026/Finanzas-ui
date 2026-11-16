import {
  HomeIcon,
  ChartBarIcon,
  ArrowUpCircleIcon,
  Cog6ToothIcon,
  BanknotesIcon,
  ClipboardDocumentCheckIcon,
  WalletIcon,
} from '@heroicons/react/24/outline'

const items = [
  { name: 'Dashboard', icon: HomeIcon },
  { name: 'Gastos', icon: ChartBarIcon },
  { name: 'Ingresos', icon: ArrowUpCircleIcon },
  { name: 'Configuración', icon: Cog6ToothIcon },
  { name: 'Deudas', icon: BanknotesIcon },
  { name: 'Compromisos', icon: ClipboardDocumentCheckIcon },
]

export default function Sidebar({ mobile = false, activePage, setActivePage }) {
  return (
    <aside
      className={`flex h-full w-64 shrink-0 flex-col border-r border-slate-800/80 bg-slate-950 px-4 py-5
        ${mobile ? 'flex' : 'hidden md:sticky md:top-0 md:flex md:h-screen'}
      `}
    >
      <div className="flex items-center gap-3 px-2 pb-7">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10">
          <WalletIcon className="h-5 w-5 text-emerald-400" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-white">Finanzas</h2>
          <p className="mt-0.5 text-xs text-slate-500">Control personal y familiar</p>
        </div>
      </div>

      <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        Área principal
      </p>
      <nav aria-label="Navegación principal" className="space-y-1">
        {items.map((item) => {
          const isActive = activePage === item.name
          const Icon = item.icon
          return (
            <button
              key={item.name}
              type="button"
              aria-current={isActive ? 'page' : undefined}
              onClick={() => setActivePage(item.name)}
              className={`group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400
                ${isActive
                  ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                  : 'border-transparent text-slate-400 hover:border-slate-800 hover:bg-slate-900 hover:text-slate-100'}
              `}
            >
              <Icon className={`h-5 w-5 shrink-0 ${isActive ? 'text-emerald-400' : 'text-slate-500 group-hover:text-slate-300'}`} />
              <span>{item.name}</span>
              {isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />}
            </button>
          )
        })}
      </nav>

      <div className="mt-auto rounded-xl border border-slate-800 bg-slate-900/50 p-3">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          Libro financiero activo
        </div>
        <p className="mt-1.5 text-[11px] leading-5 text-slate-500">
          Los saldos se calculan desde movimientos contabilizados.
        </p>
      </div>
    </aside>
  )
}
