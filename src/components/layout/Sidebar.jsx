import {
  ArrowDownCircle,
  ArrowLeftRight,
  BellRing,
  CalendarDays,
  CircleDollarSign,
  Home,
  Landmark,
  Receipt,
  Settings,
  Sparkles,
  Wallet,
} from 'lucide-react'

const groups = [
  {
    label: 'Principal',
    items: [{ name: 'Dashboard', label: 'Resumen general', description: 'Tu situación financiera', icon: Home }],
  },
  {
    label: 'Movimientos',
    items: [
      { name: 'Gastos', label: 'Gastos', description: 'Salidas de dinero', icon: Receipt },
      { name: 'Ingresos', label: 'Ingresos', description: 'Entradas de dinero', icon: ArrowDownCircle },
    ],
  },
  {
    label: 'Cuentas',
    items: [
      { name: 'Cuentas', label: 'Cuentas y saldos', description: 'Dónde tienes tu dinero', icon: Landmark },
      { name: 'Transferencias', label: 'Transferencias', description: 'Entre tus propias cuentas', icon: ArrowLeftRight },
    ],
  },
  {
    label: 'Planificación',
    items: [
      { name: 'Gestión financiera', label: 'Pagos y presupuestos', description: 'Límites, cuotas y pagos fijos', icon: Wallet },
      { name: 'Calendario', label: 'Calendario financiero', description: 'Fechas y vencimientos', icon: CalendarDays },
    ],
  },
  {
    label: 'Seguimiento',
    items: [
      { name: 'Deudas y reposiciones', label: 'Deudas y reposiciones', description: 'Lo que debes o deben', icon: CircleDollarSign },
      { name: 'Reservas', label: 'Reservas de dinero', description: 'Dinero apartado para objetivos', icon: Wallet },
    ],
  },
  {
    label: 'Automatización',
    items: [
      { name: 'Automatizaciones', label: 'Reglas automáticas', description: 'Reglas para organizar movimientos', icon: Sparkles },
      { name: 'Compras pendientes', label: 'Compras por revisar', description: 'Revisa movimientos detectados', icon: ArrowLeftRight },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { name: 'Recordatorios', label: 'Avisos y recordatorios', description: 'Notificaciones importantes', icon: BellRing },
      { name: 'Ajustes', label: 'Ajustes', description: 'Seguridad y protección de la app', icon: Settings },
    ],
  },
]

export default function Sidebar({ activePage, setActivePage, attentionCount = 0 }) {
  return (
    <aside className="app-sidebar hidden w-[17rem] shrink-0 flex-col border-r border-slate-800/80 bg-[#0A1423] shadow-xl shadow-black/10 lg:sticky lg:top-0 lg:flex lg:h-screen lg:overflow-y-auto">
      <div className="border-b border-slate-800/80 px-5 pb-5 pt-6">
        <img
          src="/finanzas-logo-horizontal-dark.svg"
          alt="Finanzas"
          className="h-9 w-auto max-w-full object-contain"
          draggable="false"
        />
        <p className="mt-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-500">
          Tu espacio de gestión personal
        </p>
      </div>

      <nav aria-label="Navegación principal" className="flex-1 space-y-5 px-3 py-5">
        {groups.map((group) => (
          <section key={group.label} aria-label={group.label}>
            <h3 className="mb-2 px-3 text-[9px] font-bold uppercase tracking-[0.19em] text-slate-500">
              {group.label}
            </h3>
            <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon
                const active = activePage === item.name
                return (
                  <button
                    key={item.name}
                    type="button"
                    aria-current={active ? 'page' : undefined}
                    aria-label={item.label + '. ' + item.description}
                    title={item.description}
                    onClick={() => setActivePage(item.name)}
                    className={'group relative flex min-h-[3.45rem] w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ' + (
                      active
                        ? 'border-emerald-400/20 bg-emerald-400/[0.10] text-white shadow-sm shadow-emerald-950/20'
                        : 'border-transparent text-slate-300 hover:border-slate-700/70 hover:bg-slate-800/60 hover:text-white'
                    )}
                  >
                    {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-emerald-400" aria-hidden="true" />}
                    <span className={'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ' + (
                      active ? 'bg-emerald-400/15 text-emerald-300' : 'bg-slate-800/70 text-slate-400 group-hover:bg-slate-700/80 group-hover:text-slate-200'
                    )}>
                      <Icon className="h-[17px] w-[17px]" strokeWidth={1.9} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-semibold leading-4">{item.label}</span>
                      <span className={'mt-0.5 block truncate text-[10px] leading-4 ' + (active ? 'text-emerald-100/70' : 'text-slate-500')}>
                        {item.description}
                      </span>
                    </span>
                    {item.name === 'Ajustes' && attentionCount > 0 && (
                      <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-rose-500/15 px-1.5 text-[10px] font-bold tabular-nums text-rose-300 ring-1 ring-inset ring-rose-400/30">
                        {attentionCount > 99 ? '99+' : attentionCount}
                      </span>
                    )}
                    {active && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" aria-hidden="true" />}
                  </button>
                )
              })}
            </div>
          </section>
        ))}
      </nav>

      <div className="m-3 mt-auto rounded-xl border border-slate-800/90 bg-slate-900/60 p-3.5">
        <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-200">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          Datos financieros organizados
        </div>
        <p className="mt-2 text-[10px] leading-[1.6] text-slate-400">
          Los movimientos actualizan los saldos. Las reservas y los presupuestos se muestran por separado.
        </p>
      </div>
    </aside>
  )
}
