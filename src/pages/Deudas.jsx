import { useEffect, useMemo, useState } from 'react'
import { BanknotesIcon, PlusIcon, CheckCircleIcon, ArrowPathIcon, PencilSquareIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { sumMoney } from '@/lib/finance-core'

const euro = (value) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(value || 0))
const today = () => {
  const date = new Date()
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10)
}
const idempotencyKey = (debtId) => 'debt:' + debtId + ':' + crypto.randomUUID()

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
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settling, setSettling] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [settlement, setSettlement] = useState(null)

  const loadDebts = async () => {
    try {
      setLoading(true)
      setError('')
      const [debtsResponse, accountsResponse] = await Promise.all([
        fetch('/api/deudas', { cache: 'no-store' }),
        fetch('/api/cuentas', { cache: 'no-store' }),
      ])
      if (!debtsResponse.ok) throw new Error('No se pudieron cargar las deudas.')
      const debtRows = await debtsResponse.json()
      setDebts(Array.isArray(debtRows) ? debtRows : [])
      if (accountsResponse.ok) {
        const accountRows = await accountsResponse.json()
        setAccounts(Array.isArray(accountRows) ? accountRows.filter((row) => row.currencyCode === 'EUR') : [])
      }
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
    setNotice('')
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
    setNotice('')
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
      setNotice('La deuda se ha guardado correctamente.')
    } catch (err) {
      setError(err.message || 'No se pudo guardar la deuda.')
    } finally {
      setSaving(false)
    }
  }

  const openSettlement = (debt) => {
    const defaultAccount = accounts.find((account) => account.name === 'Revolut') || accounts[0]
    setError('')
    setNotice('')
    setSettlement({
      debt,
      amount: String(debt.outstandingAmount),
      accountId: defaultAccount?.id || '',
      occurredOn: today(),
      idempotencyKey: idempotencyKey(debt.id),
    })
  }

  const submitSettlement = async (event) => {
    event.preventDefault()
    if (!settlement) return
    const amount = Number(settlement.amount)
    if (!settlement.accountId || !Number.isFinite(amount) || amount <= 0 || amount > Number(settlement.debt.outstandingAmount)) {
      setError('Selecciona una cuenta e introduce un importe válido que no supere el saldo pendiente.')
      return
    }
    try {
      setSettling(true)
      setError('')
      const response = await fetch('/api/deudas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'settle',
          id: settlement.debt.id,
          accountId: settlement.accountId,
          amount,
          occurredOn: settlement.occurredOn,
          idempotencyKey: settlement.idempotencyKey,
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo registrar el cobro o pago.')
      setDebts((current) => current.map((item) => item.id === result.debt.id ? result.debt : item))
      setSettlement(null)
      setNotice(result.alreadyRecorded
        ? 'Este movimiento ya estaba registrado. No se ha creado otro cargo o ingreso.'
        : settlement.debt.direction === 'receivable'
          ? 'Cobro registrado como ingreso en la cuenta seleccionada.'
          : 'Pago registrado como gasto en la cuenta seleccionada.')
    } catch (err) {
      setError(err.message || 'No se pudo registrar el movimiento.')
    } finally {
      setSettling(false)
    }
  }

  const deleteDebt = async (debt) => {
    if (!confirm('¿Eliminar el registro «' + debt.personName + '»? Esta acción no crea ni modifica movimientos bancarios.')) return
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
      {settlement && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4">
          <form onSubmit={submitSettlement} className="w-full max-w-lg space-y-4 rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Registrar movimiento bancario</p>
                <h2 className="mt-1 text-lg font-bold text-white">{settlement.debt.direction === 'receivable' ? 'Registrar cobro' : 'Registrar pago'}</h2>
                <p className="mt-1 text-sm text-slate-400">{settlement.debt.personName} · Pendiente {euro(settlement.debt.outstandingAmount)}</p>
              </div>
              <button type="button" onClick={() => setSettlement(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800" aria-label="Cerrar"><XMarkIcon className="h-5 w-5" /></button>
            </div>
            <label className="block text-sm text-slate-300">{settlement.debt.direction === 'receivable' ? 'Cuenta donde recibiste el dinero' : 'Cuenta desde la que realizaste el pago'}
              <select required value={settlement.accountId} onChange={(event) => setSettlement((current) => ({ ...current, accountId: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white">
                <option value="">Seleccionar cuenta</option>
                {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-sm text-slate-300">Importe de este movimiento (€)
                <input required type="number" min="0.01" max={settlement.debt.outstandingAmount} step="0.01" value={settlement.amount} onChange={(event) => setSettlement((current) => ({ ...current, amount: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" />
              </label>
              <label className="block text-sm text-slate-300">Fecha
                <input required type="date" value={settlement.occurredOn} onChange={(event) => setSettlement((current) => ({ ...current, occurredOn: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" />
              </label>
            </div>
            <p className="rounded-lg border border-slate-700 bg-slate-950/50 p-3 text-xs leading-5 text-slate-400">
              {settlement.debt.direction === 'receivable'
                ? 'El importe se añadirá al saldo de la cuenta como ingreso y reducirá lo que te deben.'
                : 'El importe se descontará del saldo de la cuenta como gasto y reducirá lo que debes.'}
              {' '}Puedes registrar pagos parciales.
            </p>
            <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
              <button type="button" onClick={() => setSettlement(null)} className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-slate-300">Cancelar</button>
              <button type="submit" disabled={settling || accounts.length === 0} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
                {settling ? 'Registrando…' : settlement.debt.direction === 'receivable' ? 'Registrar cobro' : 'Registrar pago'}
              </button>
            </div>
          </form>
        </div>
      )}

      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-3">
            <BanknotesIcon className="h-7 w-7 text-emerald-400" />
            <h1 className="text-2xl font-bold text-white">Préstamos y deudas</h1>
          </div>
          <p className="text-sm text-slate-400">Al registrar un cobro o pago, elige la cuenta. El movimiento actualiza el saldo bancario y el pendiente de la deuda, sin duplicarlo.</p>
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
      {notice && <div role="status" className="rounded-lg border border-emerald-800 bg-emerald-950/30 p-3 text-sm text-emerald-200">{notice}</div>}

      {formOpen && (
        <form onSubmit={submit} className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-white">{editingId ? 'Editar deuda o préstamo' : 'Nueva deuda o préstamo'}</h2>
            <button type="button" onClick={() => { setFormOpen(false); setEditingId(null); }} className="rounded-lg px-3 py-1.5 text-sm text-slate-400 hover:bg-slate-800">Cerrar</button>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="text-sm text-slate-300">Persona
              <input value={form.personName} onChange={(event) => setForm({ ...form, personName: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white" required />
            </label>
            <label className="text-sm text-slate-300">Tipo
              <select value={form.direction} onChange={(event) => setForm({ ...form, direction: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white">
                <option value="receivable">Me deben</option>
                <option value="payable">Yo debo</option>
              </select>
            </label>
            <label className="text-sm text-slate-300">Importe original (€)
              <input type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value, outstandingAmount: form.outstandingAmount === '' ? event.target.value : form.outstandingAmount })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white" required />
            </label>
            <label className="text-sm text-slate-300">Saldo pendiente (€)
              <input type="number" min="0" step="0.01" value={form.outstandingAmount} onChange={(event) => setForm({ ...form, outstandingAmount: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white" placeholder="Igual al importe original" />
            </label>
            <label className="text-sm text-slate-300">Fecha prevista (opcional)
              <input type="date" value={form.dueOn} onChange={(event) => setForm({ ...form, dueOn: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white" />
            </label>
            <label className="text-sm text-slate-300 md:col-span-2">Descripción
              <input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white" />
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
                  {!['settled', 'written_off'].includes(debt.status) && <button onClick={() => openSettlement(debt)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-900/30 px-3 py-2 text-xs text-emerald-300 hover:bg-emerald-900/50"><CheckCircleIcon className="h-4 w-4" /> {debt.direction === 'receivable' ? 'Registrar cobro' : 'Registrar pago'}</button>}
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
