import {
  HomeIcon,
  ChartBarIcon,
  ArrowUpCircleIcon,
  Cog6ToothIcon,
  BanknotesIcon,
} from '@heroicons/react/24/outline'

const items = [
  { name: 'Dashboard', icon: HomeIcon },
  { name: 'Gastos', icon: ChartBarIcon },
  { name: 'Ingresos', icon: ArrowUpCircleIcon },
  { name: 'Ajustes', icon: Cog6ToothIcon },
]

export default function Sidebar({ mobile = false, activePage, setActivePage }) {
  return (
    <aside
      className={`flex h-full w-[17rem] shrink-0 flex-col border-r border-slate-800/70 bg-gradient-to-b from-slate-900/95 via-slate-950 to-slate-950 px-4 py-5 shadow-xl shadow-black/10
        ${mobile ? 'flex' : 'hidden md:sticky md:top-0 md:flex md:h-screen'}
      `}
    >
      <div className="flex items-center gap-3 px-2 pb-8">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-400/20 bg-gradient-to-br from-emerald-400/15 to-emerald-900/10 shadow-inner shadow-emerald-400/5">
          <BanknotesIcon className="h-6 w-6 text-emerald-300" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-white">Finanzas</h2>
          <p className="mt-0.5 text-[11px] text-slate-500">Finanzas personales y familiares</p>
        </div>
      </div>

      <div className="mb-3 px-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Área principal</p>
        <p className="mt-1 text-[11px] text-slate-600">Cuentas, movimientos y planificación</p>
      </div>
      <nav aria-label="Navegación principal" className="space-y-1">
        {items.map((item) => {
          const isSettingsPage = item.name === 'Ajustes' && ['Recordatorios', 'Automatizaciones', 'Compras pendientes', 'Gestión financiera', 'Cuentas', 'Deudas', 'Compromisos'].includes(activePage)
          const isActive = activePage === item.name || isSettingsPage
          const Icon = item.icon
          return (
            <button
              key={item.name}
              type="button"
              aria-current={isActive ? 'page' : undefined}
              onClick={() => setActivePage(item.name)}
              className={`group relative flex w-full items-center gap-3 rounded-xl border px-3 py-3.5 text-left text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400
                ${isActive
                  ? 'border-emerald-500/20 bg-emerald-500/[0.09] text-emerald-200 shadow-sm shadow-emerald-950/30'
                  : 'border-transparent text-slate-400 hover:border-slate-800/80 hover:bg-slate-900/80 hover:text-slate-100'}
              `}
            >
              {isActive && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-emerald-400" aria-hidden="true" />}
              <Icon className={`h-5 w-5 shrink-0 transition-colors ${isActive ? 'text-emerald-300' : 'text-slate-500 group-hover:text-slate-300'}`} />
              <span>{item.name}</span>
              {isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.6)]" aria-hidden="true" />}
            </button>
          )
        })}
      </nav>

      <div className="mt-auto rounded-2xl border border-slate-800/80 bg-slate-900/65 p-3.5">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-200">
          <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_9px_rgba(52,211,153,0.55)]" />
          Libro financiero activo
        </div>
        <p className="mt-2 text-[11px] leading-5 text-slate-500">
          Los saldos se calculan con movimientos contabilizados y fechas efectivas.
        </p>
      </div>
    </aside>
  )
}
