import { lazy, Suspense, useEffect, useState } from 'react'
import { ArrowLeftRight, Scale } from 'lucide-react'

const Deudas = lazy(() => import('@/pages/Deudas'))
const Reposiciones = lazy(() => import('@/pages/Compromisos'))

export default function DeudasYReposiciones() {
  const [activeTab, setActiveTab] = useState('deudas')

  useEffect(() => {
    const showDebts = () => setActiveTab('deudas')
    const showReplenishments = () => setActiveTab('reposiciones')
    window.addEventListener('finanzas:show-debts', showDebts)
    window.addEventListener('finanzas:show-replenishments', showReplenishments)
    return () => {
      window.removeEventListener('finanzas:show-debts', showDebts)
      window.removeEventListener('finanzas:show-replenishments', showReplenishments)
    }
  }, [])

  const tabClass = (selected) =>
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ' +
    (selected
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
      : 'border-slate-700 bg-slate-900/60 text-slate-400 hover:bg-slate-800 hover:text-slate-100')

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 pb-8">
      <header className="finance-page-intro">
        <p className="finance-page-eyebrow">SEGUIMIENTO DEL DINERO</p>
        <h2 className="finance-page-heading">Deudas y dinero por reponer</h2>
        <p className="finance-page-description">
          Son dos controles diferentes: aquí registras lo que debes cobrar o devolver y, por separado, el dinero que has adelantado y quieres reponer.
        </p>
      </header>

      <section className="space-y-3 rounded-2xl border border-slate-800/90 bg-slate-900/55 p-3 sm:p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            id="tab-deudas"
            type="button"
            role="tab"
            aria-selected={activeTab === 'deudas'}
            aria-controls="panel-deudas-reposiciones"
            onClick={() => setActiveTab('deudas')}
            className={tabClass(activeTab === 'deudas') + ' flex-col items-start gap-1.5 text-left'}
          >
            <span className="flex items-center gap-2"><Scale className="h-4 w-4" /> Préstamos y deudas</span>
            <span className="text-left text-[11px] font-normal leading-5 opacity-80">
              Cantidades que alguien te debe o que tú tienes que devolver.
            </span>
          </button>
          <button
            id="tab-reposiciones"
            type="button"
            role="tab"
            aria-selected={activeTab === 'reposiciones'}
            aria-controls="panel-deudas-reposiciones"
            onClick={() => setActiveTab('reposiciones')}
            className={tabClass(activeTab === 'reposiciones') + ' flex-col items-start gap-1.5 text-left'}
          >
            <span className="flex items-center gap-2"><ArrowLeftRight className="h-4 w-4" /> Dinero por reponer</span>
            <span className="text-left text-[11px] font-normal leading-5 opacity-80">
              Dinero que adelantaste y quieres devolver a su cuenta o fondo de origen.
            </span>
          </button>
        </div>
      </section>

      <section
        id="panel-deudas-reposiciones"
        role="tabpanel"
        aria-labelledby={activeTab === 'deudas' ? 'tab-deudas' : 'tab-reposiciones'}
        className="min-w-0"
      >
        <Suspense fallback={<div role="status" className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 text-sm text-slate-400">Cargando información…</div>}>
          {activeTab === 'deudas' ? <Deudas /> : <Reposiciones />}
        </Suspense>
      </section>
    </div>
  )
}
