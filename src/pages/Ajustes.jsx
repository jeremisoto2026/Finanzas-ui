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
} from 'lucide-react'

const sections = [
  {
    title: 'Finanzas',
    description: 'Organiza cuentas, compromisos y planificación.',
    items: [
      { page: 'Cuentas', title: 'Mis cuentas', description: 'Bancos, tarjetas, efectivo y monederos personalizados.', icon: Landmark },
      { page: 'Transferencias', title: 'Transferencias', description: 'Mueve dinero entre tus propias cuentas sin registrarlo como ingreso ni gasto.', icon: ArrowLeftRight },
      { page: 'Gestión financiera', title: 'Pagos y presupuestos', description: 'Pagos fijos, cuotas y planificación mensual.', icon: Wallet },
      { page: 'Deudas', title: 'Deudas', description: 'Control de dinero pendiente de cobrar o devolver.', icon: DollarSign },
      { page: 'Compromisos', title: 'Compromisos y reposiciones', description: 'Reservas y dinero que quieres reponer.', icon: CreditCard },
    ],
  },
  {
    title: 'Automatización',
    description: 'Reduce tareas manuales y mantén tu control financiero al día.',
    items: [
      { page: 'Automatizaciones', title: 'Automatizaciones', description: 'Reglas y procesos automáticos de Finanzas.', icon: Settings },
      { page: 'Compras pendientes', title: 'Revisión de compras', description: 'Solo los pagos que no se pudieron registrar con seguridad.', icon: Receipt },
    ],
  },
  {
    title: 'Dispositivo y avisos',
    description: 'Configura los avisos y las funciones de tus dispositivos.',
    items: [
      { page: 'Recordatorios', title: 'Notificaciones y recordatorios', description: 'Avisos de vencimientos, cuotas y pagos próximos.', icon: BellRing },
    ],
  },
]

export default function Ajustes({ onNavigate }) {
  return (
    <section className="mx-auto w-full max-w-5xl space-y-7 pb-6">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">Centro de control</p>
        <h1 className="finance-page-title">Ajustes</h1>
        <p className="finance-muted">Todo lo que configura y amplía tu espacio financiero, organizado en un solo lugar.</p>
      </header>

      {sections.map((section) => (
        <section key={section.title} className="space-y-3">
          <div>
            <h2 className="text-base font-semibold text-white">{section.title}</h2>
            <p className="mt-1 text-xs leading-5 text-slate-400">{section.description}</p>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {section.items.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.page}
                  type="button"
                  onClick={() => onNavigate(item.page)}
                  className="group flex min-h-[6.1rem] items-center gap-4 rounded-2xl border border-slate-800 bg-slate-900/65 p-4 text-left shadow-lg shadow-black/10 transition hover:border-emerald-500/35 hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-emerald-500/15 bg-emerald-500/10 text-emerald-300">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-100">{item.title}</span>
                    <span className="mt-1 block text-xs leading-5 text-slate-400">{item.description}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-emerald-300" />
                </button>
              )
            })}
          </div>
        </section>
      ))}
    </section>
  )
}
