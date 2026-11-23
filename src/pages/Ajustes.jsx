import {
  ArrowRight,
  ArrowLeftRight,
  BellRing,
  Settings,
  CreditCard,
  Wallet,
  DollarSign,
  Receipt,
  Landmark,
  CalendarDays,
  ShieldCheck,
} from 'lucide-react'

const sections = [
  {
    id: 'cuentas',
    title: 'Cuentas y dinero',
    description: 'Administra dónde está tu dinero y tus movimientos entre cuentas.',
    items: [
      { page: 'Cuentas', title: 'Mis cuentas', description: 'Bancos, tarjetas, efectivo y monederos.', icon: Landmark },
      { page: 'Transferencias', title: 'Transferencias', description: 'Movimientos entre tus propias cuentas.', icon: ArrowLeftRight },
      { page: 'Compromisos', title: 'Compromisos y reposiciones', description: 'Reservas y dinero pendiente de reponer.', icon: CreditCard },
      { page: 'Deudas', title: 'Deudas', description: 'Dinero pendiente de cobrar o devolver.', icon: DollarSign },
    ],
  },
  {
    id: 'planificacion',
    title: 'Planificación',
    description: 'Prepara tus pagos y organiza el presupuesto mensual.',
    items: [
      { page: 'Gestión financiera', title: 'Pagos y presupuestos', description: 'Pagos fijos, cuotas, presupuestos y calendario.', icon: CalendarDays },
    ],
  },
  {
    id: 'automatizacion',
    title: 'Automatización y revisión',
    description: 'Controla los procesos automáticos y revisa los movimientos dudosos.',
    items: [
      { page: 'Automatizaciones', title: 'Automatizaciones', description: 'Reglas, aplicaciones autorizadas y acceso a notificaciones.', icon: Settings },
      { page: 'Compras pendientes', title: 'Revisión de compras', description: 'Movimientos que necesitan tu confirmación.', icon: Receipt },
    ],
  },
  {
    id: 'dispositivo',
    title: 'Dispositivo, avisos y seguridad',
    description: 'Configura las alertas y los permisos del móvil.',
    items: [
      { page: 'Recordatorios', title: 'Notificaciones y recordatorios', description: 'Avisos de vencimientos, cuotas y pagos próximos.', icon: BellRing },
    ],
  },
]

function AttentionBadge({ count }) {
  if (!count) return null
  return (
    <span
      aria-label={count + ' pendientes'}
      className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-rose-500/15 px-1.5 text-[10px] font-bold tabular-nums text-rose-300 ring-1 ring-inset ring-rose-400/30"
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

export default function Ajustes({ onNavigate, attentionCounts = {} }) {
  return (
    <section className="mx-auto w-full max-w-5xl space-y-6 pb-6">
      <header className="space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-400">Centro de control</p>
        <h1 className="finance-page-title">Ajustes</h1>
        <p className="finance-muted">Todas las herramientas de Finanzas, agrupadas por función.</p>
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {sections.map((section) => (
          <section
            key={section.id}
            aria-labelledby={'settings-' + section.id}
            className="overflow-hidden rounded-2xl border border-slate-800/90 bg-slate-900/55 shadow-lg shadow-black/10"
          >
            <div className="border-b border-slate-800/80 px-4 py-3">
              <h2 id={'settings-' + section.id} className="text-sm font-semibold text-slate-100">{section.title}</h2>
              <p className="mt-0.5 text-xs leading-5 text-slate-400">{section.description}</p>
            </div>

            <div className="divide-y divide-slate-800/70 px-2">
              {section.items.map((item) => {
                const Icon = item.icon
                const pendingCount = Number(attentionCounts[item.page] || 0)
                return (
                  <button
                    key={item.page}
                    type="button"
                    onClick={() => onNavigate(item.page)}
                    className="group flex min-h-[4.35rem] w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition hover:bg-slate-800/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-500/15 bg-emerald-500/10 text-emerald-300">
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold text-slate-100">{item.title}</span>
                      <span className="mt-0.5 block text-[11px] leading-4 text-slate-400">{item.description}</span>
                    </span>
                    <AttentionBadge count={pendingCount} />
                    <ArrowRight className="h-4 w-4 shrink-0 text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-emerald-300" />
                  </button>
                )
              })}
            </div>
          </section>
        ))}
      </div>

      <AppLockSettings />\n\n      <p className="flex items-center gap-2 px-1 text-[11px] text-slate-500">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-400/80" />
        Tus opciones y permisos se mantienen; esta pantalla solo reorganiza el acceso.
      </p>
    </section>
  )
}
