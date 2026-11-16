import { useEffect, useMemo, useState } from 'react'
import { BanknotesIcon, PlusIcon, CheckCircleIcon, ArrowPathIcon, PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline'
import { sumMoney } from '@/lib/finance-core'

const euro = (value) => new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
}).format(Number(value || 0))

const emptyForm = {
  personName: '',
  amount: '',
  outstandingAmount: '',
  direction: 'receivable',
  description: '',
  dueOn: '',
}

export default function Deudas() {
  const [debts, setDebts] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)

  const loadDebts = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await fetch('/api/deudas', { cache: 'no-store' })
      if (!response.ok) throw new Error('No se pudieron cargar las deudas.')
      const data = await response.json()
      setDebts(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message || 'Error al cargar las deudas.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadDebts() }, [])

  const activeDebts = useMemo(
    () => debts.filter((debt) => !['settled', 'written_off'].includes(debt.status)),
    [debts]
  )
  const totals = useMemo(() => ({
    receivable: sumMoney(activeDebts.filter((debt) => debt.direction === 'receivable'), (debt) => debt.outstandingAmount || 0),
    payable: sumMoney(activeDebts.filter((debt) => debt.direction === 'payable'), (debt) => debt.outstandingAmount || 0),
  }), [activeDebts])

  const openNew = () => {
    setEditingId(null)
    setForm(emptyForm)
    setError('')
    setFormOpen(true)
  }

  const openEdit = (debt) => {
    setEditingId(debt.id)
    setForm({
      personName: debt.personName,
      amount: String(debt.originalAmount),
      outstandingAmount: String(debt.outstandingAmount),
      direction: debt.direction,
      description: debt.description || '',
      dueOn: debt.dueOn || '',
    })
    setError('')
    setFormOpen(true)
  }

  const submit = async (event) => {
    event.preventDefault()
    const amount = Number(form.amount)
    const outstandingAmount = Number(form.outstandingAmount === '' ? form.amount : form.outstandingAmount)
    if (!form.personName.trim() || !Number.isFinite(amount) || amount <= 0 ||
        !Number.isFinite(outstandingAmount) || outstandingAmount < 0 || outstandingAmount > amount) {
      setError('Revisa la persona, el importe original y el saldo pendiente.')
      return
    }

    try {
      setSaving(true)
      setError('')
      const response = await fetch('/api/deudas', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(editingId ? { id: editingId } : {}),
          ...form,
          amount,
          outstandingAmount,
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo guardar la deuda.')
      setDebts((current) => editingId
        ? current.map((item) => item.id === editingId ? result : item)
        : [result, ...current])
      setForm(emptyForm)
      setEditingId(null)
      setFormOpen(false)
    } catch (err) {
      setError(err.message || 'No se pudo guardar la deuda.')
    } finally {
      setSaving(false)
    }
  }

  const markSettled = async (debt) => {
    if (!confirm(`¿Marcar como saldada la deuda de ${debt.personName}?`)) return
    try {
      const response = await fetch('/api/deudas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: debt.id, outstandingAmount: 0 }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo actualizar la deuda.')
      setDebts((current) => current.map((item) => item.id === result.id ? result : item))
    } catch (err) {
      setError(err.message || 'No se pudo actualizar la deuda.')
    }
  }

  const deleteDebt = async (debt) => {
    if (!confirm(`¿Eliminar el registro «${debt.personName}»? Esta acción no crea ni modifica movimientos bancarios.`)) return
    try {
      const response = await fetch('/api/deudas', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: debt.id }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo eliminar la deuda.')
      setDebts((current) => current.filter((item) => item.id !== debt.id))
    } catch (err) {
      setError(err.message || 'No se pudo eliminar la deuda.')
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 text-slate-100">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-3">
            <BanknotesIcon className="h-7 w-7 text-emerald-400" />
            <h1 className="text-2xl font-bold text-white">Préstamos y deudas</h1>
          </div>
          <p className="text-sm text-slate-400">Edita quién te debe, lo que tú debes y el saldo pendiente. Estas cantidades no se suman al dinero disponible.</p>
        </div>
        <button onClick={openNew} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500">
          <PlusIcon className="h-4 w-4" /> Registrar deuda
        </button>
      </header>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-emerald-800/50 bg-emerald-950/20 p-4">
          <p className="text-sm text-emerald-200">Te deben</p>
          <p className="mt-1 text-2xl font-bold text-white">{euro(totals.receivable)}</p>
        </div>
        <div className="rounded-xl border border-rose-800/50 bg-rose-950/20 p-4">
          <p className="text-sm text-rose-200">Debes</p>
          <p className="mt-1 text-2xl font-bold text-white">{euro(totals.payable)}</p>
        </div>
      </div>

      {error && <div role="alert" className="rounded-lg border border-rose-800 bg-rose-950/30 p-3 text-sm text-rose-200">{error}</div>}

      {formOpen && (
        <form onSubmit={submit} className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-white">{editingId ? 'Editar deuda o préstamo' : 'Nueva deuda o préstamo'}</h2>
            <button type="button" onClick={() => { setFormOpen(false); setEditingId(null); }} className="rounded-lg px-3 py-1.5 text-sm text-slate-400 hover:bg-slate-800">Cerrar</button>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="text-sm text-slate-300">Persona
              <input value={form.personName} onChange={(e) => setForm({ ...form, personName: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white" required />
            </label>
            <label className="text-sm text-slate-300">Tipo
              <select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white">
                <option value="receivable">Me deben</option>
                <option value="payable">Yo debo</option>
              </select>
            </label>
            <label className="text-sm text-slate-300">Importe original (€)
              <input type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value, outstandingAmount: form.outstandingAmount === '' ? e.target.value : form.outstandingAmount })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white" required />
            </label>
            <label className="text-sm text-slate-300">Saldo pendiente (€)
              <input type="number" min="0" step="0.01" value={form.outstandingAmount} onChange={(e) => setForm({ ...form, outstandingAmount: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white" placeholder="Igual al importe original" />
            </label>
            <label className="text-sm text-slate-300">Fecha prevista (opcional)
              <input type="date" value={form.dueOn} onChange={(e) => setForm({ ...form, dueOn: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white" />
            </label>
            <label className="text-sm text-slate-300 md:col-span-2">Descripción
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white" />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setFormOpen(false); setEditingId(null); }} className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-slate-300">Cancelar</button>
            <button type="submit" disabled={saving} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Guardar deuda'}</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-slate-400"><ArrowPathIcon className="h-5 w-5 animate-spin" /> Cargando deudas…</div>
      ) : debts.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-8 text-center text-slate-400">Todavía no tienes préstamos o deudas registrados.</div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50">
          <div className="divide-y divide-slate-800">
            {debts.map((debt) => (
              <div key={debt.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-white">{debt.personName}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${debt.direction === 'receivable' ? 'bg-emerald-900/40 text-emerald-300' : 'bg-rose-900/40 text-rose-300'}`}>{debt.direction === 'receivable' ? 'Te deben' : 'Debes'}</span>
                    {debt.status === 'settled' && <span className="text-xs text-slate-500">Saldada</span>}
                  </div>
                  {debt.description && <p className="mt-1 max-w-2xl text-sm text-slate-400">{debt.description}</p>}
                  {debt.dueOn && <p className="mt-1 text-xs text-slate-500">Fecha prevista: {new Date(`${debt.dueOn}T00:00:00`).toLocaleDateString('es-ES')}</p>}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 md:justify-end">
                  <div className="text-right">
                    <p className="font-bold text-white">{euro(debt.outstandingAmount)}</p>
                    <p className="text-xs text-slate-500">Pendiente de {euro(debt.originalAmount)}</p>
                  </div>
                  <button onClick={() => openEdit(debt)} className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-2 text-xs text-slate-200 hover:bg-slate-700"><PencilSquareIcon className="h-4 w-4" /> Editar</button>
                  {!['settled', 'written_off'].includes(debt.status) && <button onClick={() => markSettled(debt)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-900/30 px-3 py-2 text-xs text-emerald-300 hover:bg-emerald-900/50"><CheckCircleIcon className="h-4 w-4" /> Saldar</button>}
                  <button onClick={() => deleteDebt(debt)} className="inline-flex items-center gap-1 rounded-lg bg-rose-950/30 px-3 py-2 text-xs text-rose-300 hover:bg-rose-900/40"><TrashIcon className="h-4 w-4" /> Eliminar</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
