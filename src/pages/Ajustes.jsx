import AppLockSettings from '@/components/AppLockSettings'
import { LockKeyhole, ShieldCheck } from 'lucide-react'

export default function Ajustes() {
  return (
    <main className="mx-auto w-full max-w-3xl space-y-5 pb-8">
      <header className="relative isolate overflow-hidden rounded-[22px] border border-slate-800/90 bg-slate-900/65 px-5 py-6 shadow-[0_18px_55px_-35px_rgba(0,0,0,0.9)] sm:px-7 sm:py-7">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,rgba(16,185,129,0.11),transparent_48%)]" />
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
          <ShieldCheck className="h-5 w-5" strokeWidth={1.8} />
        </div>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-400">Sistema y protección</p>
        <h1 className="finance-page-title mt-2">Seguridad y privacidad</h1>
        <p className="mt-2 max-w-xl text-[13px] leading-6 text-slate-400">
          Gestiona la protección del acceso a Finanzas desde este dispositivo.
          Las herramientas de cuentas, presupuestos y seguimiento están organizadas en sus propias secciones.
        </p>
      </header>

      <section className="overflow-hidden rounded-[20px] border border-slate-800/90 bg-slate-900/55 shadow-[0_8px_30px_-20px_rgba(0,0,0,0.65)]">
        <header className="flex items-start gap-3.5 border-b border-slate-800/70 px-4 py-5 sm:px-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-300">
            <LockKeyhole className="h-[18px] w-[18px]" strokeWidth={1.8} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-slate-100">Bloqueo de la aplicación</h2>
            <p className="mt-1 text-[11px] leading-5 text-slate-400">
              Configura las opciones disponibles para proteger tus datos cuando alguien tenga acceso a tu dispositivo.
            </p>
          </div>
        </header>
        <div className="px-3 py-4 sm:px-5">
          <AppLockSettings />
        </div>
      </section>

      <p className="rounded-xl border border-slate-800/70 bg-slate-900/30 px-3.5 py-3 text-[10px] leading-5 text-slate-500">
        Este apartado solo controla la seguridad de la aplicación. No modifica cuentas, movimientos, saldos, deudas ni reservas.
      </p>
    </main>
  )
}
