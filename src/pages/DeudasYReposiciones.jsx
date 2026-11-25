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
    <div className="mx-auto w-full max-w-7xl space-y-4">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-3 sm:p-4">
        <p className="mb-3 px-1 text-xs leading-5 text-slate-400">
          Un único lugar para controlar lo que debes, lo que te deben y el dinero que has adelantado. Cada registro conserva su propio historial para evitar duplicar movimientos.
        </p>
        <div role="tablist" aria-label="Deudas y reposiciones" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button id="tab-deudas" type="button" role="tab" aria-selected={activeTab === 'deudas'} aria-controls="panel-deudas-reposiciones" onClick={() => setActiveTab('deudas')} className={tabClass(activeTab === 'deudas')}>
            <Scale className="h-4 w-4" /> Préstamos y deudas
          </button>
          <button id="tab-reposiciones" type="button" role="tab" aria-selected={activeTab === 'reposiciones'} aria-controls="panel-deudas-reposiciones" onClick={() => setActiveTab('reposiciones')} className={tabClass(activeTab === 'reposiciones')}>
            <ArrowLeftRight className="h-4 w-4" /> Dinero por reponer
          </button>
        </div>
      </div>

      <section id="panel-deudas-reposiciones" role="tabpanel" aria-labelledby={activeTab === 'deudas' ? 'tab-deudas' : 'tab-reposiciones'} className="min-w-0">
        <Suspense fallback={<div role="status" className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 text-sm text-slate-400">Cargando seguimiento financiero…</div>}>
          {activeTab === 'deudas' ? <Deudas /> : <Reposiciones />}
        </Suspense>
      </section>
    </div>
  )
}
