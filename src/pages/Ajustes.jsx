import AppLockSettings from '@/components/AppLockSettings'
import {
  ArrowRight,
  ArrowLeftRight,
  BellRing,
  CalendarDays,
  CreditCard,
  DollarSign,
  Landmark,
  Receipt,
  Settings,
  ShieldCheck,
  Wallet,
  Workflow,
} from 'lucide-react'

const sections = [
  {
    id: 'cuentas',
    title: 'Cuentas y dinero',
    description: 'Administra tus cuentas, saldos y compromisos de dinero.',
    icon: Wallet,
    tone: 'blue',
    items: [
      { page: 'Cuentas', title: 'Cuentas y saldos', description: 'Bancos, tarjetas, efectivo y monederos.', icon: Landmark },
      { page: 'Transferencias', title: 'Transferencias', description: 'Mueve dinero entre tus propias cuentas.', icon: ArrowLeftRight },
      { page: 'Deudas', title: 'Deudas', description: 'Controla el dinero pendiente de cobrar o devolver.', icon: DollarSign },
      { page: 'Compromisos', title: 'Reservas y reposiciones', description: 'Consulta el dinero reservado y lo pendiente de reponer.', icon: CreditCard },
    ],
  },
  {
    id: 'planificacion',
    title: 'Presupuestos y planificación',
    description: 'Organiza tus gastos futuros y controla los límites mensuales.',
    icon: CalendarDays,
    tone: 'emerald',
    items: [
      { page: 'Gestión financiera', title: 'Pagos y presupuestos', description: 'Pagos fijos, compras a cuotas y presupuestos.', icon: Wallet },
      { page: 'Calendario', title: 'Calendario financiero', description: 'Consulta vencimientos y fechas importantes.', icon: CalendarDays },
    ],
  },
  {
    id: 'automatizacion',
    title: 'Automatizaciones y detección',
    description: 'Configura las tareas automáticas y revisa lo que detecta Finanzas.',
    icon: Workflow,
    tone: 'violet',
    items: [
      { page: 'Automatizaciones', title: 'Reglas y detección automática', description: 'Reglas, aplicaciones bancarias vinculadas y permisos de captura.', icon: Settings },
      { page: 'Compras pendientes', title: 'Movimientos por revisar', description: 'Compras e ingresos detectados que necesitan tu confirmación.', icon: Receipt },
    ],
  },
  {
    id: 'notificaciones',
    title: 'Notificaciones y avisos',
    description: 'Decide qué avisos quieres recibir y cómo mantenerte al día.',
    icon: BellRing,
    tone: 'amber',
    items: [
      { page: 'Recordatorios', title: 'Notificaciones y recordatorios', description: 'Alertas de presupuesto, pagos, cuotas y vencimientos.', icon: BellRing },
    ],
  },
]

const toneClasses = {
  blue: 'border-blue-500/20 bg-blue-500/10 text-blue-300',
  emerald: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
  violet: 'border-violet-500/20 bg-violet-500/10 text-violet-300',
  amber: 'border-amber-500/20 bg-amber-500/10 text-amber-300',
}

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

function SettingsSection({ section, attentionCounts, onNavigate }) {
  const SectionIcon = section.icon
  return (
    <section
      aria-labelledby={'settings-' + section.id}
      className="overflow-hidden rounded-2xl border border-slate-800/90 bg-slate-900/55 shadow-lg shadow-black/10"
    >
      <div className="flex items-start gap-3 border-b border-slate-800/80 px-4 py-4">
        <span className={'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ' + toneClasses[section.tone]}>
          <SectionIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={'settings-' + section.id} className="text-sm font-semibold text-slate-100">{section.title}</h2>
          <p className="mt-1 text-xs leading-5 text-slate-400">{section.description}</p>
        </div>
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
              className="group flex min-h-[4.5rem] w-full items-center gap-3 rounded-xl px-2.5 py-3 text-left transition hover:bg-slate-800/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-800/80 text-slate-300 transition group-hover:bg-slate-700 group-hover:text-white">
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
  )
}

export default function Ajustes({ onNavigate, attentionCounts = {} }) {
  return (
    <section className="mx-auto w-full max-w-5xl space-y-6 pb-6">
      <header className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-400">Centro de control</p>
        <h1 className="finance-page-title">Ajustes</h1>
        <p className="max-w-2xl text-sm leading-6 text-slate-400">
          Todo lo que puedes configurar en Finanzas, organizado por temas para que encuentres cada opción fácilmente.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {sections.map((section) => (
          <SettingsSection
            key={section.id}
            section={section}
            attentionCounts={attentionCounts}
            onNavigate={onNavigate}
          />
        ))}

        <section
          aria-labelledby="settings-seguridad"
          className="overflow-hidden rounded-2xl border border-slate-800/90 bg-slate-900/55 shadow-lg shadow-black/10"
        >
          <div className="flex items-start gap-3 border-b border-slate-800/80 px-4 py-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-300">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="settings-seguridad" className="text-sm font-semibold text-slate-100">Seguridad y privacidad</h2>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                Protege el acceso a Finanzas desde tu dispositivo.
              </p>
            </div>
          </div>
          <div className="p-3">
            <AppLockSettings />
          </div>
        </section>
      </div>

      <p className="flex items-center gap-2 px-1 text-[11px] leading-5 text-slate-500">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-400/80" />
        Esta organización conserva las funciones existentes y no modifica tus cuentas ni movimientos.
      </p>
    </section>
  )
}
