import { useMemo, useState } from 'react'
import AppLockSettings from '@/components/AppLockSettings'
import {
  ArrowRight,
  ArrowLeftRight,
  BellRing,
  CalendarDays,
  CreditCard,
  DollarSign,
  Landmark,
  LockKeyhole,
  Receipt,
  Search,
  Settings,
  ShieldCheck,
  Wallet,
  Workflow,
  X,
} from 'lucide-react'

const sections = [
  {
    id: 'cuentas',
    number: '01',
    eyebrow: 'GESTIÓN DEL DINERO',
    title: 'Cuentas y dinero',
    description: 'Controla dónde está tu dinero y cómo se mueve.',
    icon: Wallet,
    items: [
      { page: 'Cuentas', title: 'Cuentas y saldos', description: 'Bancos, tarjetas, efectivo y monederos.', icon: Landmark, keywords: 'cuentas bancos tarjetas efectivo saldo' },
      { page: 'Transferencias', title: 'Transferencias', description: 'Movimientos entre tus propias cuentas.', icon: ArrowLeftRight, keywords: 'transferir mover dinero' },
      { page: 'Deudas', title: 'Deudas', description: 'Importes pendientes de cobrar o devolver.', icon: DollarSign, keywords: 'préstamos cobrar devolver' },
      { page: 'Compromisos', title: 'Reservas y reposiciones', description: 'Dinero reservado y cantidades por reponer.', icon: CreditCard, keywords: 'reservas apartados reposiciones' },
    ],
  },
  {
    id: 'planificacion',
    number: '02',
    eyebrow: 'ORGANIZACIÓN',
    title: 'Presupuestos y planificación',
    description: 'Anticípate a tus gastos y próximos vencimientos.',
    icon: CalendarDays,
    items: [
      { page: 'Gestión financiera', title: 'Pagos y presupuestos', description: 'Pagos fijos, cuotas y límites de gasto.', icon: Wallet, keywords: 'presupuesto pagos cuotas gastos' },
      { page: 'Calendario', title: 'Calendario financiero', description: 'Fechas importantes y próximos vencimientos.', icon: CalendarDays, keywords: 'calendario fechas vencimientos' },
    ],
  },
  {
    id: 'automatizacion',
    number: '03',
    eyebrow: 'CONTROL INTELIGENTE',
    title: 'Automatizaciones y detección',
    description: 'Ajusta cómo Finanzas identifica y procesa movimientos.',
    icon: Workflow,
    items: [
      { page: 'Automatizaciones', title: 'Reglas y detección automática', description: 'Reglas, aplicaciones vinculadas y permisos de captura.', icon: Settings, keywords: 'automatización detección reglas aplicaciones permisos' },
      { page: 'Compras pendientes', title: 'Movimientos por revisar', description: 'Compras e ingresos detectados pendientes de confirmar.', icon: Receipt, keywords: 'compras ingresos revisar detectar' },
    ],
  },
  {
    id: 'notificaciones',
    number: '04',
    eyebrow: 'SEGUIMIENTO',
    title: 'Notificaciones y avisos',
    description: 'Decide cómo estar al tanto de lo importante.',
    icon: BellRing,
    items: [
      { page: 'Recordatorios', title: 'Notificaciones y recordatorios', description: 'Avisos de presupuesto, pagos, cuotas y vencimientos.', icon: BellRing, keywords: 'alertas avisos notificaciones recordatorios' },
    ],
  },
]

