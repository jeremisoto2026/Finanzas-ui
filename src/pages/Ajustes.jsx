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
    number: '01',
    title: 'Cuentas y dinero',
    description: 'Administra tus cuentas, saldos y compromisos.',
    icon: Wallet,
    items: [
      { page: 'Cuentas', title: 'Cuentas y saldos', description: 'Bancos, tarjetas, efectivo y monederos.', icon: Landmark },
      { page: 'Transferencias', title: 'Transferencias', description: 'Mueve dinero entre tus propias cuentas.', icon: ArrowLeftRight },
      { page: 'Deudas', title: 'Deudas', description: 'Dinero pendiente de cobrar o devolver.', icon: DollarSign },
      { page: 'Compromisos', title: 'Reservas y reposiciones', description: 'Consulta el dinero reservado y lo pendiente de reponer.', icon: CreditCard },
    ],
  },
  {
    id: 'planificacion',
    number: '02',
    title: 'Presupuestos y planificación',
    description: 'Organiza tus gastos y prepara los próximos pagos.',
    icon: CalendarDays,
    items: [
      { page: 'Gestión financiera', title: 'Pagos y presupuestos', description: 'Pagos fijos, cuotas y límites de gasto.', icon: Wallet },
      { page: 'Calendario', title: 'Calendario financiero', description: 'Vencimientos y fechas importantes.', icon: CalendarDays },
    ],
  },
  {
    id: 'automatizacion',
    number: '03',
    title: 'Automatizaciones y detección',
    description: 'Configura los procesos automáticos de Finanzas.',
    icon: Workflow,
    items: [
      { page: 'Automatizaciones', title: 'Reglas y detección automática', description: 'Reglas, aplicaciones vinculadas y permisos de captura.', icon: Settings },
      { page: 'Compras pendientes', title: 'Movimientos por revisar', description: 'Compras e ingresos detectados que esperan confirmación.', icon: Receipt },
    ],
  },
  {
    id: 'notificaciones',
    number: '04',
    title: 'Notificaciones y avisos',
    description: 'Mantente al día de lo que necesita tu atención.',
    icon: BellRing,
    items: [
      { page: 'Recordatorios', title: 'Notificaciones y recordatorios', description: 'Alertas de presupuesto, pagos, cuotas y vencimientos.', icon: BellRing },
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

function SettingsSection({ section, attentionCounts, onNavigate }) {
  const SectionIcon = section.icon

  return (
    <section
      aria-labelledby={'settings-' + section.id}
      className="group overflow-hidden rounded-2xl border border-slate-800/90 bg-slate-900/55 shadow-sm shadow-black/10 transition duration-200 hover:border-slate-700 hover:bg-slate-900/75"
    >
      <header className="flex items-start gap-3 border-b border-slate-800/80 px-4 py-4 sm:px-5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-300">
          <SectionIcon className="h-5 w-5" strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-[10px] font-bold tabular-nums tracking-[0.14em] text-emerald-400/80">{section.number}</span>
            <span className="h-px w-5 bg-slate-700" />
            <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">Configuración</span>
          </div>
          <h2 id={'settings-' + section.id} className="text-sm font-semibold tracking-tight text-slate-100 sm:text-[15px]">
            {section.title}
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-400">{section.description}</p>
        </div>
      </header>

      <div className="p-2 sm:p-2.5">
        {section.items.map((item) => {
          const Icon = item.icon
          const pendingCount = Number(attentionCounts[item.page] || 0)

          return (
            <button
              key={item.page}
              type="button"
              onClick={() => onNavigate(item.page)}
              className="group/item flex min-h-[4.4rem] w-full items-center gap-3 rounded-xl px-2.5 py-3 text-left transition-colors hover:bg-slate-800/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400 sm:px-3"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-800/90 text-slate-300 transition-colors group-hover/item:bg-emerald-500/10 group-hover/item:text-emerald-300">
                <Icon className="h-[17px] w-[17px]" strokeWidth={1.8} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-slate-100">{item.title}</span>
                <span className="mt-0.5 block text-[11px] leading-4 text-slate-400">{item.description}</span>
              </span>
              <AttentionBadge count={pendingCount} />
              <ArrowRight className="h-4 w-4 shrink-0 text-slate-600 transition-transform group-hover/item:translate-x-0.5 group-hover/item:text-emerald-300" />
            </button>
          )
        })}
      </div>
    </section>
  )
}

export default function Ajustes({ onNavigate, attentionCounts = {} }) {
  return (
    <main className="mx-auto w-full max-w-5xl space-y-5 pb-8 sm:space-y-6">
      <header className="relative overflow-hidden rounded-2xl border border-slate-800/90 bg-slate-900/55 px-5 py-5 shadow-sm sm:px-6 sm:py-6">
        <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-emerald-500/[0.06] blur-3xl" />
        <div className="relative">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-300">
              <Settings className="h-3.5 w-3.5" />
            </span>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-400">Centro de control</p>
          </div>
          <h1 className="finance-page-title">Ajustes</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
            Todo lo que puedes configurar en Finanzas, organizado para que encuentres cada opción rápidamente.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700/80 bg-slate-800/60 px-3 py-1.5 text-[11px] font-medium text-slate-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              5 áreas de configuración
            </span>
            <span className="rounded-full border border-slate-700/80 bg-slate-800/60 px-3 py-1.5 text-[11px] font-medium text-slate-400">
              Accesos directos
            </span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2 lg:gap-4">
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
          className="overflow-hidden rounded-2xl border border-slate-800/90 bg-slate-900/55 shadow-sm shadow-black/10 transition duration-200 hover:border-slate-700"
        >
          <header className="flex items-start gap-3 border-b border-slate-800/80 px-4 py-4 sm:px-5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-300">
              <ShieldCheck className="h-5 w-5" strokeWidth={1.8} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-2">
                <span className="text-[10px] font-bold tabular-nums tracking-[0.14em] text-emerald-400/80">05</span>
                <span className="h-px w-5 bg-slate-700" />
                <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">Protección</span>
              </div>
              <h2 id="settings-seguridad" className="text-sm font-semibold tracking-tight text-slate-100 sm:text-[15px]">
                Seguridad y privacidad
              </h2>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                Protege el acceso a Finanzas desde tu dispositivo.
              </p>
            </div>
          </header>
          <div className="p-3 sm:p-4">
            <AppLockSettings />
          </div>
        </section>
      </div>

      <p className="flex items-start gap-2 px-1 text-[11px] leading-5 text-slate-500">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400/80" />
        Esta pantalla solo organiza los accesos. Tus cuentas, movimientos, saldos y configuraciones se mantienen intactos.
      </p>
    </main>
  )
}
