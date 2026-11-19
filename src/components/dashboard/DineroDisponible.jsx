import { useEffect, useMemo, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Wallet, RefreshCw, AlertCircle, Landmark, Pencil, X, Save, Loader2 } from 'lucide-react'
import { sumMoney, sumMoneyBy } from '@/lib/finance-core'

const formatDate = (value) => value ? new Date(String(value).slice(0, 10) + 'T00:00:00').toLocaleDateString('es-ES') : null

const formatMoney = (amount, currency = 'EUR') => new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency,
}).format(Number(amount || 0))

export default function DineroDisponible() {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingAccount, setEditingAccount] = useState(null)
  const [editedBalance, setEditedBalance] = useState('')
  const [savingAccount, setSavingAccount] = useState(false)
  const [accountFormError, setAccountFormError] = useState('')
  const [accountNotice, setAccountNotice] = useState('')
  const [budgetReserve, setBudgetReserve] = useState({ loading: true, month: '', planned: 0, spent: 0, remaining: 0 })

  const openAccountBalanceEditor = (account) => {
    setEditingAccount(account)
    setEditedBalance(String(account.balance ?? 0))
    setAccountFormError('')
    setAccountNotice('')
  }

  const saveAccountBalance = async (event) => {
    event.preventDefault()
    const balance = Number(editedBalance)
    if (editedBalance.trim() === '' || !Number.isFinite(balance) || Math.abs(balance) > 999999999999) {
      setAccountFormError('Introduce un saldo numérico válido.')
      return
    }

    try {
      setSavingAccount(true)
      setAccountFormError('')
      const response = await fetch('/api/cuentas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: editingAccount.id, balance }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo ajustar el saldo de la cuenta.')
      setAccounts((current) => current.map((item) => item.id === result.id ? result : item))
      setEditingAccount(null)
      setAccountNotice('Saldo actualizado. No se ha creado ningún ingreso ni gasto.')
    } catch (saveError) {
      setAccountFormError(saveError.message || 'No se pudo ajustar el saldo.')
    } finally {
      setSavingAccount(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    const loadAccounts = async () => {
      try {
        setLoading(true)
        setError('')
        const response = await fetch('/api/cuentas', { cache: 'no-store' })
        if (!response.ok) throw new Error('No se pudieron cargar los saldos bancarios.')
        const data = await response.json()
        if (!Array.isArray(data)) throw new Error('La respuesta de cuentas no es válida.')
        if (!cancelled) setAccounts(data.filter((account) => account.isActive !== false))
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Error al cargar los saldos.')
          setAccounts([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadAccounts()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    const loadBudgetReserve = async () => {
      try {
        const [budgetsResponse, expensesResponse] = await Promise.all([
          fetch('/api/presupuestos', { cache: 'no-store' }),
          fetch('/api/gastos', { cache: 'no-store' }),
        ])
        if (!budgetsResponse.ok || !expensesResponse.ok) throw new Error('No se pudo calcular el dinero apartado.')
        const [budgets, expenses] = await Promise.all([budgetsResponse.json(), expensesResponse.json()])
        const currentMonth = new Intl.DateTimeFormat('sv-SE', {
          timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit',
        }).format(new Date()).slice(0, 7)
        const eligibleBudgets = (Array.isArray(budgets) ? budgets : [])
          .filter((item) => item.month >= currentMonth)
        const availableMonths = [...new Set(eligibleBudgets.map((item) => item.month))].sort()
        const spendForBudget = (budget, month) => sumMoney(
          (Array.isArray(expenses) ? expenses : []).filter((expense) =>
            expense.categoria === budget.category && String(expense.fecha || '').slice(0, 7) === month
          ),
          (expense) => expense.monto || 0
        )
        const monthRemaining = (month) => sumMoney(
          eligibleBudgets.filter((item) => item.month === month),
          (item) => Math.max(0, Number(item.amount || 0) - spendForBudget(item, month))
        )
        const targetMonth = availableMonths.find((month) => monthRemaining(month) > 0) || ''
        const monthBudgets = eligibleBudgets.filter((item) => item.month === targetMonth)
        const planned = sumMoney(monthBudgets, (item) => item.amount || 0)
        const spent = sumMoney(monthBudgets, (item) => spendForBudget(item, targetMonth))
        const remaining = sumMoney(monthBudgets, (item) => Math.max(0, Number(item.amount || 0) - spendForBudget(item, targetMonth)))
        if (!cancelled) setBudgetReserve({ loading: false, month: targetMonth, planned, spent, remaining })
      } catch (reserveError) {
        if (!cancelled) setBudgetReserve({ loading: false, month: '', planned: 0, spent: 0, remaining: 0 })
        console.error('No se pudo calcular la reserva del presupuesto:', reserveError)
      }
    }
    loadBudgetReserve()
    return () => { cancelled = true }
  }, [])

  const totalsByCurrency = useMemo(() => sumMoneyBy(
    accounts,
    (account) => String(account.currencyCode || 'EUR').trim().toUpperCase(),
    (account) => account.balance || 0
  ), [accounts])

  return (
    <Card className="overflow-hidden border border-emerald-800/40 bg-gradient-to-br from-emerald-950/35 via-slate-900/95 to-slate-900 shadow-xl shadow-black/10">
      <CardHeader className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/10 p-2.5">
            <Wallet className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <CardTitle className="text-base font-semibold text-white">Dinero en tus cuentas</CardTitle>
            <p className="mt-0.5 text-xs text-slate-400">Saldo actual según el libro de movimientos</p>
          </div>
        </div>
        {!loading && !error && (
          <span className="sm:ml-auto rounded-full border border-slate-700 bg-slate-950/50 px-3 py-1 text-xs text-slate-400">
            {accounts.length} {accounts.length === 1 ? 'cuenta' : 'cuentas'}
          </span>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex min-h-44 items-center justify-center gap-2 text-sm text-slate-400">
            <RefreshCw className="h-5 w-5 animate-spin text-emerald-400" />
            Consultando saldos…
          </div>
        ) : error ? (
          <div role="alert" className="rounded-xl border border-rose-800/50 bg-rose-950/20 p-4 text-sm text-rose-200">
            <div className="mb-3 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
            <button type="button" onClick={() => window.location.reload()} className="text-xs font-medium text-emerald-300 underline underline-offset-4">
              Volver a cargar
            </button>
          </div>
        ) : (
          <>
            <div className="grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
              <div className="flex flex-col justify-center rounded-2xl border border-emerald-500/15 bg-slate-950/55 p-5 sm:p-6">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-300/80">
                  Total por moneda
                </p>
                {Object.entries(totalsByCurrency).length === 0 ? (
                  <p className="mt-3 text-2xl font-semibold text-white">Sin cuentas</p>
                ) : (
                  <div className="mt-3 space-y-4">
                    {Object.entries(totalsByCurrency).map(([currency, amount]) => (
                      <div key={currency}>
                        <p className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                          {formatMoney(amount, currency)}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">Saldo disponible en {currency}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between px-1 pb-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Detalle de cuentas</p>
                  <span className="text-[11px] text-slate-500">Saldo individual</span>
                </div>
                {accounts.length === 0 ? (
                  <div className="flex min-h-28 items-center justify-center rounded-xl border border-dashed border-slate-700 px-4 text-sm text-slate-500">
                    No hay cuentas configuradas.
                  </div>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {accounts.map((account) => (
                      <div key={account.id} className="min-w-0 rounded-xl border border-slate-800 bg-slate-950/45 p-3 transition-colors hover:border-slate-700">
                        <div className="flex items-center gap-2">
                          <Landmark className="h-4 w-4 shrink-0 text-slate-500" />
                          <span className="min-w-0 truncate text-sm font-medium text-slate-200">{account.name}</span>
                          <button type="button" onClick={() => openAccountBalanceEditor(account)} className="ml-auto rounded-lg p-1.5 text-sky-300 transition hover:bg-slate-800" title={`Ajustar saldo de ${account.name}`} aria-label={`Ajustar saldo de ${account.name}`}><Pencil className="h-4 w-4" /></button>
                        </div>
                        <p className="mt-3 text-xl font-semibold tabular-nums text-white">
                          {formatMoney(account.balance, account.currencyCode)}
                        </p>
                        <p className="mt-1 truncate text-[11px] text-slate-500">
                          {account.lastMovementOn
                            ? 'Último movimiento: ' + formatDate(account.lastMovementOn)
                            : 'Saldo inicial: ' + (formatDate(account.openingBalanceDate) || 'fecha no indicada')}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {budgetReserve.month && (
              <div className="grid gap-3 border-t border-slate-800/80 pt-4 sm:grid-cols-2">
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-amber-300/80">Apartado · {new Date(budgetReserve.month + '-01T00:00:00').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}</p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums text-white">{formatMoney(budgetReserve.remaining)}</p>
                  <p className="mt-1 text-xs text-slate-400">De {formatMoney(budgetReserve.planned)} planificados · {formatMoney(budgetReserve.spent)} gastados</p>
                </div>
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-emerald-300/80">Dinero libre tras reservas</p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums text-white">{formatMoney(Number(totalsByCurrency.EUR || 0) - budgetReserve.remaining)}</p>
                  <p className="mt-1 text-xs text-slate-400">Saldo EUR menos lo que aún queda por apartar</p>
                </div>
              </div>
            )}
            <div className="flex items-start gap-2 border-t border-slate-800/80 pt-3 text-xs leading-5 text-slate-500">
              <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-slate-600" />
              <p>
                Incluye los saldos iniciales y los movimientos contabilizados. Las deudas por cobrar y el dinero pendiente de reponer no se suman al saldo bancario.
              </p>
            </div>
          </>
        )}
      </CardContent>

      {accountNotice && <p role="status" className="mt-3 rounded-lg border border-emerald-800/50 bg-emerald-950/20 px-3 py-2 text-xs text-emerald-300">{accountNotice}</p>}
      {editingAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !savingAccount) setEditingAccount(null) }}>
          <section role="dialog" aria-modal="true" aria-labelledby="account-balance-title" className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 id="account-balance-title" className="text-lg font-semibold text-white">Ajustar saldo disponible</h3>
                <p className="mt-1 text-sm text-slate-400">{editingAccount.name}</p>
              </div>
              <button type="button" disabled={savingAccount} onClick={() => setEditingAccount(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 disabled:opacity-50" aria-label="Cerrar"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={saveAccountBalance}>
              <label htmlFor="real-account-balance" className="mb-2 block text-sm font-medium text-slate-300">Saldo real actual ({editingAccount.currencyCode || 'EUR'})</label>
              <input id="real-account-balance" type="number" inputMode="decimal" step="0.01" value={editedBalance} onChange={(event) => setEditedBalance(event.target.value)} autoFocus className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-lg font-semibold text-white outline-none focus:border-emerald-500" />
              <p className="mt-2 text-xs leading-5 text-slate-500">Este ajuste corrige el saldo base de la cuenta y conserva todos los movimientos históricos. No añade un gasto ni un ingreso ficticio.</p>
              {accountFormError && <p role="alert" className="mt-3 rounded-lg border border-rose-800/50 bg-rose-950/30 p-3 text-sm text-rose-200">{accountFormError}</p>}
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" disabled={savingAccount} onClick={() => setEditingAccount(null)} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-50">Cancelar</button>
                <button type="submit" disabled={savingAccount} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">{savingAccount ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Guardar saldo</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </Card>
  )
}
