import { useEffect, useMemo, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Wallet, RefreshCw, AlertCircle, Landmark } from 'lucide-react'

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

  const total = useMemo(
    () => accounts.reduce((sum, account) => sum + Number(account.balance || 0), 0),
    [accounts]
  )

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
              <p className="text-4xl font-bold text-white">{formatMoney(total)}</p>
              <p className="mt-1 text-sm text-emerald-300">Suma de los saldos actuales, no una previsión mensual</p>
            </div>

            <div className="space-y-2">
              {accounts.map((account) => (
                <div key={account.id} className="flex items-center justify-between rounded-lg bg-slate-800/40 p-3">
                  <div className="flex items-center gap-2 text-sm text-slate-300">
                    <Landmark className="h-4 w-4 text-slate-500" />
                    {account.name}
                  </div>
                  <span className="font-semibold text-white">{formatMoney(account.balance, account.currencyCode)}</span>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-slate-700/70 bg-slate-950/40 p-3 text-xs leading-relaxed text-slate-400">
              Este saldo no suma los 344,39 € que te deben, los 136 € pendientes de reponer ni otros importes previstos o reservados. Esos conceptos se muestran por separado para no confundirlos con efectivo real.
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
