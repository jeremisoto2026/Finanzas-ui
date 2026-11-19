import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Banknote,
  Check,
  CreditCard,
  Landmark,
  Loader2,
  Pencil,
  PiggyBank,
  Plus,
  RefreshCw,
  Smartphone,
  Wallet,
  X,
} from 'lucide-react'
import { useScrollToForm } from '@/lib/useScrollToForm'

const ACCOUNT_TYPES = [
  { value: 'bank', label: 'Cuenta bancaria', icon: Landmark },
  { value: 'cash', label: 'Efectivo', icon: Banknote },
  { value: 'debit_card', label: 'Tarjeta de débito', icon: CreditCard },
  { value: 'credit_card', label: 'Tarjeta de crédito', icon: CreditCard },
  { value: 'digital_wallet', label: 'Monedero digital', icon: Smartphone },
  { value: 'savings', label: 'Ahorro', icon: PiggyBank },
  { value: 'other', label: 'Otra cuenta', icon: Wallet },
]

const todayInSpain = () => new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date())

const emptyForm = () => ({
  name: '',
  institution: '',
  accountType: 'bank',
  currencyCode: 'EUR',
  openingBalance: '0',
  openingBalanceDate: todayInSpain(),
})

const formatMoney = (value, currency = 'EUR') => new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency,
}).format(Number(value || 0))

const formatDate = (value) => value
  ? new Date(String(value).slice(0, 10) + 'T00:00:00').toLocaleDateString('es-ES')
  : 'Sin movimientos'

