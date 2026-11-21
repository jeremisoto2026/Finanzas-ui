import { useEffect, useMemo, useState } from 'react'
import { BanknotesIcon, PlusIcon, PencilSquareIcon, LockOpenIcon, TrashIcon, XMarkIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import FinanceSelect from '@/components/ui/FinanceSelect'
import { sumMoneyBy } from '@/lib/finance-core'
import { useConfirmationDialog } from '@/components/ui/ConfirmationDialog'

const today = () => {
  const date = new Date()
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}
const money = (value, currency = 'EUR') => new Intl.NumberFormat('es-ES', {
  style: 'currency', currency,
}).format(Number(value || 0))
const emptyForm = { name: '', amount: '', accountId: '', reservedOn: today(), notes: '' }

export default function ReservasPanel() {
  const confirm = useConfirmationDialog()
  const [reservations, setReservations] = useState([])
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = async () => {
    try {
      setLoading(true)
      setError('')
      const [reservationsResponse, accountsResponse] = await Promise.all([
        fetch('/api/compromisos?resource=reservations', { cache: 'no-store' }),
        fetch('/api/cuentas', { cache: 'no-store' }),
      ])
      if (!reservationsResponse.ok) throw new Error('No se pudieron cargar las reservas.')
      if (!accountsResponse.ok) throw new Error('No se pudieron cargar tus cuentas. Inténtalo de nuevo.')
      const [rows, accountRows] = await Promise.all([
        reservationsResponse.json(),
        accountsResponse.json(),
      ])
      if (!Array.isArray(rows) || !Array.isArray(accountRows)) {
        throw new Error('La respuesta de reservas o cuentas no es válida.')
      }
      setReservations(rows)
      setAccounts(accountRows.filter((account) => account.isActive !== false))
    } catch (loadError) {
      setError(loadError.message || 'No se pudieron cargar las reservas.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const activeReservations = useMemo(
    () => reservations.filter((item) => item.status === 'active'),
    [reservations]
  )
  const reservedByCurrency = useMemo(() => sumMoneyBy(activeReservations, (item) => item.currencyCode || 'EUR', (item) => item.amount), [activeReservations])

  const openNew = () => {
    setEditingId(null)
    setForm({ ...emptyForm, accountId: accounts[0]?.id || '', reservedOn: today() })
    setError('')
    setNotice('')
    setFormOpen(true)
  }

  const openEdit = (item) => {
    setEditingId(item.id)
    setForm({
      name: item.name,
      amount: String(item.amount),
      accountId: item.accountId,
      reservedOn: item.reservedOn || today(),
      notes: item.notes || '',
    })
    setError('')
    setNotice('')
    setFormOpen(true)
  }

  const save = async (event) => {
    event.preventDefault()
    const amount = Number(form.amount)
    if (!form.name.trim() || !form.accountId || !Number.isFinite(amount) || amount <= 0) {
      setError('Indica un concepto, una cuenta y un importe mayor que cero.')
      return
    }
    try {
      setSaving(true)
      setError('')
      const response = await fetch('/api/compromisos?resource=reservations', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(editingId ? { id: editingId } : {}), ...form, amount }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo guardar la reserva.')
      setReservations((current) => editingId
        ? current.map((item) => item.id === editingId ? result : item)
        : [result, ...current])
      setFormOpen(false)
      setEditingId(null)
      setNotice('Reserva guardada. El saldo bancario no se ha modificado.')
    } catch (saveError) {
      setError(saveError.message || 'No se pudo guardar la reserva.')
    } finally {
      setSaving(false)
    }
  }

  const changeStatus = async (item, status) => {
    try {
      setSaving(true)
      setError('')
      const response = await fetch('/api/compromisos?resource=reservations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, status }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo actualizar la reserva.')
      setReservations((current) => current.map((row) => row.id === item.id ? result : row))
      setNotice(status === 'released' ? 'Reserva liberada. El saldo bancario no ha cambiado.' : 'Reserva activada de nuevo.')
    } catch (statusError) {
      setError(statusError.message || 'No se pudo actualizar la reserva.')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (item) => {
    const approved = await confirm({
      title: '¿Eliminar esta reserva?',
      description: `Se eliminará «${item.name}» del seguimiento. No se creará ni eliminará ningún movimiento bancario.`,
      confirmLabel: 'Eliminar reserva',
    })
    if (!approved) return
    try {
      setSaving(true)
      setError('')
      const response = await fetch('/api/compromisos?resource=reservations', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo eliminar la reserva.')
      setReservations((current) => current.filter((row) => row.id !== result.id))
    } catch (deleteError) {
      setError(deleteError.message || 'No se pudo eliminar la reserva.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-emerald-800/40 bg-slate-900/65 p-4 sm:p-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-2.5"><BanknotesIcon className="h-5 w-5 text-emerald-300" /></span>
          <div>
            <h2 className="text-lg font-semibold text-white">Reservas de dinero</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">Separa dinero por concepto y cuenta. La reserva reduce tu dinero libre, pero no crea un gasto ni cambia el saldo bancario.</p>
          </div>
        </div>
        <button type="button" onClick={openNew} disabled={!accounts.length || saving} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50">
          <PlusIcon className="h-4 w-4" /> Nueva reserva
        </button>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-emerald-800/40 bg-emerald-950/20 p-4">
          <p className="text-sm text-emerald-200">Dinero reservado activo</p>
          {Object.entries(reservedByCurrency).length ? Object.entries(reservedByCurrency).map(([currency, amount]) => (
            <p key={currency} className="mt-1 text-2xl font-bold tabular-nums text-white">{money(amount, currency)}</p>
          )) : <p className="mt-1 text-2xl font-bold tabular-nums text-white">{money(0)}</p>}
          <p className="mt-1 text-xs text-emerald-200/60">{activeReservations.length} reservas activas · importes separados por moneda</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
          <p className="text-sm text-slate-300">Cómo funciona</p>
          <p className="mt-1 text-sm leading-5 text-slate-400">Al liberar una reserva recuperas ese importe como dinero libre. Después registra el gasto real para que el saldo bancario refleje el pago.</p>
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg border border-rose-800/60 bg-rose-950/30 p-3 text-sm text-rose-200">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-emerald-800/50 bg-emerald-950/20 p-3 text-sm text-emerald-200">{notice}</p>}

      {formOpen && (
        <form onSubmit={save} className="space-y-3 rounded-xl border border-slate-700 bg-slate-950/50 p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold text-white">{editingId ? 'Editar reserva' : 'Crear reserva'}</h3>
            <button type="button" onClick={() => setFormOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800" aria-label="Cerrar"><XMarkIcon className="h-5 w-5" /></button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-slate-300">Concepto
              <input required maxLength={100} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Alquiler, abogado, comida…" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-white" />
            </label>
            <label className="text-sm text-slate-300">Cuenta de donde apartarás el dinero
              <FinanceSelect required value={form.accountId} onChange={(event) => setForm((current) => ({ ...current, accountId: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-white">
                <option value="">Seleccionar cuenta</option>
                {accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currencyCode}</option>)}
              </FinanceSelect>
            </label>
            <label className="text-sm text-slate-300">Importe ({accounts.find((account) => account.id === form.accountId)?.currencyCode || 'EUR'})
              <input required type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-white" />
            </label>
            <label className="text-sm text-slate-300">Fecha
              <input required type="date" value={form.reservedOn} onChange={(event) => setForm((current) => ({ ...current, reservedOn: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-white" />
            </label>
            <label className="text-sm text-slate-300 sm:col-span-2">Notas (opcional)
              <textarea rows={2} maxLength={500} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-white" />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setFormOpen(false)} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300">Cancelar</button>
            <button type="submit" disabled={saving} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Guardando…' : 'Guardar reserva'}</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-slate-400"><ArrowPathIcon className="h-4 w-4 animate-spin" /> Cargando reservas…</div>
      ) : reservations.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700 px-4 py-8 text-center text-sm text-slate-400">Todavía no tienes reservas. Puedes crear la primera con «Nueva reserva».</div>
      ) : (
        <div className="divide-y divide-slate-800 rounded-xl border border-slate-800">
          {reservations.map((item) => (
            <article key={item.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-medium text-white">{item.name}</h3>
                  <span className={item.status === 'active' ? 'rounded-full bg-emerald-900/40 px-2 py-0.5 text-xs text-emerald-300' : 'rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400'}>{item.status === 'active' ? 'Activa' : 'Liberada'}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{item.accountName} · {item.reservedOn ? new Date(item.reservedOn + 'T00:00:00').toLocaleDateString('es-ES') : 'Fecha no indicada'}</p>
                {item.notes && <p className="mt-1 text-sm text-slate-400">{item.notes}</p>}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
                <p className="text-lg font-semibold tabular-nums text-white">{money(item.amount, item.currencyCode)}</p>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => openEdit(item)} disabled={saving} className="rounded-lg p-2 text-sky-300 hover:bg-slate-800 disabled:opacity-50" aria-label={`Editar reserva ${item.name}`}><PencilSquareIcon className="h-4 w-4" /></button>
                  {item.status === 'active' ? (
                    <button type="button" onClick={() => changeStatus(item, 'released')} disabled={saving} className="rounded-lg p-2 text-amber-300 hover:bg-slate-800 disabled:opacity-50" aria-label={`Liberar reserva ${item.name}`} title="Liberar reserva"><LockOpenIcon className="h-4 w-4" /></button>
                  ) : (
                    <button type="button" onClick={() => changeStatus(item, 'active')} disabled={saving} className="rounded-lg p-2 text-emerald-300 hover:bg-slate-800 disabled:opacity-50" aria-label={`Reactivar reserva ${item.name}`} title="Reactivar reserva"><ArrowPathIcon className="h-4 w-4" /></button>
                  )}
                  <button type="button" onClick={() => remove(item)} disabled={saving} className="rounded-lg p-2 text-rose-300 hover:bg-slate-800 disabled:opacity-50" aria-label={`Eliminar reserva ${item.name}`}><TrashIcon className="h-4 w-4" /></button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
