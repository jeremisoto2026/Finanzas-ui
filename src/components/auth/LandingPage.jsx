import { useState } from 'react'
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  BellRing,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Landmark,
  Loader2,
  LockKeyhole,
  LogIn,
  PiggyBank,
  Receipt,
  ShieldCheck,
  Smartphone,
  UserPlus,
  Wallet,
} from 'lucide-react'

const features = [
  {
    icon: Landmark,
    title: 'Cuentas y saldos',
    description: 'Organiza bancos, efectivo, tarjetas, ahorros y monederos. Consulta cada saldo y entiende cuánto dinero tienes en cada sitio.',
    detail: 'Bancos · Efectivo · Ahorros · Monederos',
  },
  {
    icon: Receipt,
    title: 'Gastos e ingresos',
    description: 'Registra tus movimientos, asígnales una categoría y a la cuenta correcta. Mantén el historial ordenado y fácil de revisar.',
    detail: 'Movimientos · Categorías · Historial',
  },
  {
    icon: CalendarDays,
    title: 'Pagos fijos y cuotas',
    description: 'Ten localizados los compromisos periódicos, sus vencimientos y las cuotas pendientes para anticiparte a cada pago.',
    detail: 'Pagos recurrentes · Cuotas · Vencimientos',
  },
  {
    icon: PiggyBank,
    title: 'Presupuesto familiar',
    description: 'Planifica importes por categoría y periodo. Compara lo previsto con lo gastado y observa lo que todavía queda por cubrir.',
    detail: 'Planificación · Seguimiento · Disponible',
  },
  {
    icon: Wallet,
    title: 'Dinero reservado',
    description: 'Distingue el saldo de tus cuentas, el importe que necesitas apartar y el dinero libre. Así no cuentas dos veces el mismo importe.',
    detail: 'Saldo real · Apartado · Dinero libre',
  },
  {
    icon: BellRing,
    title: 'Recordatorios y automatizaciones',
    description: 'Recibe avisos de pagos y cuotas. En Android, Finanzas puede capturar avisos bancarios compatibles y preparar compras para su registro.',
    detail: 'Avisos · Capturas · Revisión segura',
  },
]

const sampleAccounts = [
  { name: 'BBVA', detail: 'Cuenta bancaria', amount: '1.240,50 €', icon: Landmark },
  { name: 'Revolut', detail: 'Cuenta digital', amount: '860,30 €', icon: CreditCard },
  { name: 'Efectivo', detail: 'Dinero en mano', amount: '336,00 €', icon: Wallet },
]

const sampleMovements = [
  { title: 'Compra supermercado', category: 'Alimentación · Hoy', amount: '−32,40 €', incoming: false },
  { title: 'Ingreso recibido', category: 'Nómina · Ayer', amount: '+740,00 €', incoming: true },
  { title: 'Cuota mensual', category: 'Compromisos · 18 nov.', amount: '−29,90 €', incoming: false },
]