function AttentionBadge({ count }) {
  if (!count) return null

  return (
    <span
      aria-label={count + ' pendientes'}
      className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-rose-500/15 px-1.5 text-[10px] font-bold tabular-nums text-rose-300 ring-1 ring-inset ring-rose-400/25"
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
      className="group overflow-hidden rounded-[20px] border border-slate-800/90 bg-slate-900/55 shadow-[0_8px_30px_-20px_rgba(0,0,0,0.65)] transition duration-200 hover:border-slate-700/90 hover:bg-slate-900/75"
    >
      <header className="relative flex items-start gap-3.5 px-4 pb-4 pt-5 sm:px-5">
        <span className="absolute inset-x-5 top-0 h-px bg-gradient-to-r from-emerald-400/60 via-emerald-400/10 to-transparent" />
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-300 shadow-inner shadow-emerald-300/[0.04]">
          <SectionIcon className="h-[19px] w-[19px]" strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[9px] font-bold tracking-[0.16em] text-emerald-400/85">{section.eyebrow}</span>
            <span className="text-[9px] tabular-nums text-slate-600">{section.number}</span>
          </div>
          <h2 id={'settings-' + section.id} className="text-[14px] font-semibold tracking-tight text-slate-100 sm:text-[15px]">
            {section.title}
          </h2>
          <p className="mt-1 text-[11px] leading-[1.55] text-slate-400">{section.description}</p>
        </div>
        <span className="mt-1 rounded-lg border border-slate-800 bg-slate-950/40 px-2 py-1 text-[10px] font-medium tabular-nums text-slate-500">
          {section.items.length}
        </span>
      </header>

      <div className="px-2.5 pb-2.5 sm:px-3">
        <div className="h-px bg-slate-800/70" />
        <div className="pt-1.5">
          {section.items.map((item) => {
            const Icon = item.icon
            const pendingCount = Number(attentionCounts[item.page] || 0)

            return (
              <button
                key={item.page}
                type="button"
                onClick={() => onNavigate(item.page)}
                className="group/item flex min-h-[4.25rem] w-full items-center gap-3 rounded-xl px-2.5 py-3 text-left transition-all duration-150 hover:bg-slate-800/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400 sm:px-3"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-700/50 bg-slate-800/70 text-slate-300 transition-colors group-hover/item:border-emerald-400/20 group-hover/item:bg-emerald-400/10 group-hover/item:text-emerald-300">
                  <Icon className="h-[17px] w-[17px]" strokeWidth={1.8} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-semibold text-slate-100 sm:text-[13px]">{item.title}</span>
                  <span className="mt-0.5 block text-[10px] leading-[1.5] text-slate-400 sm:text-[11px]">{item.description}</span>
                </span>
                <AttentionBadge count={pendingCount} />
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-600 transition-all group-hover/item:translate-x-0.5 group-hover/item:text-emerald-300" />
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}

export default function Ajustes({ onNavigate, attentionCounts = {} }) {
  const [search, setSearch] = useState('')
  const normalizedSearch = search.trim().toLocaleLowerCase('es')

  const visibleSections = useMemo(() => {
    if (!normalizedSearch) return sections

    return sections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) =>
          [item.page, item.title, item.description, item.keywords, section.title, section.description]
            .join(' ')
            .toLocaleLowerCase('es')
            .includes(normalizedSearch),
        ),
      }))
      .filter((section) => section.items.length > 0)
  }, [normalizedSearch])

  const showSecurity = !normalizedSearch || ['seguridad', 'privacidad', 'bloqueo', 'protección', 'app lock', 'pin']
    .some((term) => term.includes(normalizedSearch) || normalizedSearch.includes(term))

  return (
    <main className="mx-auto w-full max-w-5xl space-y-5 pb-8 sm:space-y-6">
      <header className="relative isolate overflow-hidden rounded-[22px] border border-slate-800/90 bg-slate-900/65 shadow-[0_18px_55px_-35px_rgba(0,0,0,0.9)]">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,rgba(16,185,129,0.11),transparent_48%)]" />
        <div className="pointer-events-none absolute -right-12 -top-20 -z-10 h-56 w-56 rounded-full border border-emerald-400/[0.07]" />
        <div className="pointer-events-none absolute -right-4 -top-12 -z-10 h-40 w-40 rounded-full border border-emerald-400/[0.06]" />
        <div className="px-5 pb-5 pt-5 sm:px-7 sm:pb-6 sm:pt-7">
          <div className="mb-4 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
              <Settings className="h-4 w-4" strokeWidth={1.8} />
            </span>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-400">Centro de control</span>
          </div>
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div className="max-w-xl">
              <h1 className="finance-page-title">Ajustes</h1>
              <p className="mt-2 text-[13px] leading-6 text-slate-400 sm:text-sm">
                Tu espacio para personalizar y controlar cómo funciona Finanzas.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 self-start rounded-xl border border-slate-700/70 bg-slate-950/35 px-3 py-2 sm:self-auto">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.55)]" />
              <span className="text-[10px] font-medium text-slate-300">Configuración de la app</span>
            </div>
          </div>

          <div className="mt-5">
            <label htmlFor="settings-search" className="sr-only">Buscar en ajustes</label>
            <div className="flex h-11 items-center gap-2.5 rounded-xl border border-slate-700/80 bg-slate-950/55 px-3.5 transition-colors focus-within:border-emerald-500/50 focus-within:ring-2 focus-within:ring-emerald-500/10">
              <Search className="h-4 w-4 shrink-0 text-slate-500" />
              <input
                id="settings-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar una opción: cuentas, alertas, presupuestos..."
                className="h-full min-w-0 flex-1 bg-transparent text-xs text-slate-100 outline-none placeholder:text-slate-500"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Limpiar búsqueda"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="flex items-center justify-between px-1">
        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-300">Todas las opciones</h2>
          <p className="mt-1 text-[10px] text-slate-500">
            {normalizedSearch ? 'Resultados para «' + search.trim() + '»' : 'Accesos organizados por categoría'}
          </p>
        </div>
        <span className="text-[10px] font-medium tabular-nums text-slate-500">
          {visibleSections.reduce((total, section) => total + section.items.length, 0) + (showSecurity ? 1 : 0)} opciones
        </span>
      </div>

      {visibleSections.length > 0 || showSecurity ? (
        <div className="grid grid-cols-1 items-start gap-3.5 lg:grid-cols-2 lg:gap-4">
          {visibleSections.map((section) => (
            <SettingsSection
              key={section.id}
              section={section}
              attentionCounts={attentionCounts}
              onNavigate={onNavigate}
            />
          ))}

          {showSecurity && (
            <section
              aria-labelledby="settings-seguridad"
              className="overflow-hidden rounded-[20px] border border-slate-800/90 bg-slate-900/55 shadow-[0_8px_30px_-20px_rgba(0,0,0,0.65)] transition duration-200 hover:border-slate-700/90"
            >
              <header className="relative flex items-start gap-3.5 px-4 pb-4 pt-5 sm:px-5">
                <span className="absolute inset-x-5 top-0 h-px bg-gradient-to-r from-emerald-400/60 via-emerald-400/10 to-transparent" />
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-300">
                  <ShieldCheck className="h-[19px] w-[19px]" strokeWidth={1.8} />
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="text-[9px] font-bold tracking-[0.16em] text-emerald-400/85">PROTECCIÓN</span>
                    <span className="text-[9px] tabular-nums text-slate-600">05</span>
                  </div>
                  <h2 id="settings-seguridad" className="text-[14px] font-semibold tracking-tight text-slate-100 sm:text-[15px]">
                    Seguridad y privacidad
                  </h2>
                  <p className="mt-1 text-[11px] leading-[1.55] text-slate-400">
                    Protege el acceso a Finanzas desde tu dispositivo.
                  </p>
                </div>
                <LockKeyhole className="mt-1 h-4 w-4 shrink-0 text-slate-600" />
              </header>
              <div className="border-t border-slate-800/70 px-3 py-3 sm:px-4">
                <AppLockSettings />
              </div>
            </section>
          )}
        </div>
      ) : (
        <div className="rounded-[20px] border border-dashed border-slate-700/80 bg-slate-900/35 px-5 py-10 text-center">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-700 bg-slate-800/70 text-slate-400">
            <Search className="h-5 w-5" />
          </span>
          <p className="mt-3 text-sm font-semibold text-slate-200">No encontramos esa opción</p>
          <p className="mt-1 text-xs text-slate-500">Prueba con otra palabra o revisa la búsqueda.</p>
          <button
            type="button"
            onClick={() => setSearch('')}
            className="mt-4 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3.5 py-2 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            Mostrar todos los ajustes
          </button>
        </div>
      )}

      <p className="flex items-start gap-2 rounded-xl border border-slate-800/70 bg-slate-900/30 px-3.5 py-3 text-[10px] leading-5 text-slate-500">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400/80" />
        Organizar y buscar opciones no modifica tus cuentas, movimientos, saldos ni datos financieros.
      </p>
    </main>
  )
}
