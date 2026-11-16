import { useEffect, useMemo, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Wallet, RefreshCw, AlertCircle, Landmark } from 'lucide-react'
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
  const [budgetReserve, setBudgetReserve] = useState({ loading: true, month: '', planned: 0, spent: 0, remaining: 0 })

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
        if (!cancelled) setAccounts(data)
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
        const targetMonth = eligibleBudgets.map((item) => item.month).sort()[0] || ''
        const monthBudgets = eligibleBudgets.filter((item) => item.month === targetMonth)
        const spendForBudget = (budget) => sumMoney(
          (Array.isArray(expenses) ? expenses : []).filter((expense) =>
            expense.categoria === budget.category && String(expense.fecha || '').slice(0, 7) === targetMonth
          ),
          (expense) => expense.monto || 0
        )
        const planned = sumMoney(monthBudgets, (item) => item.amount || 0)
        const spent = sumMoney(monthBudgets, spendForBudget)
        const remaining = sumMoney(monthBudgets, (item) => Math.max(0, Number(item.amount || 0) - spendForBudget(item)))
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
    </Card>
  )
}