function AccountCard({ account, onEdit, onToggleActive, busyId }) {
  const type = ACCOUNT_TYPES.find((item) => item.value === account.accountType) || ACCOUNT_TYPES[6]
  const Icon = type.icon
  const isBusy = busyId === account.id

  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-900/65 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-emerald-500/15 bg-emerald-500/10 text-emerald-300">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold text-white">{account.name}</h3>
          <p className="mt-0.5 truncate text-xs text-slate-400">
            {account.institution || type.label} · {account.currencyCode}
          </p>
        </div>
        <span className={'rounded-full px-2 py-1 text-[10px] font-semibold ' + (
          account.isActive
            ? 'bg-emerald-900/30 text-emerald-300'
            : 'bg-slate-800 text-slate-400'
        )}>
          {account.isActive ? 'Activa' : 'Inactiva'}
        </span>
      </div>
      <p className="mt-4 text-2xl font-bold tabular-nums text-white">
        {formatMoney(account.balance, account.currencyCode)}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        {account.lastMovementOn ? 'Último movimiento: ' + formatDate(account.lastMovementOn) : 'Saldo inicial sin movimientos'}
      </p>
      <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-800 pt-3">
        <button
          type="button"
          onClick={() => onEdit(account)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-sky-300 hover:bg-slate-800"
        >
          <Pencil className="h-3.5 w-3.5" />
          Editar
        </button>
        <button
          type="button"
          disabled={isBusy}
          onClick={() => onToggleActive(account)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-50"
        >
          {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {account.isActive ? 'Desactivar' : 'Reactivar'}
        </button>
      </div>
    </article>
  )
}

export default function Cuentas() {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const formRef = useScrollToForm(formOpen, editingId)

  const loadAccounts = useCallback(async () => {
    try {
      setLoading(true)
      setLoadError('')
      const response = await fetch('/api/cuentas', { cache: 'no-store' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudieron cargar las cuentas.')
      if (!Array.isArray(result)) throw new Error('La respuesta de cuentas no es válida.')
      setAccounts(result)
    } catch (error) {
      setLoadError(error.message || 'No se pudieron cargar las cuentas.')
      setAccounts([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAccounts()
  }, [loadAccounts])

  const activeAccounts = useMemo(() => accounts.filter((account) => account.isActive), [accounts])
  const inactiveAccounts = useMemo(() => accounts.filter((account) => !account.isActive), [accounts])

  const openNew = () => {
    setEditingId(null)
    setForm(emptyForm())
    setFormError('')
    setNotice('')
    setFormOpen(true)
  }

  const openEdit = (account) => {
    setEditingId(account.id)
    setForm({
      name: account.name || '',
      institution: account.institution || '',
      accountType: account.accountType || 'bank',
      currencyCode: account.currencyCode || 'EUR',
      openingBalance: String(account.openingBalance ?? account.balance ?? 0),
      openingBalanceDate: account.openingBalanceDate || todayInSpain(),
    })
    setFormError('')
    setNotice('')
    setFormOpen(true)
  }

  const saveAccount = async (event) => {
    event.preventDefault()
    const name = form.name.trim()
    const currencyCode = form.currencyCode.trim().toUpperCase()
    const openingBalance = Number(form.openingBalance)
    if (!name) return setFormError('Escribe un nombre para identificar la cuenta.')
    if (!/^[A-Z]{3}$/.test(currencyCode)) return setFormError('Introduce un código de moneda de tres letras, por ejemplo EUR.')
    if (!editingId && !Number.isFinite(openingBalance)) return setFormError('Introduce un saldo inicial válido.')
    if (!editingId && !form.openingBalanceDate) return setFormError('Selecciona la fecha del saldo inicial.')

    const payload = {
      name,
      institution: form.institution.trim(),
      accountType: form.accountType,
      currencyCode,
      ...(!editingId ? { openingBalance, openingBalanceDate: form.openingBalanceDate } : {}),
    }

    try {
      setSaving(true)
      setFormError('')
      const response = await fetch('/api/cuentas', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(editingId ? { accountId: editingId } : {}), ...payload }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo guardar la cuenta.')
      setFormOpen(false)
      setEditingId(null)
      setNotice(editingId ? 'Cuenta actualizada.' : 'Cuenta creada correctamente.')
      await loadAccounts()
    } catch (error) {
      setFormError(error.message || 'No se pudo guardar la cuenta.')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (account) => {
    const nextState = !account.isActive
    try {
      setBusyId(account.id)
      setNotice('')
      const response = await fetch('/api/cuentas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: account.id, isActive: nextState }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo cambiar el estado de la cuenta.')
      setAccounts((current) => current.map((item) => item.id === account.id ? result : item))
      setNotice(nextState ? 'Cuenta reactivada.' : 'Cuenta desactivada. Su historial se conserva.')
    } catch (error) {
      setLoadError(error.message || 'No se pudo actualizar la cuenta.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="mx-auto w-full max-w-6xl space-y-6 pb-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">Configuración financiera</p>
          <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">Mis cuentas</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Crea y organiza tus bancos, tarjetas, efectivo, ahorros y monederos digitales. Cada cuenta pertenece a tu espacio privado.
          </p>
        </div>
        <button
          type="button"
          onClick={openNew}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-500"
        >
          <Plus className="h-4 w-4" />
          Añadir cuenta
        </button>
      </header>

      {notice && <p role="status" className="rounded-xl border border-emerald-800/50 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-200">{notice}</p>}
      {loadError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-800/60 bg-rose-950/20 p-4 text-sm text-rose-200">
          <span>{loadError}</span>
          <button type="button" onClick={() => void loadAccounts()} className="rounded-lg border border-rose-700/60 px-3 py-2 text-xs font-semibold hover:bg-rose-950/40">Reintentar</button>
        </div>
      )}

      {formOpen && (
        <form ref={formRef} onSubmit={saveAccount} className="scroll-mt-24 space-y-4 rounded-2xl border border-emerald-800/50 bg-slate-900/80 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">{editingId ? 'Editar cuenta' : 'Nueva cuenta'}</h2>
              <p className="mt-1 text-xs text-slate-400">{editingId ? 'Los movimientos históricos seguirán vinculados a esta cuenta.' : 'El saldo inicial es la referencia desde la fecha elegida.'}</p>
            </div>
            <button type="button" onClick={() => { setFormOpen(false); setEditingId(null) }} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800" aria-label="Cerrar formulario"><X className="h-5 w-5" /></button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm text-slate-300">Nombre de la cuenta *
              <input required maxLength={80} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-3 text-white outline-none focus:border-emerald-500" placeholder="Ej. Mi cuenta principal" />
            </label>
            <label className="text-sm text-slate-300">Banco o entidad (opcional)
              <input maxLength={100} value={form.institution} onChange={(event) => setForm({ ...form, institution: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-3 text-white outline-none focus:border-emerald-500" placeholder="Ej. Banco, emisor o entidad" />
            </label>
            <label className="text-sm text-slate-300">Tipo de cuenta
              <select value={form.accountType} onChange={(event) => setForm({ ...form, accountType: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-3 text-white outline-none focus:border-emerald-500">
                {ACCOUNT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>
            </label>
            <label className="text-sm text-slate-300">Moneda
              <input required maxLength={3} minLength={3} value={form.currencyCode} onChange={(event) => setForm({ ...form, currencyCode: event.target.value.toUpperCase() })} className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-3 text-white uppercase outline-none focus:border-emerald-500" placeholder="EUR" />
            </label>
            {!editingId && (
              <>
                <label className="text-sm text-slate-300">Saldo inicial
                  <input required type="number" step="0.01" inputMode="decimal" value={form.openingBalance} onChange={(event) => setForm({ ...form, openingBalance: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-3 text-white outline-none focus:border-emerald-500" />
                </label>
                <label className="text-sm text-slate-300">Fecha del saldo inicial
                  <input required type="date" value={form.openingBalanceDate} onChange={(event) => setForm({ ...form, openingBalanceDate: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-3 text-white outline-none focus:border-emerald-500" />
                </label>
              </>
            )}
          </div>

          {editingId && <p className="rounded-xl border border-slate-700 bg-slate-950/60 p-3 text-xs leading-5 text-slate-400">Para ajustar el saldo real sin inventar movimientos, utiliza el lápiz junto al saldo de la cuenta en el Dashboard. La moneda se bloquea cuando ya existen movimientos.</p>}
          {formError && <p role="alert" className="rounded-xl border border-rose-800/50 bg-rose-950/30 p-3 text-sm text-rose-200">{formError}</p>}
          <div className="flex flex-col-reverse gap-2 border-t border-slate-800 pt-4 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => { setFormOpen(false); setEditingId(null) }} disabled={saving} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-50">Cancelar</button>
            <button type="submit" disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Crear cuenta'}</button>
          </div>
        </form>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Cuentas activas</h2>
          <p className="mt-1 text-xs text-slate-400">{activeAccounts.length} {activeAccounts.length === 1 ? 'cuenta disponible' : 'cuentas disponibles'} para nuevos movimientos.</p>
        </div>
        {loading && <Loader2 className="h-5 w-5 animate-spin text-slate-400" />}
      </div>

      {!loading && !loadError && activeAccounts.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 p-8 text-center">
          <Wallet className="mx-auto h-8 w-8 text-slate-500" />
          <p className="mt-3 font-semibold text-white">Todavía no tienes cuentas activas</p>
          <p className="mt-1 text-sm text-slate-400">Añade tu primer banco, tarjeta o cuenta de efectivo para registrar movimientos.</p>
        </div>
      )}

      {activeAccounts.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {activeAccounts.map((account) => <AccountCard key={account.id} account={account} onEdit={openEdit} onToggleActive={toggleActive} busyId={busyId} />)}
        </div>
      )}

      {inactiveAccounts.length > 0 && (
        <details className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
          <summary className="cursor-pointer list-none text-sm font-semibold text-slate-300">
            Cuentas desactivadas ({inactiveAccounts.length})
            <span className="ml-2 text-xs font-normal text-slate-500">Se conservan para consultar el historial</span>
          </summary>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {inactiveAccounts.map((account) => <AccountCard key={account.id} account={account} onEdit={openEdit} onToggleActive={toggleActive} busyId={busyId} />)}
          </div>
        </details>
      )}

      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 text-xs leading-5 text-slate-400">
        Las cuentas no se borran físicamente desde aquí: desactivarlas evita nuevos usos y mantiene intactos los movimientos, cuotas y compromisos anteriores.
      </div>
    </section>
  )
}
