import { useEffect, useMemo, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Wallet, RefreshCw, AlertCircle, Landmark } from 'lucide-react'
import { sumMoneyBy } from '@/lib/finance-core'

const formatDate = (value) => value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString('es-ES') : null

const formatMoney = (amount, currency = 'EUR') => new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency,
}).format(Number(amount || 0))

export default function DineroDisponible() {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const loadAccounts = async () => {
      try {
        setLoading(true)
        setError('')
        const response = await fetch('/api/cuentas')
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

  const totalsByCurrency = useMemo(() => sumMoneyBy(
    accounts,
    (account) => String(account.currencyCode || 'EUR').trim().toUpperCase(),
    (account) => account.balance || 0
  ), [accounts])

  return (
    <Card className="border border-emerald-800/30 bg-gradient-to-br from-emerald-900/40 to-slate-900/40 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg font-semibold text-white">
          <div className="rounded-lg bg-emerald-900/30 p-2">
            <Wallet className="h-5 w-5 text-emerald-400" />
          </div>
          Saldo real en tus cuentas
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-slate-400">
            <RefreshCw className="h-5 w-5 animate-spin text-emerald-400" />
            Consultando saldos…
          </div>
        ) : error ? (
          <div className="rounded-lg border border-rose-800/50 bg-rose-950/20 p-4 text-sm text-rose-200">
            <div className="mb-2 flex items-center gap-2"><AlertCircle className="h-4 w-4" />{error}</div>
            <button onClick={() => window.location.reload()} className="text-xs text-emerald-300 underline">Reintentar</button>
          </div>
        ) : (
          <>
            <div className="text-center">
              <div className="flex flex-wrap justify-center gap-3">
                {Object.entries(totalsByCurrency).map(([currency, amount]) => (
                  <div key={currency} className="text-center">
                    <p className="text-4xl font-bold text-white">{formatMoney(amount, currency)}</p>
                    <p className="mt-1 text-xs uppercase tracking-wide text-emerald-300">Total en {currency}</p>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-sm text-slate-400">Saldos actuales por moneda; no mezcla divisas distintas</p>
            </div>

            <div className="space-y-2">
              {accounts.map((account) => (
                <div key={account.id} className="flex items-center justify-between rounded-lg bg-slate-800/40 p-3">
                  <div className="flex items-center gap-2 text-sm text-slate-300">
                    <Landmark className="h-4 w-4 text-slate-500" />
                    {account.name}
                  </div>
                  <div className="text-right">
                    <span className="font-semibold text-white">{formatMoney(account.balance, account.currencyCode)}</span>
                    <p className="mt-1 max-w-48 text-xs text-slate-500">
                      {account.lastMovementOn
                        ? `Último movimiento: ${formatDate(account.lastMovementOn)}`
                        : `Sin movimientos desde el saldo inicial ${formatDate(account.openingBalanceDate) || 'registrado'}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-slate-700/70 bg-slate-950/40 p-3 text-xs leading-relaxed text-slate-400">
              Este saldo incluye el saldo inicial de cada cuenta y sus movimientos contabilizados. Los préstamos por cobrar, las reposiciones pendientes, los presupuestos y los pagos previstos se muestran por separado y no se suman al dinero bancario.
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
