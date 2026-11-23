import FinanceSelect from '@/components/ui/FinanceSelect'
import { useEffect, useMemo, useState } from 'react'
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { motion } from 'framer-motion'
import { sumMoney, sumMoneyBy } from '@/lib/finance-core'
import { TrendingUp, RefreshCw, AlertCircle } from 'lucide-react'

const PALETTE = ['#10b981', '#0ea5e9', '#8b5cf6', '#f59e0b', '#ec4899', '#14b8a6', '#64748b']

const euro = (value, currency = 'EUR') => new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency,
}).format(Number(value || 0))

const monthKey = (value) => String(value || '').slice(0, 7)

const monthLabel = (value) => {
  const parts = String(value || '').split('-').map(Number)
  if (parts.length !== 2 || !Number.isInteger(parts[0]) || !Number.isInteger(parts[1]) || parts[1] < 1 || parts[1] > 12) {
    return value
  }
  const label = new Date(parts[0], parts[1] - 1, 1).toLocaleDateString('es-ES', {
    month: 'long',
    year: 'numeric',
  })
  return label.charAt(0).toLocaleUpperCase('es-ES') + label.slice(1)
}

const colorFor = (name) => {
  const text = String(name || 'Otros')
  const hash = [...text].reduce((value, char) => ((value * 31) + char.charCodeAt(0)) >>> 0, 7)
  return PALETTE[hash % PALETTE.length]
}

export default function GraficoIngresos({ modo = 'mesActual' }) {
  const [ingresos, setIngresos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filtroMes, setFiltroMes] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadData() {
      setLoading(true)
      setError('')

      try {
        const response = await fetch('/api/ingresos', { cache: 'no-store' })
        if (!response.ok) throw new Error('No se pudieron cargar los ingresos.')
        const incomeData = await response.json()
        if (!Array.isArray(incomeData)) throw new Error('La respuesta de ingresos no es válida.')

        if (!cancelled) setIngresos(incomeData)
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Error al cargar los ingresos.')
          setIngresos([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadData()
    return () => { cancelled = true }
  }, [])

  const mesesDisponibles = useMemo(() => {
    return [...new Set(ingresos.map((item) => monthKey(item.fecha)).filter(Boolean))]
      .sort((a, b) => b.localeCompare(a))
  }, [ingresos])

  const mesActual = useMemo(() => {
    const now = new Date()
    return String(now.getFullYear()) + '-' + String(now.getMonth() + 1).padStart(2, '0')
  }, [])

  const ingresosFiltrados = useMemo(() => {
    const selectedMonth = modo === 'filtrados' ? filtroMes : mesActual
    return ingresos.filter((item) => {
      if (!item.fecha) return false
      return !selectedMonth || monthKey(item.fecha) === selectedMonth
    })
  }, [ingresos, modo, filtroMes, mesActual])

  const datosGrafico = useMemo(() => {
    const validIncome = ingresosFiltrados.filter((ingreso) => {
      const amount = Number(ingreso.monto)
      return Number.isFinite(amount) && amount > 0
    })
    const grouped = sumMoneyBy(
      validIncome,
      (ingreso) => ingreso.categoria || 'Otros',
      (ingreso) => ingreso.monto
    )
    const total = sumMoney(Object.values(grouped))
    const data = Object.entries(grouped)
      .map(([name, value]) => ({
        name,
        value,
        color: colorFor(name),
        percentage: total > 0 ? (value / total) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value)

    return { data, total }
  }, [ingresosFiltrados])

  const periodoTexto = modo === 'filtrados'
    ? (filtroMes ? monthLabel(filtroMes) : 'Todos los periodos')
    : monthLabel(mesActual)

  const TooltipContent = ({ active, payload }) => {
    if (!active || !payload?.length) return null
    const item = payload[0].payload
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 shadow-xl">
        <p className="text-sm font-semibold text-white">{item.name}</p>
        <p className="mt-1 text-sm text-emerald-300">{euro(item.value)}</p>
        <p className="text-xs text-slate-400">{item.percentage.toFixed(1)}% del periodo</p>
      </div>
    )
  }

  if (loading) {
    return (
      <Card className="border border-slate-800 bg-slate-900/80">
        <CardContent className="flex min-h-64 items-center justify-center gap-3 text-slate-400">
          <RefreshCw className="h-5 w-5 animate-spin text-emerald-400" />
          Cargando distribución de ingresos…
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="border border-rose-900/60 bg-slate-900/80">
        <CardContent className="flex items-start gap-3 p-5 text-sm text-rose-200">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div><p className="font-semibold">No se pudo cargar el resumen de ingresos</p><p className="mt-1 text-rose-200/80">{error}</p></div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="h-full border border-slate-800 bg-slate-900/80 shadow-lg shadow-black/10">
      <CardHeader className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-emerald-500/10 p-2.5">
            <TrendingUp className="h-5 w-5 text-emerald-400" />
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base font-semibold text-white">Ingresos</CardTitle>
            <p className="mt-0.5 text-xs text-slate-400">Distribución por categoría · {periodoTexto}</p>
          </div>
          {modo === 'filtrados' && (
            <FinanceSelect
              value={filtroMes}
              onChange={(event) => setFiltroMes(event.target.value)}
              className="max-w-40 rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-slate-200 outline-none focus:border-emerald-500"
              aria-label="Filtrar ingresos por mes"
            >
              <option value="">Todos</option>
              {mesesDisponibles.map((month) => <option key={month} value={month}>{monthLabel(month)}</option>)}
            </FinanceSelect>
          )}
        </div>
        <div className="flex items-end justify-between border-t border-slate-800 pt-3">
          <span className="text-xs text-slate-400">Total del periodo</span>
          <span className="text-2xl font-semibold tracking-tight text-emerald-300">{euro(datosGrafico.total)}</span>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {datosGrafico.data.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center text-center">
            <TrendingUp className="mb-3 h-10 w-10 text-slate-600" />
            <p className="text-sm font-medium text-slate-300">Todavía no hay ingresos en este periodo</p>
            <p className="mt-1 text-xs text-slate-500">Cuando registres un ingreso aparecerá aquí.</p>
          </div>
        ) : (
          <>
            <motion.div className="h-56 w-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={datosGrafico.data} dataKey="value" nameKey="name" innerRadius={58} outerRadius={88} paddingAngle={3} stroke="#0f172a" strokeWidth={2}>
                    {datosGrafico.data.map((item) => <Cell key={item.name} fill={item.color} />)}
                  </Pie>
                  <Tooltip content={<TooltipContent />} />
                  <Legend verticalAlign="bottom" height={30} formatter={(value) => <span className="text-xs text-slate-300">{value}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </motion.div>
            <div className="space-y-2">
              {datosGrafico.data.slice(0, 5).map((item) => (
                <div key={item.name} className="flex items-center gap-3 text-sm">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="min-w-0 flex-1 truncate text-slate-300">{item.name}</span>
                  <span className="text-xs text-slate-500">{item.percentage.toFixed(1)}%</span>
                  <span className="w-24 text-right font-medium tabular-nums text-white">{euro(item.value)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
