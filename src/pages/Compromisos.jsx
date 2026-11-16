import { useEffect, useMemo, useState } from 'react'
import { ArrowPathIcon, BanknotesIcon, CheckCircleIcon, ClockIcon, LockClosedIcon, ReceiptPercentIcon } from '@heroicons/react/24/outline'
import { sumMoney } from '@/lib/finance-core'

const euro = (value) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(value || 0))
const labels = {
  replenishment: 'Reposición pendiente',
  reserve: 'Dinero reservado',
  planned_extra: 'Extra previsto',
  historical_expense: 'Histórico registrado',
}
const statusLabels = {
  open: 'Pendiente',
  partially_settled: 'Parcialmente repuesto',
  settled: 'Completado',
  reserved: 'Reservado',
  released: 'Liberado',
  recorded: 'Histórico',
}

export default function Compromisos() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updating, setUpdating] = useState('')

  const load = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await fetch('/api/compromisos')
      if (!response.ok) throw new Error('No se pudieron cargar las reposiciones y reservas.')
      const data = await response.json()
      setItems(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message || 'Error al cargar los compromisos.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const totals = useMemo(() => ({
    replenishment: sumMoney(
      items.filter((item) => item.kind === 'replenishment' && item.status !== 'settled'),
      (item) => item.outstandingAmount || 0
    ),
    reserve: sumMoney(
      items.filter((item) => item.kind === 'reserve' && item.status === 'reserved'),
      (item) => item.outstandingAmount || 0
    ),
    extra: sumMoney(
      items.filter((item) => item.kind === 'planned_extra' && item.status === 'open'),
      (item) => item.outstandingAmount || 0
    ),
  }), [items])

  const statusWarnings = useMemo(() => items.filter((item) => (
    item.status === 'settled'
    && /no consta como pagado|no se ha pagado|pendiente de pago|no consta pagado/i.test(String(item.notes || ''))
  )), [items])

  const update = async (item, status) => {
    const message = status === 'settled'
      ? `¿Confirmas que «${item.title}» ya se ha completado?`
      : status === 'released'
        ? `¿Confirmas que «${item.title}» deja de estar reservado o previsto?`
        : '¿Confirmas el cambio?'
    if (!confirm(message)) return

    try {
      setUpdating(item.id)
      setError('')
      const response = await fetch('/api/compromisos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, status })
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo actualizar el registro.')
      setItems((current) => current.map((row) => row.id === result.id ? result : row))
    } catch (err) {
      setError(err.message || 'No se pudo actualizar el registro.')
    } finally {
      setUpdating('')
    }
  }

  const groups = [
    { kind: 'replenishment', title: 'Dinero que tienes pendiente de reponer', icon: BanknotesIcon, empty: 'No hay reposiciones pendientes.' },
    { kind: 'reserve', title: 'Dinero reservado', icon: LockClosedIcon, empty: 'No hay dinero reservado.' },
    { kind: 'planned_extra', title: 'Gastos extra previstos', icon: ReceiptPercentIcon, empty: 'No hay gastos extra previstos.' },
    { kind: 'historical_expense', title: 'Gastos históricos fuera del saldo actual', icon: ClockIcon, empty: 'No hay gastos históricos adicionales.' },
  ]

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 text-slate-100">
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-3">
          <BanknotesIcon className="h-7 w-7 text-emerald-400" />
          <h1 className="text-2xl font-bold text-white">Compromisos y reposiciones</h1>
        </div>
        <p className="max-w-3xl text-sm text-slate-400">
          Aquí se muestran reposiciones, reservas, extras previstos y gastos históricos que no deben confundirse con el saldo de tus cuentas.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-amber-800/50 bg-amber-950/20 p-4">
          <p className="text-sm text-amber-200">Pendiente de reponer</p>
          <p className="mt-1 text-2xl font-bold text-white">{euro(totals.replenishment)}</p>
        </div>
        <div className="rounded-xl border border-sky-800/50 bg-sky-950/20 p-4">
          <p className="text-sm text-sky-200">Reservado</p>
          <p className="mt-1 text-2xl font-bold text-white">{euro(totals.reserve)}</p>
        </div>
        <div className="rounded-xl border border-purple-800/50 bg-purple-950/20 p-4">
          <p className="text-sm text-purple-200">Extra previsto</p>
          <p className="mt-1 text-2xl font-bold text-white">{euro(totals.extra)}</p>
        </div>
      </div>

      {error && <div className="mb-4 rounded-lg border border-rose-800 bg-rose-950/30 p-3 text-sm text-rose-200">{error}</div>}

      {statusWarnings.length > 0 && (
        <div role="alert" className="mb-5 rounded-xl border border-amber-700/50 bg-amber-950/20 p-4">
          <p className="text-sm font-semibold text-amber-200">
            Hay {statusWarnings.length} registro(s) cuyo estado no coincide con sus notas
          </p>
          <div className="mt-2 space-y-1">
            {statusWarnings.map((item) => (
              <p key={item.id} className="text-xs leading-5 text-amber-100/80">
                {item.title}: figura como completado, pero la nota indica que el pago no está confirmado.
              </p>
            ))}
          </div>
          <p className="mt-2 text-xs text-amber-200/70">No se ha cambiado ningún registro automáticamente. Revísalos antes de considerar ese importe liquidado.</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-slate-400"><ArrowPathIcon className="h-5 w-5 animate-spin" /> Cargando compromisos…</div>
      ) : (
        <div className="space-y-5">
          {groups.map((group) => {
            const Icon = group.icon
            const rows = items.filter((item) => item.kind === group.kind)
            return (
              <section key={group.kind} className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50">
                <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3">
                  <Icon className="h-5 w-5 text-emerald-400" />
                  <h2 className="font-semibold text-white">{group.title}</h2>
                  <span className="ml-auto text-xs text-slate-500">{rows.length} registros</span>
                </div>
                {rows.length === 0 ? (
                  <p className="px-4 py-5 text-sm text-slate-500">{group.empty}</p>
                ) : (
                  <div className="divide-y divide-slate-800">
                    {rows.map((item) => (
                      <div key={item.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-white">{item.title}</p>
                            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300">{statusLabels[item.status] || item.status}</span>
                          </div>
                          {item.beneficiary && <p className="mt-1 text-xs text-slate-500">Destinatario: {item.beneficiary}</p>}
                          {item.notes && <p className="mt-2 max-w-3xl text-sm text-slate-400">{item.notes}</p>}
                        </div>
                        <div className="flex items-center justify-between gap-4 md:justify-end">
                          <div className="text-right">
                            <p className="font-semibold text-white">{euro(item.amount)}</p>
                            {item.outstandingAmount > 0 && item.outstandingAmount < item.amount && <p className="text-xs text-slate-500">Pendiente: {euro(item.outstandingAmount)}</p>}
                          </div>
                          {item.kind === 'replenishment' && item.status !== 'settled' && (
                            <button disabled={updating === item.id} onClick={() => update(item, 'settled')} className="inline-flex items-center gap-1 rounded-lg bg-emerald-900/30 px-3 py-2 text-xs text-emerald-300 hover:bg-emerald-900/50 disabled:opacity-50">
                              <CheckCircleIcon className="h-4 w-4" /> Marcar repuesto
                            </button>
                          )}
                          {item.kind === 'reserve' && item.status === 'reserved' && (
                            <button disabled={updating === item.id} onClick={() => update(item, 'released')} className="inline-flex items-center gap-1 rounded-lg bg-sky-900/30 px-3 py-2 text-xs text-sky-300 hover:bg-sky-900/50 disabled:opacity-50">
                              Liberar reserva
                            </button>
                          )}
                          {item.kind === 'planned_extra' && item.status === 'open' && (
                            <div className="flex gap-2">
                              <button disabled={updating === item.id} onClick={() => update(item, 'settled')} className="rounded-lg bg-emerald-900/30 px-3 py-2 text-xs text-emerald-300 hover:bg-emerald-900/50 disabled:opacity-50">Marcar pagado</button>
                              <button disabled={updating === item.id} onClick={() => update(item, 'released')} className="rounded-lg bg-slate-800 px-3 py-2 text-xs text-slate-300 hover:bg-slate-700 disabled:opacity-50">Cancelar</button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}

      <p className="mt-5 text-xs text-slate-500">
        Importante: cerrar una reposición o un extra aquí solo actualiza su estado. No modifica los saldos bancarios; el movimiento de dinero real debe registrarse por separado cuando ocurra.
      </p>
    </div>
  )
}