export default function LandingPage({ signIn, signUp, signInWithGoogle }) {
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const changeMode = (nextMode) => {
    setMode(nextMode)
    setError('')
    setNotice('')
  }

  async function submit(event) {
    event.preventDefault()
    setError('')
    setNotice('')

    if (!email.trim() || password.length < 8) {
      setError('Introduce un correo válido y una contraseña de al menos 8 caracteres.')
      return
    }

    setBusy(true)
    try {
      const { data, error: authError } = mode === 'signin'
        ? await signIn(email.trim(), password)
        : await signUp(email.trim(), password)

      if (authError) throw authError

      if (mode === 'signup' && !data.session) {
        setNotice('Cuenta creada. Revisa tu correo para confirmar la dirección antes de iniciar sesión.')
      } else if (mode === 'signup') {
        setNotice('Cuenta creada correctamente.')
      }
    } catch (authError) {
      setError(authError.message || 'No se pudo completar la autenticación.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="landing-page relative bg-[#080F1C] text-slate-100">
      <header className="landing-header sticky top-0 z-40 border-b border-slate-800/80 bg-[#080F1C]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
          <a href="#inicio" className="flex shrink-0 items-center" aria-label="Finanzas, inicio">
            <img
              src="/finanzas-logo-horizontal-dark.svg"
              alt="Finanzas"
              className="h-9 w-auto max-w-[10.75rem] object-contain"
              draggable="false"
            />
          </a>

          <nav className="hidden items-center gap-7 md:flex" aria-label="Navegación principal">
            <a href="#funciones" className="text-sm text-slate-400 transition hover:text-white">Funciones</a>
            <a href="#organizacion" className="text-sm text-slate-400 transition hover:text-white">Cómo te ayuda</a>
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <a
              href="#acceso"
              onClick={() => changeMode('signin')}
              className="hidden rounded-xl px-3 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-slate-800/80 hover:text-white sm:inline-flex"
            >
              Iniciar sesión
            </a>
            <a
              href="#acceso"
              onClick={() => changeMode('signup')}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-950/25 transition hover:bg-emerald-500 sm:px-4"
            >
              <UserPlus className="h-4 w-4" />
              <span>Crear cuenta</span>
            </a>
          </div>
        </div>
      </header>

      <section id="inicio" className="relative isolate">
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
          <div className="absolute -left-40 top-0 h-96 w-96 rounded-full bg-emerald-500/[0.09] blur-3xl" />
          <div className="absolute -right-40 top-28 h-96 w-96 rounded-full bg-sky-500/[0.05] blur-3xl" />
        </div>

        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 pb-16 pt-14 sm:px-6 sm:pt-20 lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.92fr)] lg:gap-14 lg:px-8 lg:pb-24 lg:pt-20">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/[0.07] px-3 py-1.5 text-xs font-semibold text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              CONTROL FINANCIERO PERSONAL Y FAMILIAR
            </div>

            <h1 className="mt-6 max-w-2xl text-4xl font-semibold leading-[1.12] tracking-tight text-white sm:text-5xl lg:text-[3.65rem]">
              Tus cuentas claras.
              <span className="mt-1 block text-emerald-300">Tus decisiones, más tranquilas.</span>
            </h1>

            <p className="mt-6 max-w-xl text-base leading-7 text-slate-400 sm:text-lg sm:leading-8">
              Reúne tus cuentas, gastos, ingresos y pagos en un solo lugar. Planifica lo que viene, separa lo que ya está comprometido y descubre cuánto dinero tienes realmente disponible.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href="#acceso"
                onClick={() => changeMode('signup')}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-950/30 transition hover:bg-emerald-500"
              >
                Crear mi cuenta
                <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href="#acceso"
                onClick={() => changeMode('signin')}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-800"
              >
                <LogIn className="h-4 w-4" />
                Ya tengo una cuenta
              </a>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-400" /> Cuentas y movimientos</span>
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-400" /> Presupuestos y reservas</span>
              <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-emerald-400" /> Acceso privado</span>
            </div>
          </div>

          <div className="grid gap-4">
            <div id="acceso" className="w-full rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl shadow-black/20 sm:p-6">
              <div className="mb-5 flex items-center gap-3">
                <img
                  src="/finanzas-icon.svg"
                  alt="Finanzas"
                  className="h-10 w-10 shrink-0 object-contain"
                  draggable="false"
                />
                <div>
                  <h2 className="text-lg font-semibold text-white">{mode === 'signin' ? 'Iniciar sesión' : 'Crear cuenta'}</h2>
                  <p className="mt-0.5 text-xs text-slate-500">Acceso directo a Finanzas</p>
                </div>
              </div>

              <div className="mb-5 grid grid-cols-2 rounded-xl border border-slate-800 bg-slate-950/70 p-1">
                <button type="button" onClick={() => changeMode('signin')} aria-pressed={mode === 'signin'} className={'rounded-lg px-3 py-2.5 text-sm font-medium transition ' + (mode === 'signin' ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:text-slate-200')}>Entrar</button>
                <button type="button" onClick={() => changeMode('signup')} aria-pressed={mode === 'signup'} className={'rounded-lg px-3 py-2.5 text-sm font-medium transition ' + (mode === 'signup' ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:text-slate-200')}>Crear cuenta</button>
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setError('')
                  setNotice('')
                  setBusy(true)
                  try {
                    const { error: authError } = await signInWithGoogle()
                    if (authError) throw authError
                  } catch (authError) {
                    setError(authError.message || 'No se pudo iniciar sesión con Google.')
                  } finally {
                    setBusy(false)
                  }
                }}
                className="group inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-500/80 bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-900 shadow-md shadow-black/20 transition hover:border-white hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 active:scale-[0.99] disabled:cursor-wait disabled:opacity-60"
              >
                <svg aria-hidden="true" viewBox="0 0 48 48" className="h-5 w-5 shrink-0">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" transform="translate(0 4)" />
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.73 7.18l7.66 5.94c4.48-4.14 7.11-10.24 7.11-17.59Z" />
                  <path fill="#FBBC05" d="M10.53 28.59a14.4 14.4 0 0 1 0-9.18l-7.98-6.19a23.9 23.9 0 0 0 0 21.56l7.98-6.19Z" />
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.86l-7.66-5.94c-2.13 1.43-4.86 2.27-8.25 2.27-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" />
                </svg>
                <span>Continuar con Google</span>
              </button>
              <div className="relative my-6 flex items-center">
                <span className="h-px flex-1 bg-slate-800" />
                <span className="px-3 text-[11px] text-slate-500">o con correo electrónico</span>
                <span className="h-px flex-1 bg-slate-800" />
              </div>

              <form onSubmit={submit} className="space-y-4">
                <label className="block text-sm font-medium text-slate-300">
                  Correo electrónico
                  <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-3 text-white outline-none transition focus:border-emerald-500" placeholder="tu correo" />
                </label>
                <label className="block text-sm font-medium text-slate-300">
                  Contraseña
                  <input type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-3 text-white outline-none transition focus:border-emerald-500" placeholder="Mínimo 8 caracteres" />
                </label>
                {error && <p role="alert" className="rounded-xl border border-rose-800/60 bg-rose-950/35 p-3 text-sm leading-5 text-rose-200">{error}</p>}
                {notice && <p role="status" className="rounded-xl border border-emerald-800/60 bg-emerald-950/35 p-3 text-sm leading-5 text-emerald-200">{notice}</p>}
                <button type="submit" disabled={busy} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-950/25 transition hover:bg-emerald-500 disabled:cursor-wait disabled:opacity-60">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === 'signin' ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                  {busy ? 'Procesando…' : mode === 'signin' ? 'Iniciar sesión' : 'Crear cuenta'}
                </button>
              </form>
              <button type="button" onClick={() => changeMode(mode === 'signin' ? 'signup' : 'signin')} className="mt-4 w-full text-center text-xs text-slate-400 transition hover:text-white">
                {mode === 'signin' ? '¿Aún no tienes cuenta? Crear cuenta' : 'Ya tengo cuenta. Iniciar sesión'}
              </button>
            </div>

            <div className="finance-panel overflow-hidden rounded-3xl border border-slate-700/80 bg-slate-900/75 p-4 shadow-2xl shadow-black/30 sm:p-5">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300">Vista de ejemplo</p>
                  <p className="mt-1 text-xs text-slate-500">Así puedes organizar tu dinero</p>
                </div>
                <span className="rounded-full border border-slate-700 bg-slate-950/60 px-2.5 py-1 text-[10px] font-medium text-slate-400">Datos ilustrativos</span>
              </div>

              <div className="rounded-2xl border border-emerald-500/15 bg-gradient-to-br from-emerald-950/45 via-slate-950/80 to-slate-950 p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-medium text-slate-400">Total en tus cuentas</p>
                  <span className="rounded-lg border border-emerald-500/15 bg-emerald-500/10 p-2 text-emerald-300"><Wallet className="h-4 w-4" /></span>
                </div>
                <p className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">2.436,80 €</p>
                <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 font-medium text-emerald-300">
                    <ArrowUpRight className="h-3.5 w-3.5" /> Saldo de ejemplo
                  </span>
                  <span>Distribuido entre 3 cuentas</span>
                </div>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                {sampleAccounts.map((account) => {
                  const Icon = account.icon
                  return (
                    <div key={account.name} className="rounded-xl border border-slate-800 bg-slate-950/55 p-3">
                      <div className="flex items-center gap-2 text-slate-400">
                        <Icon className="h-4 w-4 text-emerald-300" />
                        <span className="text-xs font-medium">{account.name}</span>
                      </div>
                      <p className="mt-3 text-base font-semibold tabular-nums text-white">{account.amount}</p>
                      <p className="mt-0.5 text-[10px] text-slate-500">{account.detail}</p>
                    </div>
                  )
                })}
              </div>

              <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">Movimientos recientes</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">Ingresos y gastos en contexto</p>
                  </div>
                  <Receipt className="h-4 w-4 text-slate-500" />
                </div>
                <div className="space-y-3">
                  {sampleMovements.map((movement) => (
                    <div key={movement.title} className="flex items-center gap-3">
                      <span className={'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ' + (movement.incoming ? 'bg-emerald-500/10 text-emerald-300' : 'bg-slate-800 text-slate-400')}>
                        {movement.incoming ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-slate-200">{movement.title}</p>
                        <p className="mt-0.5 text-[10px] text-slate-500">{movement.category}</p>
                      </div>
                      <p className={'shrink-0 text-xs font-semibold tabular-nums ' + (movement.incoming ? 'text-emerald-300' : 'text-slate-200')}>{movement.amount}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-amber-500/15 bg-amber-500/[0.045] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-amber-200">Presupuesto reservado</p>
                    <p className="mt-1 text-[11px] text-slate-400">Ejemplo de seguimiento mensual</p>
                  </div>
                  <p className="text-sm font-semibold tabular-nums text-white">68 %</p>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                  <div className="h-full w-[68%] rounded-full bg-emerald-400" />
                </div>
                <p className="mt-2 text-[10px] text-slate-500">Planificado, gastado y todavía apartado.</p>
              </div>
            </div>

            <p className="flex items-center justify-center gap-2 text-center text-[11px] text-slate-500">
              <ShieldCheck className="h-4 w-4 text-emerald-400/80" />
              La demostración no utiliza ni muestra datos de cuentas reales.
            </p>
          </div>
        </div>
      </section>

      <section id="funciones" className="border-y border-slate-800/70 bg-slate-900/25 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Todo conectado</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Cada parte de tus finanzas, en su sitio.</h2>
            <p className="mt-4 text-sm leading-7 text-slate-400 sm:text-base">
              Finanzas reúne las herramientas que necesitas para entender tu situación y organizar los próximos pagos sin perder de vista el dinero disponible.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {features.map((feature, index) => {
              const Icon = feature.icon
              return (
                <article key={feature.title} className="group rounded-2xl border border-slate-800 bg-slate-900/65 p-5 transition duration-200 hover:-translate-y-0.5 hover:border-emerald-500/25 hover:bg-slate-900">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-500/15 bg-emerald-500/[0.08] text-emerald-300">
                    <Icon className="h-5 w-5" />
                  </div>
                  <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">0{index + 1}</p>
                  <h3 className="mt-1 text-lg font-semibold text-white">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-400">{feature.description}</p>
                  <p className="mt-4 border-t border-slate-800 pt-3 text-[11px] font-medium text-emerald-300/80">{feature.detail}</p>
                </article>
              )
            })}
          </div>
        </div>
      </section>

      <section id="organizacion" className="py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Más claridad, menos dudas</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">No todo el dinero disponible está libre para gastar.</h2>
              <p className="mt-4 text-sm leading-7 text-slate-400 sm:text-base">
                Visualiza por separado el saldo contabilizado, lo que ya has comprometido y lo que queda por reservar. Así puedes planificar sin sumar de nuevo importes que ya tenías en tus cuentas.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/65 p-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800 text-slate-300"><Wallet className="h-5 w-5" /></span>
                <h3 className="mt-4 text-sm font-semibold text-white">Saldo en cuentas</h3>
                <p className="mt-2 text-xs leading-5 text-slate-400">El dinero registrado en bancos, efectivo y otras cuentas.</p>
              </div>
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.045] p-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-300"><PiggyBank className="h-5 w-5" /></span>
                <h3 className="mt-4 text-sm font-semibold text-white">Dinero apartado</h3>
                <p className="mt-2 text-xs leading-5 text-slate-400">Lo previsto para presupuestos y compromisos próximos.</p>
              </div>
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.045] p-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-300"><CheckCircle2 className="h-5 w-5" /></span>
                <h3 className="mt-4 text-sm font-semibold text-white">Dinero libre</h3>
                <p className="mt-2 text-xs leading-5 text-slate-400">Una referencia más realista de lo que puedes utilizar.</p>
              </div>
            </div>
          </div>

          <div className="mt-14 grid gap-4 md:grid-cols-3">
            <div className="flex gap-3 rounded-2xl border border-slate-800 bg-slate-900/45 p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-slate-300"><LockKeyhole className="h-5 w-5" /></span>
              <div>
                <h3 className="text-sm font-semibold text-white">Tu acceso es privado</h3>
                <p className="mt-1 text-xs leading-5 text-slate-400">Inicia sesión con tu cuenta. La información financiera se mantiene asociada a tu usuario.</p>
              </div>
            </div>
            <div className="flex gap-3 rounded-2xl border border-slate-800 bg-slate-900/45 p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-slate-300"><Smartphone className="h-5 w-5" /></span>
              <div>
                <h3 className="text-sm font-semibold text-white">Pensado para el día a día</h3>
                <p className="mt-1 text-xs leading-5 text-slate-400">Consulta y organiza tus movimientos desde la web o desde la aplicación Android.</p>
              </div>
            </div>
            <div className="flex gap-3 rounded-2xl border border-slate-800 bg-slate-900/45 p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-slate-300"><ShieldCheck className="h-5 w-5" /></span>
              <div>
                <h3 className="text-sm font-semibold text-white">Automatización con control</h3>
                <p className="mt-1 text-xs leading-5 text-slate-400">Las compras ambiguas quedan pendientes de revisión, en lugar de registrarse sin garantías.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 pb-16 sm:px-6 sm:pb-20 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/55 via-slate-900/90 to-slate-900 p-6 shadow-xl shadow-black/20 sm:p-9 lg:flex-row lg:items-center">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Empieza cuando quieras</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Pon tus cuentas en orden con Finanzas.</h2>
            <p className="mt-3 text-sm leading-6 text-slate-400">Crea tu espacio o entra para continuar organizando tus cuentas y tus próximos pagos.</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-52">
            <a href="#acceso" onClick={() => changeMode('signup')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500">
              Crear cuenta <ArrowRight className="h-4 w-4" />
            </a>
            <a href="#acceso" onClick={() => changeMode('signin')} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-950/30 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-slate-800">
              Iniciar sesión
            </a>
          </div>
        </div>
      </section>

      <footer className="landing-footer border-t border-slate-800/80 bg-slate-950/35">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <img
            src="/finanzas-logo-horizontal-dark.svg"
            alt="Finanzas"
            className="h-7 w-auto object-contain"
            draggable="false"
          />
          <p>Control financiero personal y familiar.</p>
        </div>
      </footer>

    </main>
  )
}
