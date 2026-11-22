import {
  ArrowDownCircle,
  ArrowLeftRight,
  BellRing,
  CircleDollarSign,
  CreditCard,
  CalendarDays,
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
    items: [
      { name: 'Dashboard', label: 'Resumen general', icon: Home },
      { name: 'Gastos', label: 'Gastos', icon: Receipt },
      { name: 'Ingresos', label: 'Ingresos', icon: ArrowDownCircle },
    ],
  },
  {
    label: 'Planificación',
    items: [
      { name: 'Cuentas', label: 'Cuentas y saldos', icon: Landmark },
      { name: 'Transferencias', label: 'Transferencias', icon: ArrowLeftRight },
      { name: 'Gestión financiera', label: 'Pagos y presupuestos', icon: Wallet },
      { name: 'Calendario', label: 'Calendario financiero', icon: CalendarDays },
      { name: 'Deudas', label: 'Deudas', icon: CircleDollarSign },
      { name: 'Compromisos', label: 'Reservas y reposiciones', icon: CreditCard },
    ],
  },
  {
    label: 'Automatización',
    items: [
      { name: 'Automatizaciones', label: 'Reglas automáticas', icon: Sparkles },
      { name: 'Compras pendientes', label: 'Compras por revisar', icon: ArrowLeftRight },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { name: 'Recordatorios', label: 'Avisos y recordatorios', icon: BellRing },
      { name: 'Ajustes', label: 'Centro de ajustes', icon: Settings },
    ],
  },
]

export default function Sidebar({ activePage, setActivePage, attentionCount = 0 }) {
  return (
    <aside className="app-sidebar hidden w-[16.5rem] shrink-0 flex-col border-r border-slate-800/80 bg-[#080F1C] shadow-2xl shadow-black/10 lg:sticky lg:top-0 lg:flex lg:h-screen lg:overflow-y-auto">
      <div className="flex items-center border-b border-slate-800/70 px-5 py-6">
        <img
          src="/finanzas-logo-horizontal-dark.svg"
          alt="Finanzas"
          className="h-10 w-auto max-w-full self-start object-contain"
          draggable="false"
        />
      </div>
      <nav aria-label="Navegación principal" className="flex-1 space-y-6 px-3 py-5">
        {groups.map((group) => (
          <section key={group.label} aria-label={group.label}>
            <h3 className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
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
                    onClick={() => setActivePage(item.name)}
                    className={'group relative flex min-h-10 w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ' + (
                      active
                        ? 'border-emerald-500/20 bg-emerald-500/[0.10] text-emerald-100 shadow-sm shadow-emerald-950/30'
                        : 'border-transparent text-slate-400 hover:border-slate-800/80 hover:bg-slate-900/80 hover:text-slate-100'
                    )}
                  >
                    {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-emerald-400" aria-hidden="true" />}
                    <Icon className={'h-[18px] w-[18px] shrink-0 ' + (active ? 'text-emerald-300' : 'text-slate-500 group-hover:text-slate-300')} />
                    <span className="min-w-0 flex-1 text-[13px] font-medium">{item.label}</span>
                    {item.name === 'Ajustes' && attentionCount > 0 && <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500/15 px-1.5 text-[10px] font-bold tabular-nums text-rose-300 ring-1 ring-inset ring-rose-400/30">{attentionCount > 99 ? '99+' : attentionCount}</span>}
                    {active && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.6)]" aria-hidden="true" />}
                  </button>
                )
              })}
            </div>
          </section>
        ))}
      </nav>
      <div className="m-3 mt-auto rounded-2xl border border-slate-800/80 bg-slate-900/65 p-3.5">
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
