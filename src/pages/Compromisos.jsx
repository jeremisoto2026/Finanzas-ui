import FinanceSelect from '@/components/ui/FinanceSelect'
import ReservasPanel from '@/components/ReservasPanel'
import { useEffect, useMemo, useState } from 'react'
import { ArrowPathIcon, BanknotesIcon, CheckCircleIcon, PlusIcon, PencilSquareIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { sumMoney } from '@/lib/finance-core'
import { useConfirmationDialog } from '@/components/ui/ConfirmationDialog'

const euro = (value) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(value || 0))
const today = () => {
  const date = new Date()
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10)
}
const emptyForm = {
  title: '',
  amount: '',
  outstandingAmount: '',
  beneficiary: '',
  dueOn: '',
  notes: '',
}

export default function Compromisos() {
  const confirm = useConfirmationDialog()
  const [items, setItems] = useState([])
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [updating, setUpdating] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [settlement, setSettlement] = useState(null)

  const load = async () => {
    try {
      setLoading(true)
      setError('')
      const [itemsResponse, accountsResponse] = await Promise.all([
        fetch('/api/compromisos', { cache: 'no-store' }),
        fetch('/api/cuentas', { cache: 'no-store' }),
      ])
      if (!itemsResponse.ok) throw new Error('No se pudieron cargar las reposiciones.')
      const rows = await itemsResponse.json()
      setItems(Array.isArray(rows) ? rows : [])
      if (accountsResponse.ok) {
        const accountRows = await accountsResponse.json()
        setAccounts(Array.isArray(accountRows) ? accountRows.filter((row) => row.currencyCode === 'EUR') : [])
      }
    } catch (err) {
      setError(err.message || 'Error al cargar las reposiciones.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const pendingItems = useMemo(
    () => items.filter((item) => Number(item.outstandingAmount || 0) > 0 && item.status !== 'settled'),
    [items]
  )
  const pendingTotal = useMemo(
    () => sumMoney(pendingItems, (item) => item.outstandingAmount || 0),
    [pendingItems]
  )

  const openNew = () => {
    setEditingId(null)
    setForm(emptyForm)
    setError('')
    setNotice('')
    setFormOpen(true)
  }

  const openEdit = (item) => {
    setEditingId(item.id)
    setForm({
      title: item.title,
      amount: String(item.amount),
      outstandingAmount: String(item.outstandingAmount),
      beneficiary: item.beneficiary || '',
      dueOn: item.dueOn || '',
      notes: item.notes || '',
    })
    setError('')
    setNotice('')
    setFormOpen(true)
  }

  const saveItem = async (event) => {
    event.preventDefault()
    const amount = Number(form.amount)
    const outstandingAmount = Number(form.outstandingAmount === '' ? form.amount : form.outstandingAmount)
    if (!form.title.trim() || !Number.isFinite(amount) || amount <= 0 ||
        !Number.isFinite(outstandingAmount) || outstandingAmount < 0 || outstandingAmount > amount) {
      setError('Revisa el título, el importe total y el pendiente de reponer.')
      return
    }
    try {
      setUpdating(editingId || 'new')
      setError('')
      const response = await fetch('/api/compromisos', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(editingId ? { id: editingId } : { kind: 'replenishment' }),
          ...form,
          amount,
          outstandingAmount,
          kind: 'replenishment',
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo guardar la reposición.')
      setItems((current) => editingId
        ? current.map((row) => row.id === editingId ? result : row)
        : [...current, result])
      setForm(emptyForm)
      setEditingId(null)
      setFormOpen(false)
      setNotice('La reposición se ha guardado correctamente. No se ha modificado ninguna cuenta.')
    } catch (err) {
      setError(err.message || 'No se pudo guardar la reposición.')
    } finally {
      setUpdating('')
    }
  }

  const openSettlement = (item) => {
    const defaultAccount = accounts.find((account) => account.name === 'Revolut') || accounts[0]
    setError('')
    setNotice('')
    setSettlement({
      item,
      amount: String(item.outstandingAmount),
      accountId: defaultAccount?.id || '',
      occurredOn: today(),
      idempotencyKey: 'replenishment:' + item.id + ':' + crypto.randomUUID(),
    })
  }

  const submitSettlement = async (event) => {
    event.preventDefault()
    if (!settlement) return
    const amount = Number(settlement.amount)
    if (!settlement.accountId || !Number.isFinite(amount) || amount <= 0 || amount > Number(settlement.item.outstandingAmount)) {
      setError('Selecciona la cuenta e indica un importe válido que no supere el pendiente.')
      return
    }
    try {
      setUpdating(settlement.item.id)
      setError('')
      const response = await fetch('/api/compromisos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'settle',
          id: settlement.item.id,
          accountId: settlement.accountId,
          amount,
          occurredOn: settlement.occurredOn,
          idempotencyKey: settlement.idempotencyKey,
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo registrar la reposición.')
      setItems((current) => current.map((row) => row.id === result.item.id ? result.item : row))
      setSettlement(null)
      setNotice(result.alreadyRecorded
        ? 'Esta reposición ya estaba registrada. No se ha creado otro ingreso.'
        : 'Reposición registrada como ingreso en la cuenta seleccionada.')
    } catch (err) {
      setError(err.message || 'No se pudo registrar la reposición.')
    } finally {
      setUpdating('')
    }
  }

  const deleteItem = async (item) => {
    const approved = await confirm({
      title: '¿Eliminar esta reposición?',
      description: `Se eliminará «${item.title}» del seguimiento. No se creará ni se eliminará ningún movimiento bancario.`,
      confirmLabel: 'Eliminar reposición',
    })
    if (!approved) return
    try {
      setUpdating(item.id)
      setError('')
      const response = await fetch('/api/compromisos', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo eliminar la reposición.')
      setItems((current) => current.filter((row) => row.id !== item.id))
    } catch (err) {
      setError(err.message || 'No se pudo eliminar la reposición.')
    } finally {
      setUpdating('')
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 text-slate-100">
      <ReservasPanel />
      {settlement && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4">
          <form onSubmit={submitSettlement} className="w-full max-w-lg space-y-4 rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Registrar ingreso</p>
                <h2 className="mt-1 text-lg font-bold text-white">Marcar dinero como repuesto</h2>
                <p className="mt-1 text-sm text-slate-400">{settlement.item.title} · Pendiente {euro(settlement.item.outstandingAmount)}</p>
              </div>
              <button type="button" onClick={() => setSettlement(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800" aria-label="Cerrar"><XMarkIcon className="h-5 w-5" /></button>
            </div>
            <label className="block text-sm text-slate-300">Cuenta donde recibiste el dinero
              <FinanceSelect required value={settlement.accountId} onChange={(event) => setSettlement((current) => ({ ...current, accountId: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white">
                <option value="">Seleccionar cuenta</option>
                {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
              </FinanceSelect>
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-sm text-slate-300">Importe recibido (€)
                <input required type="number" min="0.01" max={settlement.item.outstandingAmount} step="0.01" value={settlement.amount} onChange={(event) => setSettlement((current) => ({ ...current, amount: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" />
              </label>
              <label className="block text-sm text-slate-300">Fecha de recepción
                <input required type="date" value={settlement.occurredOn} onChange={(event) => setSettlement((current) => ({ ...current, occurredOn: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" />
              </label>
            </div>
            <p className="rounded-lg border border-slate-700 bg-slate-950/50 p-3 text-xs leading-5 text-slate-400">El importe se añadirá al saldo de la cuenta como ingreso y reducirá el dinero pendiente de reponer. También puedes registrar una reposición parcial.</p>
            <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
              <button type="button" onClick={() => setSettlement(null)} className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-slate-300">Cancelar</button>
              <button type="submit" disabled={updating !== '' || accounts.length === 0} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">{updating ? 'Registrando…' : 'Registrar reposición'}</button>
            </div>
          </form>
        </div>
      )}

      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-3">
            <BanknotesIcon className="h-7 w-7 text-emerald-400" />
            <h1 className="text-2xl font-bold text-white">Dinero pendiente de reponer</h1>
          </div>
          <p className="max-w-3xl text-sm text-slate-400">Registra importes que adelantaste y que deben devolverte. Al recibir el dinero, elige la cuenta para contabilizar automáticamente el ingreso.</p>
        </div>
        <button onClick={openNew} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500">
          <PlusIcon className="h-4 w-4" /> Nueva reposición
        </button>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-amber-800/50 bg-amber-950/20 p-4">
          <p className="text-sm text-amber-200">Pendiente de reponer</p>
          <p className="mt-1 text-2xl font-bold text-white">{euro(pendingTotal)}</p>
          <p className="mt-1 text-xs text-amber-200/60">{pendingItems.length} registros abiertos o parciales</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <p className="text-sm text-slate-300">Reposiciones completadas</p>
          <p className="mt-1 text-2xl font-bold text-white">{items.filter((item) => item.status === 'settled').length}</p>
          <p className="mt-1 text-xs text-slate-500">Historial de dinero recuperado</p>
        </div>
      </div>

      {error && <div role="alert" className="rounded-lg border border-rose-800 bg-rose-950/30 p-3 text-sm text-rose-200">{error}</div>}
      {notice && <div role="status" className="rounded-lg border border-emerald-800 bg-emerald-950/30 p-3 text-sm text-emerald-200">{notice}</div>}

      {formOpen && (
        <form onSubmit={saveItem} className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-white">{editingId ? 'Editar reposición' : 'Nueva reposición pendiente'}</h2>
            <button type="button" onClick={() => { setFormOpen(false); setEditingId(null); }} className="rounded-lg px-3 py-1.5 text-sm text-slate-400 hover:bg-slate-800">Cerrar</button>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="text-sm text-slate-300">Concepto
              <input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white" />
            </label>
            <label className="text-sm text-slate-300">Persona / destinatario
              <input value={form.beneficiary} onChange={(event) => setForm({ ...form, beneficiary: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white" />
            </label>
            <label className="text-sm text-slate-300">Importe total (€)
              <input required type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value, outstandingAmount: form.outstandingAmount === '' ? event.target.value : form.outstandingAmount })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white" />
            </label>
            <label className="text-sm text-slate-300">Pendiente de reponer (€)
              <input required type="number" min="0" step="0.01" value={form.outstandingAmount} onChange={(event) => setForm({ ...form, outstandingAmount: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white" />
            </label>
            <label className="text-sm text-slate-300">Fecha prevista (opcional)
              <input type="date" value={form.dueOn} onChange={(event) => setForm({ ...form, dueOn: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white" />
            </label>
            <label className="text-sm text-slate-300 md:col-span-2">Notas
              <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} rows={2} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white" />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setFormOpen(false); setEditingId(null); }} className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-slate-300">Cancelar</button>
            <button type="submit" disabled={updating !== ''} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{updating ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Guardar reposición'}</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-slate-400"><ArrowPathIcon className="h-5 w-5 animate-spin" /> Cargando reposiciones…</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-8 text-center text-slate-400">No tienes dinero pendiente de reponer.</div>
      ) : (
        <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
            <h2 className="font-semibold text-white">Historial de reposiciones</h2>
            <span className="text-xs text-slate-500">{items.length} registros</span>
          </div>
          <div className="divide-y divide-slate-800">
            {items.map((item) => (
              <div key={item.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-white">{item.title}</p>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${item.status === 'settled' ? 'bg-emerald-900/40 text-emerald-300' : 'bg-amber-900/40 text-amber-300'}`}>{item.status === 'settled' ? 'Repuesto' : item.status === 'partially_settled' ? 'Parcialmente repuesto' : 'Pendiente'}</span>
                  </div>
                  {item.beneficiary && <p className="mt-1 text-xs text-slate-500">Destinatario: {item.beneficiary}</p>}
                  {item.notes && <p className="mt-2 max-w-3xl text-sm text-slate-400">{item.notes}</p>}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 md:justify-end">
                  <div className="text-right">
                    <p className="font-semibold text-white">{euro(item.amount)}</p>
                    <p className="text-xs text-slate-500">Pendiente: {euro(item.outstandingAmount)}</p>
                  </div>
                  <button onClick={() => openEdit(item)} className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-2 text-xs text-slate-200 hover:bg-slate-700"><PencilSquareIcon className="h-4 w-4" /> Editar</button>
                  {Number(item.outstandingAmount) > 0 && <button disabled={updating === item.id} onClick={() => openSettlement(item)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-900/30 px-3 py-2 text-xs text-emerald-300 hover:bg-emerald-900/50 disabled:opacity-50"><CheckCircleIcon className="h-4 w-4" /> Marcar repuesto</button>}
                  <button onClick={() => deleteItem(item)} disabled={updating === item.id} className="inline-flex items-center gap-1 rounded-lg bg-rose-950/30 px-3 py-2 text-xs text-rose-300 hover:bg-rose-900/40 disabled:opacity-50"><TrashIcon className="h-4 w-4" /> Eliminar</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
