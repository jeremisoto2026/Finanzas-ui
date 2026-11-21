import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Loader2, RefreshCw, XCircle } from 'lucide-react'

function todayKey() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}
function money(value, currency) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: currency || 'EUR' }).format(Number(value || 0))
}

export default function Transferencias() {
  const [accounts, setAccounts] = useState([])
  const [transfers, setTransfers] = useState([])
  const [fromAccountId, setFromAccountId] = useState('')
  const [toAccountId, setToAccountId] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayKey())
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [accountsResponse, transfersResponse] = await Promise.all([fetch('/api/cuentas'), fetch('/api/transferencias')])
      const [accountRows, transferRows] = await Promise.all([accountsResponse.json(), transfersResponse.json()])
      if (!accountsResponse.ok) throw new Error(accountRows.error || 'No se pudieron cargar las cuentas.')
      if (!transfersResponse.ok) throw new Error(transferRows.error || 'No se pudieron cargar las transferencias.')
      const active = (accountRows || []).filter((account) => account.isActive !== false)
      setAccounts(active)
      setTransfers(Array.isArray(transferRows) ? transferRows : [])
      setFromAccountId((current) => active.some((account) => account.id === current) ? current : active[0]?.id || '')
      setToAccountId((current) => active.some((account) => account.id === current) ? current : active[1]?.id || '')
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los datos.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const fromAccount = accounts.find((account) => account.id === fromAccountId)
  const compatibleDestinations = useMemo(() => accounts.filter((account) =>
    account.id !== fromAccountId && String(account.currencyCode || 'EUR').trim() === String(fromAccount?.currencyCode || 'EUR').trim()
  ), [accounts, fromAccountId, fromAccount?.currencyCode])

  useEffect(() => {
    if (!compatibleDestinations.some((account) => account.id === toAccountId)) setToAccountId(compatibleDestinations[0]?.id || '')
  }, [compatibleDestinations, toAccountId])

  async function submit(event) {
    event.preventDefault()
    setSaving(true); setError(''); setNotice('')
    try {
      const response = await fetch('/api/transferencias', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromAccountId, toAccountId, amount: Number(amount), date, description,
          idempotencyKey: crypto.randomUUID(),
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo registrar la transferencia.')
      setAmount(''); setDescription('')
      setNotice('Transferencia registrada. Los dos saldos se han actualizado.')
      await load()
    } catch (err) {
      setError(err.message || 'No se pudo registrar la transferencia.')
    } finally { setSaving(false) }
  }

  async function cancelTransfer(transfer) {
    if (!window.confirm('¿Anular esta transferencia? Se anularán conjuntamente sus dos movimientos y se restaurarán los saldos.')) return
    setBusyId(transfer.id); setError(''); setNotice('')
    try {
      const response = await fetch('/api/transferencias', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: transfer.id }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo anular la transferencia.')
      setNotice('Transferencia anulada. Los saldos se han recalculado.')
      await load()
    } catch (err) { setError(err.message || 'No se pudo anular la transferencia.') }
    finally { setBusyId('') }
  }

  return (
    <section className="mx-auto w-full max-w-6xl space-y-6 pb-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">Gestión de cuentas</p>
          <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">Transferencias</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Mueve dinero entre tus propias cuentas sin registrarlo como ingreso ni como gasto.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"><RefreshCw className={'h-4 w-4 ' + (loading ? 'animate-spin' : '')}/>Actualizar</button>
      </header>

      {notice && <p role="status" className="rounded-xl border border-emerald-800/50 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-200">{notice}</p>}
      {error && <p role="alert" className="rounded-xl border border-rose-800/50 bg-rose-950/20 px-4 py-3 text-sm text-rose-200">{error}</p>}

      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 sm:p-6">
        <div className="flex items-center gap-2"><ArrowLeftRight className="h-5 w-5 text-emerald-300"/><h2 className="font-semibold text-white">Nueva transferencia</h2></div>
        {accounts.length < 2 ? <p className="rounded-xl border border-amber-800/50 bg-amber-950/20 p-3 text-sm text-amber-200">Necesitas al menos dos cuentas activas para transferir dinero.</p> : (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm text-slate-300">Cuenta de origen
                <select required value={fromAccountId} onChange={(event) => setFromAccountId(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white">
                  {accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currencyCode}</option>)}
                </select>
              </label>
              <label className="text-sm text-slate-300">Cuenta de destino
                <select required value={toAccountId} onChange={(event) => setToAccountId(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white">
                  {compatibleDestinations.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
              </label>
              <label className="text-sm text-slate-300">Importe
                <input required type="number" min="0.01" step="0.01" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0,00" className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white"/>
              </label>
              <label className="text-sm text-slate-300">Fecha
                <input required type="date" max={todayKey()} value={date} onChange={(event) => setDate(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white"/>
              </label>
              <label className="text-sm text-slate-300 md:col-span-2">Concepto (opcional)
                <input maxLength={160} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ej. Pasar dinero a Revolut" className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white"/>
              </label>
            </div>
            <p className="text-xs leading-5 text-slate-500">Solo se permiten transferencias entre cuentas de la misma moneda. El sistema comprobará el dinero libre de reservas antes de confirmar.</p>
            <div className="flex justify-end border-t border-slate-800 pt-4">
              <button type="submit" disabled={saving || !fromAccountId || !toAccountId || fromAccountId === toAccountId || !compatibleDestinations.length} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
                {saving ? <Loader2 className="h-4 w-4 animate-spin"/> : <ArrowLeftRight className="h-4 w-4"/>}{saving ? 'Registrando…' : 'Confirmar transferencia'}
              </button>
            </div>
          </>
        )}
      </form>

      <section className="space-y-3">
        <div className="flex items-end justify-between"><div><h2 className="font-semibold text-white">Historial de transferencias</h2><p className="mt-1 text-xs text-slate-500">Las anuladas se conservan para mantener el historial.</p></div><span className="text-xs text-slate-500">{transfers.length} registros</span></div>
        {loading ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-slate-400"/></div> : transfers.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-400">Todavía no hay transferencias registradas.</div> : (
          <div className="space-y-2">
            {transfers.map((transfer) => <article key={transfer.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className={'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ' + (transfer.status === 'cancelled' ? 'bg-slate-800 text-slate-500' : 'bg-emerald-500/10 text-emerald-300')}><ArrowLeftRight className="h-5 w-5"/></span>
                <div className="min-w-0"><p className="truncate text-sm font-semibold text-white">{transfer.fromAccount} <span className="text-slate-500">→</span> {transfer.toAccount}</p><p className="mt-1 text-xs text-slate-500">{transfer.date}{transfer.description ? ' · ' + transfer.description : ''} · {transfer.status === 'cancelled' ? 'Anulada' : 'Contabilizada'}</p></div>
              </div>
              <div className="flex items-center gap-3"><span className={'font-semibold tabular-nums ' + (transfer.status === 'cancelled' ? 'text-slate-500 line-through' : 'text-white')}>{money(transfer.amount, transfer.currencyCode)}</span>{transfer.status !== 'cancelled' && <button type="button" onClick={() => void cancelTransfer(transfer)} disabled={busyId === transfer.id} className="rounded-lg p-2 text-slate-500 hover:bg-rose-950/40 hover:text-rose-300 disabled:opacity-50" aria-label="Anular transferencia" title="Anular transferencia">{busyId === transfer.id ? <Loader2 className="h-4 w-4 animate-spin"/> : <XCircle className="h-4 w-4"/>}</button>}</div>
            </article>)}
          </div>
        )}
      </section>
    </section>
  )
}
