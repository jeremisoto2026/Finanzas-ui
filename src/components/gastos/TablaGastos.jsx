import { Capacitor } from '@capacitor/core'
import { useState, useMemo, useEffect } from 'react';
import { monthKeyFromDate, sumMoney } from '@/lib/finance-core';
import { uniqueCategoryNames } from '@/lib/category-utils';
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
  const isAndroidApp = Capacitor.getPlatform() === 'android'
  // Movimientos de gasto contabilizados procedentes del libro mayor.
  const [gastosMensuales, setGastosMensuales] = useState([]);
  const [categoriasDisponibles, setCategoriasDisponibles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingGastoId, setEditingGastoId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [nuevoGasto, setNuevoGasto] = useState({
    concepto: '',
    monto: '',
    fecha: new Date().toISOString().slice(0, 10),
    categoria: 'Otros',
    cuenta: 'Revolut',
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
        if (!cancelled) setGastosMensuales(data)
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

  const abrirNuevoGasto = () => {
    setEditingGastoId(null)
    setNuevoGasto({
      concepto: '',
      monto: '',
      fecha: new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' }),
      categoria: categoriasDisponibles.find((category) => category.toLowerCase() === 'alimentación') || categoriasDisponibles[0] || 'Otros',
      cuenta: 'Revolut',
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

  const editarGasto = (gasto) => {
    setEditingGastoId(gasto.id)
    setNuevoGasto({
      concepto: gasto.concepto || '',
      monto: String(gasto.monto ?? ''),
      fecha: String(gasto.fecha || '').slice(0, 10),
      categoria: gasto.categoria || 'Otros',
      cuenta: gasto.cuenta || 'Revolut',
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

  const eliminarGasto = (gasto) => {
    setDeleteTarget(gasto)
    setFormError('')
  }

  const confirmarEliminarGasto = async () => {
    if (!deleteTarget) return
    try {
      setSaving(true)
      setFormError('')
      const response = await fetch('/api/gastos', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deleteTarget.id }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo anular el gasto.')
      setGastosMensuales((current) => current.filter((item) => item.id !== deleteTarget.id))
      setDeleteTarget(null)
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
    <div className="mx-auto w-full max-w-7xl space-y-6 pb-8">
      {/* HEADER */}
      <div className="mb-8">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">Gastos registrados</h1>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-3xl font-bold text-red-400">€{total.toFixed(2)}</span>
              <div className="h-2 w-2 rounded-full bg-slate-600"></div>
              <span className="text-slate-400">
                {filtroMes ? formatearMesTexto(filtroMes) : 'Gastos históricos'}
              </span>
              <span className="text-slate-500 text-sm bg-slate-900 px-3 py-1 rounded-full">
                {gastosFiltrados.length} transacciones
              </span>
            </div>
            
            {/* DESGLOSE POR TIPO */}
            <div className="flex flex-wrap gap-3 mt-3">
              {Object.entries(estadisticasPorTipo).map(([tipo, data]) => {
                if (data.count > 0) {
                  return (
                    <div key={tipo} className={`text-xs px-3 py-1 rounded-full ${
                      tipo === 'normal' ? 'bg-slate-900 text-slate-400' :
                      tipo === 'pago_fijo' ? 'bg-amber-900/30 text-amber-400' :
                      'bg-purple-900/30 text-purple-400'
                    }`}>
                      {data.count} {data.label}
                    </div>
                  );
                }
                return null;
              })}
            </div>
            
            {/* NOTA IMPORTANTE */}
            <div className="mt-3 text-sm text-amber-400 bg-amber-900/20 px-3 py-2 rounded-lg">
              Los gastos mostrados son movimientos reales contabilizados. Los pagos fijos y las cuotas pendientes se consultan en Configuración y no se descuentan aquí hasta registrar el cargo en la cuenta.
            </div>
          </div>
          
          {/* BOTÓN DE EXPORTAR */}
          <button 
            onClick={exportarCSV}
            className="flex items-center gap-3 px-5 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition"
          >
            <Download className="h-5 w-5" />
            <FileText className="h-5 w-5" />
            <span>Exportar CSV</span>
          </button>
        </div>
      </div>

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
                <select value={nuevoGasto.categoria} onChange={(e) => setNuevoGasto({ ...nuevoGasto, categoria: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-3 text-white outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20">
                  {categorias.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-300">Cuenta
                <select value={nuevoGasto.cuenta} onChange={(e) => setNuevoGasto({ ...nuevoGasto, cuenta: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-3 text-white outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"><option>Revolut</option><option>BBVA</option><option>Efectivo</option></select>
              </label>
              <label className="text-sm font-medium text-slate-300">Método de pago
                <select value={nuevoGasto.metodo} onChange={(e) => setNuevoGasto({ ...nuevoGasto, metodo: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-3 text-white outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"><option>Tarjeta</option><option>Transferencia</option><option>Bizum</option><option>Efectivo</option></select>
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

      {deleteTarget && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-labelledby="delete-expense-title" className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="rounded-xl bg-rose-500/10 p-2.5 text-rose-300"><Trash2 className="h-5 w-5" /></span>
              <div><h2 id="delete-expense-title" className="font-semibold text-white">Anular este gasto</h2><p className="mt-1 text-sm leading-6 text-slate-400">Se retirará del saldo y de los totales, pero permanecerá en el registro de forma anulada.</p></div>
            </div>
            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
              <p className="truncate text-sm font-medium text-slate-200">{deleteTarget.concepto}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-rose-300">−{new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(deleteTarget.monto)}</p>
            </div>
            {formError && <p role="alert" className="mt-3 rounded-lg border border-rose-800/50 bg-rose-950/30 p-3 text-sm text-rose-200">{formError}</p>}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" disabled={saving} onClick={() => { setDeleteTarget(null); setFormError('') }} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50">Conservar gasto</button>
              <button type="button" disabled={saving} onClick={confirmarEliminarGasto} className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-50">{saving ? 'Anulando…' : 'Sí, anular gasto'}</button>
            </div>
          </section>
        </div>
      )}

      <div className="mb-5 flex justify-end">
        <button onClick={() => { setFormError(''); setFormOpen((open) => !open); }} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-500"><Plus className="h-4 w-4" />Nuevo gasto</button>
      </div>

      {/* LAYOUT DE DOS COLUMNAS */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* COLUMNA IZQUIERDA - FILTROS Y RESUMEN */}
        <div className="lg:w-1/3 xl:w-1/4 space-y-6">
          {/* PANEL DE FILTROS */}
          <div className="bg-slate-900/80 rounded-xl border border-slate-800 p-5">
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
                  <select 
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
                  </select>
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
                  <select 
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
                  </select>
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
                  <select 
                    value={filtroCategoria}
                    onChange={(e) => setFiltroCategoria(e.target.value)}
                    className="w-full px-4 py-2.5 pl-10 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500 transition"
                  >
                    <option value="">Todas las categorías</option>
                    {categorias.map((category) => <option key={category} value={category}>{category}</option>)}
                  </select>
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
        <div className="lg:w-2/3 xl:w-3/4">
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

            {/* TABLA DETALLADA */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px]">
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
                      Origen
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Monto
                    </th>
                    {!isAndroidApp && <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-400">Acciones</th>}
                  </tr>
                </thead>
                
                <tbody className="divide-y divide-slate-800">
                  {gastosFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan={isAndroidApp ? 6 : 7} className="px-6 py-8 text-center">
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
                        <tr key={gasto.id} className="hover:bg-slate-800/50 transition-colors">
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
                          {!isAndroidApp && (
                          <td className="px-4 py-4 whitespace-nowrap text-right">
                                                      <div className="inline-flex items-center gap-1">
                                                        <button type="button" disabled={saving} onClick={() => editarGasto(gasto)} className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-sky-300 transition hover:bg-slate-800 disabled:opacity-50" title="Editar gasto" aria-label="Editar gasto"><Pencil className="h-4 w-4" /></button>
                                                        <button type="button" disabled={saving} onClick={() => eliminarGasto(gasto)} className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-rose-300 transition hover:bg-rose-950/50 disabled:opacity-50" title="Anular gasto" aria-label="Anular gasto"><Trash2 className="h-4 w-4" /></button>
                                                      </div>
                                                    </td>
                          )}
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