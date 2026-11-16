import { useEffect, useMemo, useState } from 'react'
import { ArrowPathIcon, BanknotesIcon, CheckCircleIcon, ClockIcon, LockClosedIcon, ReceiptPercentIcon, PlusIcon, PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline'
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
const statusOptions = {
  replenishment: ['open', 'partially_settled', 'settled'],
  reserve: ['reserved', 'released', 'settled'],
  planned_extra: ['open', 'settled', 'released'],
  historical_expense: ['recorded'],
}
const newForm = {
  kind: 'replenishment',
  title: '',
  amount: '',
  outstandingAmount: '',
  status: 'open',
  beneficiary: '',
  effectiveOn: '',
  dueOn: '',
  notes: '',
}

export default function Compromisos() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updating, setUpdating] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(newForm)

  const load = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await fetch('/api/compromisos', { cache: 'no-store' })
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

  const openNew = () => {
    setEditingId(null)
    setForm(newForm)
    setFormOpen(true)
    setError('')
  }

  const openEdit = (item) => {
    setEditingId(item.id)
    setForm({
      kind: item.kind,
      title: item.title,
      amount: String(item.amount),
      outstandingAmount: String(item.outstandingAmount),
      status: item.status,
      beneficiary: item.beneficiary || '',
      effectiveOn: item.effectiveOn || '',
      dueOn: item.dueOn || '',
      notes: item.notes || '',
    })
    setFormOpen(true)
    setError('')
  }

  const saveItem = async (event) => {
    event.preventDefault()
    const amount = Number(form.amount)
    const outstandingAmount = Number(form.outstandingAmount === '' ? form.amount : form.outstandingAmount)
    if (!form.title.trim() || !Number.isFinite(amount) || amount <= 0 ||
        !Number.isFinite(outstandingAmount) || outstandingAmount < 0 || outstandingAmount > amount) {
      setError('Revisa el título, el importe total y el importe pendiente.')
      return
    }
    try {
      setUpdating(editingId || 'new')
      setError('')
      const response = await fetch('/api/compromisos', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(editingId ? { id: editingId } : {}), ...form, amount, outstandingAmount }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo guardar el compromiso.')
      setItems((current) => editingId
        ? current.map((row) => row.id === editingId ? result : row)
        : [...current, result])
      setForm(newForm)
      setEditingId(null)
      setFormOpen(false)
    } catch (err) {
      setError(err.message || 'No se pudo guardar el compromiso.')
    } finally {
      setUpdating('')
    }
  }

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
        body: JSON.stringify({ id: item.id, status }),
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

  const deleteItem = async (item) => {
    if (!confirm(`¿Eliminar «${item.title}»? No se modificará ningún saldo bancario.`)) return
    try {
      setUpdating(item.id)
      const response = await fetch('/api/compromisos', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo eliminar el registro.')
      setItems((current) => current.filter((row) => row.id !== item.id))
    } catch (err) {
      setError(err.message || 'No se pudo eliminar el registro.')
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
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-3">
            <BanknotesIcon className="h-7 w-7 text-emerald-400" />
            <h1 className="text-2xl font-bold text-white">Compromisos y reposiciones</h1>
          </div>
          <p className="max-w-3xl text-sm text-slate-400">Crea y modifica reservas, reposiciones, extras previstos e históricos sin alterar automáticamente el dinero de tus cuentas.</p>
        </div>
        <button onClick={openNew} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500">
          <PlusIcon className="h-4 w-4" /> Nuevo compromiso
        </button>
      </header>

      {error && <div role="alert" className="rounded-lg border border-rose-800 bg-rose-950/30 p-3 text-sm text-rose-200">{error}</div>}

      {formOpen && (
        <form onSubmit={saveItem} className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-white">{editingId ? 'Editar compromiso' : 'Nuevo compromiso'}</h2>
            <button type="button" onClick={() => { setFormOpen(false); setEditingId(null); }} className="rounded-lg px-3 py-1.5 text-sm text-slate-400 hover:bg-slate-800">Cerrar</button>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="text-sm text-slate-300">Tipo
              <select value={form.kind} disabled={Boolean(editingId)} onChange={(e) => {
                const kind = e.target.value
                const status = kind === 'reserve' ? 'reserved' : kind === 'historical_expense' ? 'recorded' : 'open'
                setForm({ ...form, kind, status, outstandingAmount: kind === 'historical_expense' ? '0' : form.outstandingAmount })
              }} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white">
                <option value="replenishment">Reposición pendiente</option>
                <option value="reserve">Dinero reservado</option>
                <option value="planned_extra">Gasto extra previsto</option>
                <option value="historical_expense">Gasto histórico</option>
              </select>
            </label>
            <label className="text-sm text-slate-300">Título
              <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white" />
            </label>
            <label className="text-sm text-slate-300">Importe total (€)
              <input required type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value, outstandingAmount: form.outstandingAmount === '' ? e.target.value : form.outstandingAmount })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white" />
            </label>
            <label className="text-sm text-slate-300">Importe pendiente (€)
              <input type="number" min="0" step="0.01" value={form.outstandingAmount} onChange={(e) => setForm({ ...form, outstandingAmount: e.target.value })} disabled={form.kind === 'historical_expense'} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white disabled:opacity-50" />
            </label>
            <label className="text-sm text-slate-300">Estado
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value, outstandingAmount: ['settled', 'released', 'recorded'].includes(e.target.value) ? '0' : form.outstandingAmount })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white">
                {statusOptions[form.kind].map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
              </select>
            </label>
            <label className="text-sm text-slate-300">Beneficiario / destinatario
              <input value={form.beneficiary} onChange={(e) => setForm({ ...form, beneficiary: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white" />
            </label>
            <label className="text-sm text-slate-300">Fecha de registro (opcional)
              <input type="date" value={form.effectiveOn} onChange={(e) => setForm({ ...form, effectiveOn: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white" />
            </label>
            <label className="text-sm text-slate-300">Fecha prevista (opcional)
              <input type="date" value={form.dueOn} onChange={(e) => setForm({ ...form, dueOn: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white" />
            </label>
            <label className="text-sm text-slate-300 md:col-span-2">Notas
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white" />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setFormOpen(false); setEditingId(null); }} className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-slate-300">Cancelar</button>
            <button type="submit" disabled={updating !== ''} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{updating ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Guardar compromiso'}</button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-amber-800/50 bg-amber-950/20 p-4"><p className="text-sm text-amber-200">Pendiente de reponer</p><p className="mt-1 text-2xl font-bold text-white">{euro(totals.replenishment)}</p></div>
        <div className="rounded-xl border border-sky-800/50 bg-sky-950/20 p-4"><p className="text-sm text-sky-200">Reservado</p><p className="mt-1 text-2xl font-bold text-white">{euro(totals.reserve)}</p></div>
        <div className="rounded-xl border border-purple-800/50 bg-purple-950/20 p-4"><p className="text-sm text-purple-200">Extra previsto</p><p className="mt-1 text-2xl font-bold text-white">{euro(totals.extra)}</p></div>
      </div>

      {statusWarnings.length > 0 && (
        <div role="alert" className="rounded-xl border border-amber-700/50 bg-amber-950/20 p-4">
          <p className="text-sm font-semibold text-amber-200">Hay {statusWarnings.length} registro(s) cuyo estado no coincide con sus notas</p>
          <div className="mt-2 space-y-1">
            {statusWarnings.map((item) => <p key={item.id} className="text-xs leading-5 text-amber-100/80">{item.title}: figura como completado, pero la nota indica que el pago no está confirmado.</p>)}
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
                        <div className="flex flex-wrap items-center justify-between gap-3 md:justify-end">
                          <div className="text-right">
                            <p className="font-semibold text-white">{euro(item.amount)}</p>
                            {item.outstandingAmount > 0 && item.outstandingAmount < item.amount && <p className="text-xs text-slate-500">Pendiente: {euro(item.outstandingAmount)}</p>}
                          </div>
                          <button onClick={() => openEdit(item)} className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-2 text-xs text-slate-200 hover:bg-slate-700"><PencilSquareIcon className="h-4 w-4" /> Editar</button>
                          {item.kind === 'replenishment' && item.status !== 'settled' && <button disabled={updating === item.id} onClick={() => update(item, 'settled')} className="inline-flex items-center gap-1 rounded-lg bg-emerald-900/30 px-3 py-2 text-xs text-emerald-300 hover:bg-emerald-900/50 disabled:opacity-50"><CheckCircleIcon className="h-4 w-4" /> Marcar repuesto</button>}
                          {item.kind === 'reserve' && item.status === 'reserved' && <button disabled={updating === item.id} onClick={() => update(item, 'released')} className="rounded-lg bg-sky-900/30 px-3 py-2 text-xs text-sky-300 hover:bg-sky-900/50 disabled:opacity-50">Liberar reserva</button>}
                          {item.kind === 'planned_extra' && item.status === 'open' && <div className="flex gap-2"><button disabled={updating === item.id} onClick={() => update(item, 'settled')} className="rounded-lg bg-emerald-900/30 px-3 py-2 text-xs text-emerald-300 hover:bg-emerald-900/50 disabled:opacity-50">Marcar pagado</button><button disabled={updating === item.id} onClick={() => update(item, 'released')} className="rounded-lg bg-slate-800 px-3 py-2 text-xs text-slate-300 hover:bg-slate-700 disabled:opacity-50">Cancelar</button></div>}
                          <button onClick={() => deleteItem(item)} disabled={updating === item.id} className="inline-flex items-center gap-1 rounded-lg bg-rose-950/30 px-3 py-2 text-xs text-rose-300 hover:bg-rose-900/40 disabled:opacity-50"><TrashIcon className="h-4 w-4" /> Eliminar</button>
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

      <p className="text-xs text-slate-500">Cerrar una reposición, reserva o gasto previsto solo actualiza su estado. No modifica los saldos bancarios; el movimiento de dinero real se registra por separado cuando ocurre.</p>
    </div>
  )
}
