import FinanceSelect from '@/components/ui/FinanceSelect'
import { useState, useMemo, useEffect, useCallback } from 'react';
import { monthKeyFromDate, sumMoney } from '@/lib/finance-core';
import { useConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { uniqueCategoryNames } from '@/lib/category-utils';
import { DEFAULT_EXPENSE_CATEGORIES } from '@/lib/category-catalog';
import { 
  Download, 
  Filter,
  Calendar,
  CreditCard,
  Database,
  Tag,
  TrendingDown,
  Bell,
  ChevronDown,
  FileText,
  Wallet,
  AlertCircle,
  RefreshCw,
  Lightbulb,
  Clock,
  TrendingUp,
  PieChart,
  Target,
  BarChart3,
  AlertTriangle,
  DollarSign,
  Percent,
  Zap,
  Shield,
  Thermometer,
  Repeat,
  Calculator,
  Receipt,
  TrendingUp as TrendingUpIcon,
  Plus,
  Save,
  X,
  Pencil,
  Trash2
} from 'lucide-react';

export default function TablaGastos() {
  const confirm = useConfirmationDialog();
  // Movimientos de gasto contabilizados procedentes del libro mayor.
  const [gastosMensuales, setGastosMensuales] = useState([]);
  const [categoriasDisponibles, setCategoriasDisponibles] = useState(DEFAULT_EXPENSE_CATEGORIES);
  const [cuentasUsuario, setCuentasUsuario] = useState([]);
  const [cuentasLoading, setCuentasLoading] = useState(true);
  const [cuentasError, setCuentasError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingGastoId, setEditingGastoId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [focusedExpense, setFocusedExpense] = useState(null);
  const [nuevoGasto, setNuevoGasto] = useState({
    concepto: '',
    monto: '',
    fecha: new Date().toISOString().slice(0, 10),
    categoria: 'Otros',
    cuentaId: '',
    metodo: 'Tarjeta'
  });

  // Estados de filtros
  const [filtroMes, setFiltroMes] = useState('');
  const [filtroMetodo, setFiltroMetodo] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');

  // Cargar únicamente gastos contabilizados. Los compromisos se muestran en Configuración.
  useEffect(() => {
    let cancelled = false

    async function fetchGastos() {
      try {
        setLoading(true)
        setError(null)
        const response = await fetch('/api/gastos', { cache: 'no-store' })
        if (!response.ok) throw new Error('No se pudieron cargar los gastos.')
        const data = await response.json()
        if (!Array.isArray(data)) throw new Error('La respuesta de gastos no tiene el formato esperado.')
        if (!cancelled) {
          setGastosMensuales(data)
          setCategoriasDisponibles((current) => uniqueCategoryNames([
            ...current,
            ...data.map((gasto) => gasto.categoria),
          ]))
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Error al cargar los gastos.')
          setGastosMensuales([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchGastos()
    return () => { cancelled = true }
  }, [])
  useEffect(() => {
    let cancelled = false
    fetch('/api/gastos?resource=categories', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error('No se pudieron cargar las categorías.')
        return response.json()
      })
      .then((data) => {
        if (!cancelled && Array.isArray(data)) setCategoriasDisponibles(data)
      })
      .catch((loadError) => console.error('No se pudieron cargar las categorías:', loadError))
    return () => { cancelled = true }
  }, [])

  const cargarCuentasUsuario = useCallback(async () => {
    setCuentasLoading(true)
    setCuentasError('')
    try {
      const response = await fetch('/api/cuentas', { cache: 'no-store' })
      if (!response.ok) throw new Error('No se pudieron cargar tus cuentas.')
      const data = await response.json()
      if (!Array.isArray(data)) throw new Error('La lista de cuentas recibida no es válida.')
      setCuentasUsuario(data)
    } catch (loadError) {
      console.error('No se pudieron cargar las cuentas para registrar gastos:', loadError)
      setCuentasUsuario([])
      setCuentasError(loadError?.message || 'No se pudieron cargar tus cuentas.')
    } finally {
      setCuentasLoading(false)
    }
  }, [])

  useEffect(() => {
    void cargarCuentasUsuario()
  }, [cargarCuentasUsuario])

  const abrirNuevoGasto = () => {
    setEditingGastoId(null)
    setNuevoGasto({
      concepto: '',
      monto: '',
      fecha: new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' }),
      categoria: categoriasDisponibles.find((category) => category.toLowerCase() === 'alimentación') || categoriasDisponibles[0] || 'Otros',
      cuentaId: '',
      metodo: 'Tarjeta',
      idempotencyKey: crypto.randomUUID(),
    })
    setFormError('')
    setFormOpen(true)
  }

  useEffect(() => {
    const handleQuickCreate = () => abrirNuevoGasto()
    window.addEventListener('finanzas:open-new-expense', handleQuickCreate)
    return () => window.removeEventListener('finanzas:open-new-expense', handleQuickCreate)
  }, [categoriasDisponibles])
  useEffect(() => {
    const applyFocus = (detail = {}) => {
      setFocusedExpense({
        merchant: String(detail.merchant || '').trim().toLocaleLowerCase('es'),
        amountCents: Number(detail.amountCents || 0),
      })
      window.__finanzasPendingExpenseFocus = null
    }
    const handleFocusExpense = (event) => applyFocus(event.detail || {})
    window.addEventListener('finanzas:focus-expense', handleFocusExpense)
    if (window.__finanzasPendingExpenseFocus) applyFocus(window.__finanzasPendingExpenseFocus)
    return () => window.removeEventListener('finanzas:focus-expense', handleFocusExpense)
  }, [])

  useEffect(() => {
    if (!focusedExpense?.merchant || !focusedExpense.amountCents || !gastosMensuales.length) return
    const match = gastosMensuales.find((expense) => {
      const merchant = String(expense.concepto || '').trim().toLocaleLowerCase('es')
      const amount = Math.round(Number(expense.monto || 0) * 100)
      return merchant === focusedExpense.merchant && amount === focusedExpense.amountCents
    })
    if (!match) return
    const month = monthKeyFromDate(match.fecha)
    if (month) setFiltroMes(month)
    window.setTimeout(() => {
      const row = document.querySelector('[data-finanzas-expense-focus="true"]')
      row?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 180)
  }, [focusedExpense, gastosMensuales])


  const editarGasto = (gasto) => {
    setEditingGastoId(gasto.id)
    setNuevoGasto({
      concepto: gasto.concepto || '',
      monto: String(gasto.monto ?? ''),
      fecha: String(gasto.fecha || '').slice(0, 10),
      categoria: gasto.categoria || 'Otros',
      cuentaId: gasto.cuentaId || '',
      metodo: gasto.metodo || 'Tarjeta',
    })
    setFormError('')
    setFormOpen(true)
  }

  const guardarGasto = async (event) => {
    event.preventDefault()
    const amount = Number(nuevoGasto.monto)
    if (!nuevoGasto.concepto.trim() || !Number.isFinite(amount) || amount <= 0 || !nuevoGasto.fecha) {
      setFormError('Completa el concepto, un importe positivo y la fecha.')
      return
    }
    const cuentaSeleccionada = cuentasUsuario.find((account) => account.id === nuevoGasto.cuentaId)
    if (!cuentaSeleccionada || (!editingGastoId && cuentaSeleccionada.isActive === false)) {
      setFormError('Selecciona una cuenta activa desde la que salió el dinero.')
      return
    }

    try {
      setSaving(true)
      setFormError('')
      const response = await fetch('/api/gastos', {
        method: editingGastoId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(editingGastoId ? { id: editingGastoId } : { idempotencyKey: nuevoGasto.idempotencyKey || crypto.randomUUID() }),
          ...nuevoGasto,
          monto: amount,
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo guardar el gasto.')

      setGastosMensuales((current) => editingGastoId
        ? current.map((item) => item.id === editingGastoId ? result : item)
        : [result, ...current])
      window.dispatchEvent(new Event('finanzas:transactions-updated'))
      setFiltroMes(result.fecha.slice(0, 7))
      setFormOpen(false)
      setEditingGastoId(null)
      setFormError('')
    } catch (err) {
      setFormError(err.message || 'No se pudo guardar el gasto.')
    } finally {
      setSaving(false)
    }
  }

  const eliminarGasto = async (gasto) => {
    const amountLabel = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(gasto.monto)
    const approved = await confirm({
      title: '¿Anular este gasto?',
      description: `«${gasto.concepto}» · ${amountLabel}. Se retirará del saldo y de los totales, pero permanecerá en el historial con estado anulado.`,
      confirmLabel: 'Anular gasto',
    })
    if (!approved) return

    try {
      setSaving(true)
      setFormError('')
      const response = await fetch('/api/gastos', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: gasto.id }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo anular el gasto.')
      setGastosMensuales((current) => current.filter((item) => item.id !== gasto.id))
      window.dispatchEvent(new Event('finanzas:transactions-updated'))
    } catch (err) {
      setFormError(err.message || 'No se pudo anular el gasto.')
    } finally {
      setSaving(false)
    }
  }

  // Los meses disponibles proceden únicamente de movimientos reales contabilizados.
  const obtenerMesesDisponibles = useMemo(() => {
    const months = new Set()
    gastosMensuales.forEach((gasto) => {
      const value = String(gasto.fecha || '').slice(0, 7)
      if (/^[0-9]{4}-[0-9]{2}$/.test(value)) months.add(value)
    })
    return Array.from(months).sort((a, b) => b.localeCompare(a))
  }, [gastosMensuales])
  // 4. Función para formatear mes a texto
  const formatearMesTexto = (mesFormato) => {
    if (!mesFormato) return '';
    const [año, mes] = mesFormato.split('-');
    const fecha = new Date(año, parseInt(mes) - 1);
    return fecha.toLocaleDateString('es-ES', { 
      month: 'long', 
      year: 'numeric' 
    });
  };

  // ========== COMBINAR Y FILTRAR DATOS ==========

  // Combinar TODOS los gastos HISTÓRICOS
  // El histórico de gastos sale únicamente del libro mayor (movimientos contabilizados).
  // Pagos fijos y cuotas son compromisos/estados; no se convierten en cargos de caja.
  const todosLosGastos = useMemo(() => (
    gastosMensuales.map((gasto) => ({ ...gasto, origen: 'normal' }))
  ), [gastosMensuales]);

  const categorias = useMemo(() => uniqueCategoryNames([
    ...categoriasDisponibles,
    ...gastosMensuales.map((gasto) => gasto.categoria),
    nuevoGasto.categoria,
    filtroCategoria,
  ]), [categoriasDisponibles, gastosMensuales, nuevoGasto.categoria, filtroCategoria]);

  // Filtrar gastos combinados
  const gastosFiltrados = useMemo(() => {
    return todosLosGastos.filter(gasto => {
      if (!gasto.fecha) return false;
      
      const mesGasto = monthKeyFromDate(gasto.fecha);
      if (!mesGasto) return false;
      
      const cumpleMes = !filtroMes || mesGasto === filtroMes;
      const cumpleMetodo = !filtroMetodo || gasto.metodo === filtroMetodo;
      const cumpleCategoria = !filtroCategoria || gasto.categoria === filtroCategoria;
      
      return cumpleMes && cumpleMetodo && cumpleCategoria;
    });
  }, [todosLosGastos, filtroMes, filtroMetodo, filtroCategoria]);

  // ========== CÁLCULOS ==========

  // 1. Total
  const total = useMemo(() => {
    return sumMoney(gastosFiltrados, (gasto) => gasto.monto || 0);
  }, [gastosFiltrados]);

  // 2. Estadísticas por tipo de gasto
  const estadisticasPorTipo = useMemo(() => ({
    normal: {
      total: sumMoney(gastosFiltrados, (gasto) => gasto.monto || 0),
      count: gastosFiltrados.length,
      label: 'Gastos registrados',
    },
    pago_fijo: { total: 0, count: 0, label: 'Pagos fijos (no incluidos)' },
    cuota: { total: 0, count: 0, label: 'Cuotas (no incluidas)' },
  }), [gastosFiltrados]);

  // 3. Exportar CSV
  const exportarCSV = () => {
    const headers = ['Fecha', 'Concepto', 'Método', 'Categoría', 'Cuenta', 'Monto', 'Origen', 'Progreso'];
    const filas = gastosFiltrados.map(g => [
      g.fecha, 
      g.concepto, 
      g.metodo, 
      g.categoria, 
      g.cuenta, 
      g.monto, 
      g.origen || 'normal',
      g.infoProgreso || ''
    ].join(','));
    
    const csv = [headers.join(','), ...filas].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `gastos_${filtroMes || 'todos'}_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  // ========== ESTADOS DE CARGA ==========
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-12 w-12 text-red-400 animate-spin mx-auto mb-4" />
          <p className="text-slate-400 text-lg">Cargando datos financieros...</p>
          <p className="text-slate-500 text-sm mt-2">Movimientos reales registrados en tus cuentas</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 p-6">
        <div className="max-w-2xl mx-auto mt-20">
          <div className="bg-red-900/20 border border-red-800/30 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="h-8 w-8 text-red-400" />
              <h2 className="text-xl font-bold text-white">Error al cargar datos</h2>
            </div>
            <p className="text-slate-300 mb-4">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition"
            >
              Reintentar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ========== RENDER ==========
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-1 pb-10 sm:px-0">
      {formError && !formOpen && (
        <p role="alert" className="rounded-xl border border-rose-800/50 bg-rose-950/30 px-4 py-3 text-sm text-rose-200">{formError}</p>
      )}
      {/* CABECERA PREMIUM */}
      <section className="relative isolate overflow-hidden rounded-[28px] border border-slate-800/90 bg-gradient-to-br from-[#101b2d] via-slate-900 to-[#281b2a] p-5 shadow-2xl shadow-black/20 sm:p-7">
        <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-rose-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-emerald-500/5 blur-3xl" />
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-rose-300"><span className="h-2 w-2 rounded-full bg-rose-400 shadow-[0_0_12px_rgba(251,113,133,0.8)]" /> Control de salidas</div>
            <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Gastos</h1>
            <p className="mt-1.5 max-w-xl text-sm text-slate-400">Una visión clara de cada salida de dinero y de cómo se distribuye.</p>
            <div className="mt-6 flex flex-wrap items-end gap-x-8 gap-y-4">
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">{filtroMes ? formatearMesTexto(filtroMes) : 'Total histórico filtrado'}</p>
                <p className="text-4xl font-bold tracking-tight tabular-nums text-rose-300 sm:text-5xl">−€{total.toFixed(2)}</p>
              </div>
              <div className="hidden h-12 w-px bg-slate-700 sm:block" />
              <div className="pb-1">
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Movimientos</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-white">{gastosFiltrados.length}</p>
              </div>
              <div className="pb-1">
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Promedio por gasto</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-200">€{(gastosFiltrados.length ? total / gastosFiltrados.length : 0).toFixed(2)}</p>
              </div>
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row xl:min-w-[250px] xl:flex-col">
            <button onClick={abrirNuevoGasto} className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-rose-950/30 transition hover:-translate-y-0.5 hover:bg-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-400/50"><Plus className="h-4 w-4" />Nuevo gasto</button>
            <button onClick={exportarCSV} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-950/40 px-5 py-3.5 text-sm font-semibold text-slate-200 transition hover:border-rose-400/40 hover:bg-slate-800"><Download className="h-4 w-4" />Exportar movimientos</button>
          </div>
        </div>
        <div className="relative mt-6 flex flex-col gap-2 border-t border-slate-700/70 pt-4 text-xs leading-relaxed text-slate-400 sm:flex-row sm:items-center">
          <span className="inline-flex shrink-0 items-center gap-2 font-semibold text-slate-300"><Shield className="h-3.5 w-3.5 text-emerald-400" /> Datos contabilizados</span>
          <span className="hidden text-slate-600 sm:inline">·</span>
          <span>Solo se muestran cargos reales registrados en tus cuentas. Los vencimientos y cuotas pendientes no se descuentan hasta contabilizarse.</span>
        </div>
      </section>

      {formOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm sm:p-6" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !saving) { setFormOpen(false); setEditingGastoId(null) }
        }}>
          <form onSubmit={guardarGasto} role="dialog" aria-modal="true" aria-labelledby="expense-dialog-title" className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-400">Libro de gastos</p>
                <h2 id="expense-dialog-title" className="mt-1 text-xl font-semibold text-white">{editingGastoId ? 'Editar gasto' : 'Registrar gasto'}</h2>
                <p className="mt-1 text-sm text-slate-400">El movimiento se reflejará en el saldo de la cuenta seleccionada.</p>
              </div>
              <button type="button" onClick={() => { setFormOpen(false); setEditingGastoId(null) }} className="rounded-xl border border-slate-700 p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white" aria-label="Cerrar formulario"><X className="h-5 w-5" /></button>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="text-sm font-medium text-slate-300 md:col-span-2">Concepto
                <input required value={nuevoGasto.concepto} onChange={(e) => setNuevoGasto({ ...nuevoGasto, concepto: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-3 text-white outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" placeholder="Ej. Compra de comida" />
              </label>
              <label className="text-sm font-medium text-slate-300">Importe (€)
                <input required type="number" min="0.01" step="0.01" value={nuevoGasto.monto} onChange={(e) => setNuevoGasto({ ...nuevoGasto, monto: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-3 text-white outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
              </label>
              <label className="text-sm font-medium text-slate-300">Fecha
                <input required type="date" value={nuevoGasto.fecha} onChange={(e) => setNuevoGasto({ ...nuevoGasto, fecha: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-3 text-white outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
              </label>
              <label className="text-sm font-medium text-slate-300">Categoría
                <FinanceSelect value={nuevoGasto.categoria} onChange={(e) => setNuevoGasto({ ...nuevoGasto, categoria: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-3 text-white outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20">
                  {categorias.map((category) => <option key={category} value={category}>{category}</option>)}
                </FinanceSelect>
              </label>
              <label className="text-sm font-medium text-slate-300">¿De qué cuenta salió el dinero?
                <FinanceSelect required value={nuevoGasto.cuentaId} onChange={(e) => setNuevoGasto({ ...nuevoGasto, cuentaId: e.target.value })} disabled={cuentasLoading || (!editingGastoId && !cuentasUsuario.some((account) => account.isActive !== false)) || (Boolean(editingGastoId) && cuentasUsuario.length === 0)} className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-3 text-white outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-60">
                  <option value="">{cuentasLoading ? 'Cargando cuentas…' : cuentasUsuario.length ? 'Selecciona una cuenta' : 'No hay cuentas disponibles'}</option>
                  {cuentasUsuario.filter((account) => account.isActive !== false || account.id === nuevoGasto.cuentaId).map((account) => <option key={account.id} value={account.id} disabled={account.isActive === false}>{account.name}{account.isActive === false ? ' · Desactivada' : ''} · {account.currencyCode || 'EUR'}</option>)}
                </FinanceSelect>
                <span className="mt-1 block text-xs font-normal text-slate-500">El importe se descontará del saldo de esta cuenta.</span>
                {cuentasError && (
                  <span role="alert" className="mt-2 flex flex-wrap items-center gap-2 text-xs font-normal text-rose-300">
                    {cuentasError}
                    <button type="button" onClick={() => void cargarCuentasUsuario()} className="rounded-lg border border-rose-700/60 px-2 py-1 font-semibold text-rose-200 hover:bg-rose-950/40">Volver a cargar</button>
                  </span>
                )}
              </label>
              <label className="text-sm font-medium text-slate-300">Método de pago
                <FinanceSelect value={nuevoGasto.metodo} onChange={(e) => setNuevoGasto({ ...nuevoGasto, metodo: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-3 text-white outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"><option>Tarjeta</option><option>Transferencia</option><option>Bizum</option><option>Efectivo</option></FinanceSelect>
              </label>
            </div>
            {formError && <p role="alert" className="mt-4 rounded-xl border border-rose-800/50 bg-rose-950/30 px-3 py-2.5 text-sm text-rose-200">{formError}</p>}
            <div className="mt-6 flex flex-col-reverse gap-2 border-t border-slate-800 pt-4 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => { setFormOpen(false); setEditingGastoId(null); setFormError('') }} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-slate-800">Cancelar</button>
              <button type="submit" disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"><Save className="h-4 w-4" />{saving ? 'Guardando…' : editingGastoId ? 'Guardar cambios' : 'Registrar gasto'}</button>
            </div>
          </form>
        </div>
      )}

      {/* LAYOUT DE DOS COLUMNAS */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)] xl:gap-6">
        {/* COLUMNA IZQUIERDA - FILTROS Y RESUMEN */}
        <div className="space-y-5">
          {/* PANEL DE FILTROS */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg shadow-black/10">
            <div className="flex items-center gap-2 mb-4">
              <Filter className="h-5 w-5 text-red-400" />
              <h2 className="text-lg font-semibold text-white">Filtros</h2>
            </div>
            
            <div className="space-y-4">
              {/* FILTRO MES */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-1.5">
                  <Calendar className="h-4 w-4 text-red-400" />
                  Mes
                </label>
                <div className="relative">
                  <FinanceSelect 
                    value={filtroMes}
                    onChange={(e) => setFiltroMes(e.target.value)}
                    className="w-full px-4 py-2.5 pl-10 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500 transition"
                  >
                    <option value="">Todos los meses</option>
                    {obtenerMesesDisponibles.map((mes) => (
                      <option key={mes} value={mes}>
                        {formatearMesTexto(mes)}
                      </option>
                    ))}
                  </FinanceSelect>
                  <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-500" />
                </div>
              </div>

              {/* FILTRO MÉTODO */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-1.5">
                  <CreditCard className="h-4 w-4 text-purple-400" />
                  Método de pago
                </label>
                <div className="relative">
                  <FinanceSelect 
                    value={filtroMetodo}
                    onChange={(e) => setFiltroMetodo(e.target.value)}
                    className="w-full px-4 py-2.5 pl-10 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500 transition"
                  >
                    <option value="">Todos los métodos</option>
                    <option value="Tarjeta">Tarjeta</option>
                    <option value="Transferencia">Transferencia</option>
                    <option value="Bizum">Bizum</option>
                    <option value="App">App</option>
                    <option value="Efectivo">Efectivo</option>
                  </FinanceSelect>
                  <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-500" />
                </div>
              </div>

              {/* FILTRO CATEGORÍA */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-1.5">
                  <Tag className="h-4 w-4 text-yellow-400" />
                  Categoría
                </label>
                <div className="relative">
                  <FinanceSelect 
                    value={filtroCategoria}
                    onChange={(e) => setFiltroCategoria(e.target.value)}
                    className="w-full px-4 py-2.5 pl-10 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500 transition"
                  >
                    <option value="">Todas las categorías</option>
                    {categorias.map((category) => <option key={category} value={category}>{category}</option>)}
                  </FinanceSelect>
                  <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-500" />
                </div>
              </div>
            </div>

            {/* RESUMEN */}
            <div className="mt-6 pt-5 border-t border-slate-800">
              <div className="flex justify-between items-center p-3 bg-slate-800/30 rounded-lg mb-4">
                <div>
                  <div className="text-sm text-slate-400">Total filtrado</div>
                  <div className="text-xl font-bold text-red-400">€{total.toFixed(2)}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-slate-400">Transacciones</div>
                  <div className="text-lg font-semibold text-slate-300">{gastosFiltrados.length}</div>
                </div>
              </div>

              <button 
                onClick={() => {
                  setFiltroMes('');
                  setFiltroMetodo('');
                  setFiltroCategoria('');
                }}
                className="w-full px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium transition"
              >
                Limpiar filtros
              </button>
            </div>
          </div>
        </div>

        {/* COLUMNA DERECHA - TABLA DETALLADA */}
        <div className="min-w-0">
          <div className="bg-slate-900/80 rounded-xl border border-slate-800 overflow-hidden">
            {/* HEADER DE TABLA */}
            <div className="px-6 py-4 border-b border-slate-800">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    {filtroMes ? `Gastos de ${formatearMesTexto(filtroMes)}` : 'Todos los gastos históricos'}
                  </h2>
                  <p className="text-sm text-slate-400 mt-1">
                    Mostrando {gastosFiltrados.length} transacciones efectuadas
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3 p-3 md:hidden">
              {gastosFiltrados.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-700 px-5 py-10 text-center text-sm text-slate-400">No hay gastos para este periodo. Prueba a cambiar los filtros.</div>
              ) : gastosFiltrados.map((gasto) => {
                const cuentaNombre = String(gasto.cuenta || '').trim();
                const focused = focusedExpense && String(gasto.concepto || '').trim().toLocaleLowerCase('es') === focusedExpense.merchant && Math.round(Number(gasto.monto || 0) * 100) === focusedExpense.amountCents;
                return <article key={gasto.id} data-finanzas-expense-focus={focused ? 'true' : undefined} className={`rounded-2xl border p-4 transition ${focused ? 'border-emerald-400/60 bg-emerald-500/10' : 'border-slate-800 bg-slate-950/60'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-white">{gasto.concepto}</p>
                      <p className="mt-1 text-xs text-slate-500">{gasto.fecha} · {gasto.metodo || 'Sin método'}</p>
                    </div>
                    <p className="shrink-0 text-lg font-bold text-rose-300">−€{gasto.monto?.toFixed(2) || '0.00'}</p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-lg bg-blue-500/10 px-2.5 py-1.5 text-blue-200">{gasto.categoria}</span>
                    <span className="rounded-lg bg-slate-800 px-2.5 py-1.5 text-slate-300">{cuentaNombre || 'Sin cuenta'}</span>
                  </div>
                  <div className="mt-3 flex justify-end gap-2 border-t border-slate-800 pt-3">
                    <button type="button" disabled={saving} onClick={() => editarGasto(gasto)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-sky-300 disabled:opacity-50"><Pencil className="h-3.5 w-3.5"/>Editar</button>
                    <button type="button" disabled={saving} onClick={() => eliminarGasto(gasto)} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-900/50 bg-rose-950/20 px-3 py-2 text-xs font-medium text-rose-300 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5"/>Anular</button>
                  </div>
                </article>
              })}
            </div>
            {/* TABLA DETALLADA */}
            <div className="flex items-center justify-end px-4 py-2 text-xs text-slate-500 sm:hidden">
              <span>Desliza horizontalmente para consultar todas las columnas</span>
            </div>
            <div
              role="region"
              aria-label="Historial de gastos, desplazamiento horizontal"
              tabIndex={0}
              className="hidden overflow-x-auto overscroll-x-contain md:block"
            >
              <table className="w-full min-w-[1040px]">
                <thead className="bg-slate-900">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Fecha
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Concepto
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Método
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Categoría
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Cuenta de salida
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Origen
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Monto
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-400">Acciones</th>
                  </tr>
                </thead>
                
                <tbody className="divide-y divide-slate-800">
                  {gastosFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-8 text-center">
                        <div className="text-slate-500">
                          <Receipt className="h-12 w-12 mx-auto mb-3 opacity-50" />
                          <p>No hay gastos para mostrar</p>
                          <p className="text-sm text-slate-600 mt-1">
                            Cambia los filtros o selecciona otro mes
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    gastosFiltrados.map((gasto) => {
                      const cuentaNombre = String(gasto.cuenta || '').trim();
                      let origenColor, origenBg, origenIcon, origenTooltip = '';
                      
                      switch (gasto.origen) {
                        case 'pago_fijo':
                          origenColor = 'text-amber-400';
                          origenBg = 'bg-amber-900/30';
                          origenIcon = <Repeat className="h-3 w-3" />;
                          origenTooltip = 'Pago recurrente mensual';
                          break;
                        case 'cuota':
                          origenColor = 'text-purple-400';
                          origenBg = 'bg-purple-900/30';
                          origenIcon = <Calculator className="h-3 w-3" />;
                          origenTooltip = gasto.infoProgreso || `Cuota ${gasto.cuotaNumero} de ${gasto.totalCuotas}`;
                          break;
                        default:
                          origenColor = 'text-slate-400';
                          origenBg = 'bg-slate-800';
                          origenIcon = <Receipt className="h-3 w-3" />;
                          origenTooltip = 'Gasto normal';
                      }
                      
                      return (
                        <tr
                          key={gasto.id}
                          data-finanzas-expense-focus={focusedExpense && String(gasto.concepto || '').trim().toLocaleLowerCase('es') === focusedExpense.merchant && Math.round(Number(gasto.monto || 0) * 100) === focusedExpense.amountCents ? 'true' : undefined}
                          className={focusedExpense && String(gasto.concepto || '').trim().toLocaleLowerCase('es') === focusedExpense.merchant && Math.round(Number(gasto.monto || 0) * 100) === focusedExpense.amountCents ? 'bg-emerald-500/10 ring-1 ring-inset ring-emerald-400/50' : 'hover:bg-slate-800/50 transition-colors'}
                        >
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                            {gasto.fecha}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-white">{gasto.concepto}</div>
                            {gasto.origen === 'cuota' && gasto.infoCuota && (
                              <div className="text-xs text-purple-500">
                                {gasto.infoCuota} • {gasto.infoProgreso}
                              </div>
                            )}
                            {gasto.origen === 'pago_fijo' && gasto.frecuencia && (
                              <div className="text-xs text-amber-500">
                                Pago fijo • {gasto.frecuencia}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-slate-800 text-slate-300">
                              {gasto.metodo}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-blue-900/30 text-blue-300">
                              {gasto.categoria}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <Database className="h-4 w-4 shrink-0 text-emerald-400" />
                              <span
                                className={`inline-flex max-w-[220px] items-center truncate rounded-lg border px-2.5 py-1 text-xs font-medium ${cuentaNombre ? 'border-emerald-700/30 bg-emerald-900/20 text-emerald-300' : 'border-amber-700/30 bg-amber-900/20 text-amber-300'}`}
                                title={cuentaNombre ? `Sale de ${cuentaNombre}` : 'Este movimiento no tiene una cuenta asociada'}
                              >
                                {cuentaNombre || 'Sin cuenta registrada'}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span 
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium ${origenBg} ${origenColor}`}
                              title={origenTooltip}
                            >
                              {origenIcon}
                              {gasto.origen === 'pago_fijo' ? 'Pago Fijo' : 
                               gasto.origen === 'cuota' ? 'Cuota' : 'Normal'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <span className="text-sm font-semibold text-rose-300">€{gasto.monto?.toFixed(2) || '0.00'}</span>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-right">
                            <div className="inline-flex items-center gap-1">
                              <button type="button" disabled={saving} onClick={() => editarGasto(gasto)} className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-sky-300 transition hover:bg-slate-800 disabled:opacity-50" title="Editar gasto" aria-label="Editar gasto"><Pencil className="h-4 w-4" /></button>
                              <button type="button" disabled={saving} onClick={() => eliminarGasto(gasto)} className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-rose-300 transition hover:bg-rose-950/50 disabled:opacity-50" title="Anular gasto" aria-label="Anular gasto"><Trash2 className="h-4 w-4" /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            
            {/* FOOTER CON INFORMACIÓN DETALLADA */}
            <div className="px-6 py-3 border-t border-slate-800 bg-slate-900/50">
              <div className="text-xs text-slate-400">
                Este historial solo incluye cargos contabilizados en el libro de cuentas. Los vencimientos y cuotas previstas no se consideran gastos reales.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}