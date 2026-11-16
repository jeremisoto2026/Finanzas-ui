import { useState, useEffect } from 'react'
import { addInstallmentDate, distributeInstallmentAmounts, localDateInputValue, sumMoney, sumMonthlyEquivalent } from '@/lib/finance-core'
import { 
  Settings, 
  Plus,
  Trash2,
  CheckCircle,
  X,
  Save,
  Calendar,
  Euro,
  ChevronDown,
  ChevronRight,
  Calculator,
  Bell,
  Receipt,
  AlertCircle,
  CreditCard,
  Wallet,
  TrendingDown,
  TrendingUp,
  Eye,
  EyeOff,
  Download,
  Upload,
  BarChart3,
  Home,
  ShoppingBag,
  Car,
  Gamepad2,
  Heart,
  Wifi,
  Phone,
  Coffee,
  Utensils,
  Gift,
  MoreHorizontal,
  BookOpen,
  Music,
  RefreshCw,
  Clock,
  Check,
  Percent,
  TrendingUp as TrendingUpIcon
} from 'lucide-react'

export default function Configuracion() {
  // Estados de pagos fijos y compras a cuotas
  const [pagosFijos, setPagosFijos] = useState([])
  const [comprasCuotas, setComprasCuotas] = useState([])
  const [presupuestos, setPresupuestos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Estados para acordeones
  const [acordeonesAbiertos, setAcordeonesAbiertos] = useState({
    pagosFijos: true,
    comprasCuotas: true,
    exportacion: false
  })

  // Estados para mostrar formularios
  const [mostrarFormPagoFijo, setMostrarFormPagoFijo] = useState(false)
  const [mostrarFormCuotas, setMostrarFormCuotas] = useState(false)
  
  // Datos para formularios
  const [pagoFijo, setPagoFijo] = useState({
    nombre: '',
    monto: '',
    metodo: 'Tarjeta',
    categoria: 'Servicios',
    frecuencia: 'mensual',
    fechaInicio: localDateInputValue(),
    notificacion: true
  })

  const [compraCuotas, setCompraCuotas] = useState({
    concepto: '',
    montoTotal: '',
    cuotasTotales: '12',
    cuotasPagadas: '0',
    montoPrimeraCuota: '',
    montoUltimaCuota: '',
    fechaInicio: localDateInputValue(),
    metodo: 'Tarjeta',
    categoria: 'Tecnología',
    frecuenciaPago: 'mensual'
  })

  // ========== CARGAR DATOS DESDE SUPABASE ==========
  useEffect(() => {
    const cargarDatos = async () => {
      try {
        setLoading(true)
        
        // Cargar pagos fijos
        const resPagos = await fetch('/api/pagos-fijos')
        if (!resPagos.ok) throw new Error('Error cargando pagos fijos')
        const pagosData = await resPagos.json()
        setPagosFijos(pagosData)

        // Cargar compras a cuotas
        const resCuotas = await fetch('/api/compras-cuotas')
        if (!resCuotas.ok) throw new Error('Error cargando compras a cuotas')
        const cuotasData = await resCuotas.json()
        setComprasCuotas(cuotasData)

        // Cargar presupuestos familiares y variables
        const resPresupuestos = await fetch('/api/presupuestos')
        if (!resPresupuestos.ok) throw new Error('Error cargando presupuestos')
        const presupuestosData = await resPresupuestos.json()
        setPresupuestos(presupuestosData)

      } catch (err) {
        setError(err.message);
        console.error('Error cargando datos:', err);
        setPagosFijos([]);
        setComprasCuotas([]);
      } finally {
        setLoading(false)
      }
    }

    cargarDatos()
  }, [])

  // ========== FUNCIONES PARA PAGOS FIJOS ==========

  const guardarPagoFijo = async () => {
    if (!pagoFijo.nombre || !pagoFijo.monto) {
      alert('Por favor, completa el nombre y monto del pago fijo')
      return
    }
    
    try {
      const res = await fetch('/api/pagos-fijos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pagoFijo)
      })
      
      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Error al guardar pago fijo')
      }
      
      const nuevoPago = await res.json()
      setPagosFijos([...pagosFijos, nuevoPago])
      
      // Resetear formulario
      setPagoFijo({
        nombre: '',
        monto: '',
        metodo: 'Tarjeta',
        categoria: 'Servicios',
        frecuencia: 'mensual',
        fechaInicio: localDateInputValue(),
        notificacion: true
      })
      setMostrarFormPagoFijo(false)
      
      alert('Pago fijo creado exitosamente')
    } catch (err) {
      console.error('Error guardando pago fijo:', err)
      alert(`Error al guardar pago fijo: ${err.message}`)
    }
  }

  const toggleActivoPagoFijo = async (id, activoActual) => {
    try {
      const res = await fetch('/api/pagos-fijos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, activo: !activoActual })
      })
      
      if (res.ok) {
        setPagosFijos(pagosFijos.map(pago => 
          pago.id === id ? { ...pago, activo: !activoActual } : pago
        ))
      }
    } catch (error) {
      console.error('Error actualizando pago fijo:', error)
      alert('Error al actualizar el estado del pago fijo')
    }
  }

  const eliminarPagoFijo = async (id, nombre) => {
    if (!confirm(`¿Eliminar "${nombre}"?`)) return
    
    try {
      const res = await fetch('/api/pagos-fijos', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      })
      
      if (res.ok) {
        setPagosFijos(pagosFijos.filter(p => p.id !== id))
        alert('Pago fijo eliminado exitosamente')
      }
    } catch (error) {
      console.error('Error eliminando pago fijo:', error)
      alert('Error al eliminar el pago fijo')
    }
  }

  // ========== FUNCIONES PARA COMPRAS A CUOTAS ==========

  const guardarCompraCuotas = async () => {
    if (!compraCuotas.concepto.trim() || !String(compraCuotas.montoTotal).trim()) {
      alert('Completa el concepto y el importe total.')
      return
    }

    const cuotasTotales = Number.parseInt(compraCuotas.cuotasTotales, 10)
    const cuotasPagadas = Number.parseInt(compraCuotas.cuotasPagadas || '0', 10)
    const montoTotal = Number(compraCuotas.montoTotal)
    if (!Number.isInteger(cuotasTotales) || cuotasTotales < 1 || !Number.isFinite(montoTotal) || montoTotal <= 0) {
      alert('Indica un importe mayor que cero y un número de cuotas válido.')
      return
    }
    if (!Number.isInteger(cuotasPagadas) || cuotasPagadas < 0 || cuotasPagadas > cuotasTotales) {
      alert('El número de cuotas pagadas debe estar entre cero y el total de cuotas.')
      return
    }
    if (cuotasPagadas > 0) {
      alert('Para no inventar fechas de pago ni descuadrar el saldo, crea el plan con 0 cuotas pagadas. Después registra cada pago con su fecha y revisa el movimiento bancario correspondiente.')
      return
    }

    let importesCuotas
    let historialCuotas
    try {
      importesCuotas = distributeInstallmentAmounts(
        montoTotal,
        cuotasTotales,
        compraCuotas.montoPrimeraCuota || null,
        compraCuotas.montoUltimaCuota || null
      )
      historialCuotas = importesCuotas.map((monto, index) => ({
        numero: index + 1,
        monto,
        pagada: false,
        fecha: addInstallmentDate(compraCuotas.fechaInicio, compraCuotas.frecuenciaPago, index),
      }))
    } catch (err) {
      alert(err.message || 'No se pudo calcular el calendario de cuotas.')
      return
    }

    try {
      const res = await fetch('/api/compras-cuotas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...compraCuotas,
          montoTotal,
          cuotasTotales,
          cuotasPagadas: 0,
          montoPrimeraCuota: compraCuotas.montoPrimeraCuota ? Number(compraCuotas.montoPrimeraCuota) : 0,
          montoUltimaCuota: compraCuotas.montoUltimaCuota ? Number(compraCuotas.montoUltimaCuota) : 0,
          historialCuotas,
        }),
      })
      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Error al guardar la compra a cuotas.')
      }
      const nuevaCompra = await res.json()
      setComprasCuotas((current) => [...current, nuevaCompra])
      setCompraCuotas({
        concepto: '', montoTotal: '', cuotasTotales: '12', cuotasPagadas: '0',
        montoPrimeraCuota: '', montoUltimaCuota: '',
        fechaInicio: localDateInputValue(),
        metodo: 'Tarjeta', categoria: 'Tecnología', frecuenciaPago: 'mensual',
      })
      setMostrarFormCuotas(false)
      alert('Compra a cuotas creada. Los importes de todas las cuotas cuadran exactamente con el total.')
    } catch (err) {
      console.error('Error guardando compra a cuotas:', err)
      alert('Error al guardar la compra a cuotas: ' + (err.message || 'Error desconocido'))
    }
  }

  const marcarCuotaPagada = async (compraId, cuotaNumero) => {
    const confirmar = confirm('Esta acción marca la cuota como pagada en el plan, pero no crea un cargo en tu cuenta. Para cuadrar el saldo, debe existir también un movimiento de gasto. ¿Confirmas que ya se pagó?')
    if (!confirmar) return

    try {
      const compra = comprasCuotas.find(c => c.id === compraId)
      if (!compra) return
      
      const historialActualizado = compra.historialCuotas.map(cuota => {
        if (cuota.numero === cuotaNumero && !cuota.pagada) {
          return { ...cuota, pagada: true, fechaPago: localDateInputValue() }
        }
        return cuota
      })
      
      const nuevasCuotasPagadas = historialActualizado.filter(c => c.pagada).length
      
      const res = await fetch('/api/compras-cuotas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: compraId,
          cuotasPagadas: nuevasCuotasPagadas,
          historialCuotas: historialActualizado
        })
      })
      
      if (res.ok) {
        setComprasCuotas(comprasCuotas.map(compra => {
          if (compra.id === compraId) {
            return {
              ...compra,
              cuotasPagadas: nuevasCuotasPagadas,
              historialCuotas: historialActualizado
            }
          }
          return compra
        }))
        alert('Cuota marcada como pagada')
      }
    } catch (error) {
      console.error('Error marcando cuota como pagada:', error)
      alert('Error al marcar la cuota como pagada')
    }
  }

  const toggleActivoCompraCuotas = async (id, activoActual) => {
    try {
      const res = await fetch('/api/compras-cuotas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, activo: !activoActual })
      })
      
      if (res.ok) {
        setComprasCuotas(comprasCuotas.map(compra => 
          compra.id === id ? { ...compra, activo: !activoActual } : compra
        ))
      }
    } catch (error) {
      console.error('Error actualizando compra a cuotas:', error)
      alert('Error al actualizar el estado de la compra a cuotas')
    }
  }

  const eliminarCompraCuotas = async (id, concepto) => {
    if (!confirm(`¿Eliminar "${concepto}"?`)) return
    
    try {
      const res = await fetch('/api/compras-cuotas', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      })
      
      if (res.ok) {
        setComprasCuotas(comprasCuotas.filter(c => c.id !== id))
        alert('Compra a cuotas eliminada exitosamente')
      }
    } catch (error) {
      console.error('Error eliminando compra a cuotas:', error)
      alert('Error al eliminar la compra a cuotas')
    }
  }

  // ========== CÁLCULOS FINANCIEROS ==========

  const totalPagosMensuales = sumMonthlyEquivalent(
    pagosFijos.filter((pago) => pago.activo),
    (pago) => pago.monto,
    (pago) => pago.frecuencia || 'mensual'
  )

  const totalCuotasActivas = comprasCuotas.filter(c => c.activo).length
  const todasLasCuotas = comprasCuotas.flatMap(compra =>
    (compra.historialCuotas || []).map(cuota => ({
      ...cuota,
      concepto: compra.concepto,
    }))
  )
  const cuotasPendientes = todasLasCuotas.filter(cuota => !cuota.pagada)
  const totalCuotasPendientes = sumMoney(cuotasPendientes, (cuota) => cuota.monto || 0)
  const totalCuotasPagadas = todasLasCuotas.filter(cuota => cuota.pagada).length
  const cuotasPagadasSinMovimiento = todasLasCuotas.filter(cuota => cuota.pagada && !cuota.transactionId).length
  const totalCuotasTotales = todasLasCuotas.length
  const porcentajeCuotasPagadas = totalCuotasTotales > 0 ? (totalCuotasPagadas / totalCuotasTotales) * 100 : 0

  const fechaActual = new Date()
  const fechaProximoMes = new Date(fechaActual.getFullYear(), fechaActual.getMonth() + 1, 1)
  const mesProximo = `${fechaProximoMes.getFullYear()}-${String(fechaProximoMes.getMonth() + 1).padStart(2, '0')}`
  const mesProximoTexto = fechaProximoMes.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
  const totalCuotasProximoMes = sumMoney(
    cuotasPendientes.filter((cuota) => String(cuota.fecha || '').slice(0, 7) === mesProximo),
    (cuota) => cuota.monto || 0
  )

  const mesesPresupuesto = [...new Set(presupuestos.map(item => item.month))].sort((a, b) => b.localeCompare(a))
  const totalPresupuestoMesProximo = sumMoney(
    presupuestos.filter((item) => item.month === mesProximo),
    (item) => item.amount || 0
  )

  const formatearPeriodo = (periodo) => {
    if (!periodo) return 'Periodo sin fecha'
    const [year, month] = periodo.split('-').map(Number)
    return new Date(year, month - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
  }

  const formatearMesCuota = (fecha) => {
    if (!fecha) return 'Fecha pendiente'
    return formatearPeriodo(String(fecha).slice(0, 7))
  }

  // ========== ESTADOS DE CARGA ==========
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-12 w-12 text-blue-400 animate-spin mx-auto mb-4" />
          <p className="text-slate-400 text-lg">Cargando configuración financiera...</p>
          <p className="text-slate-500 text-sm mt-2">Conectando con tu base de datos</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 p-6">
        <div className="max-w-2xl mx-auto mt-20">
          <div className="bg-red-900/20 border border-red-800/30 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="h-8 w-8 text-red-400" />
              <h2 className="text-xl font-bold text-white">Error al cargar configuración</h2>
            </div>
            <p className="text-slate-300 mb-4">{error}</p>
            <p className="text-slate-400 text-sm mb-6">
              No se muestran datos de demostración. Comprueba la conexión y vuelve a intentarlo.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition"
            >
              Reintentar
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ========== RENDER ==========
  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-6">
      {/* HEADER */}
      <div className="mb-8">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-900/30 rounded-lg">
                <Settings className="h-6 w-6 text-blue-400" />
              </div>
              <h1 className="text-2xl font-bold text-white">Gestión Financiera</h1>
            </div>
            <p className="text-slate-400 mt-2">
              Controla tus pagos fijos y compras a cuotas guardados en Supabase
            </p>
          </div>
          
          {/* RESUMEN RÁPIDO */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="text-center p-3 bg-slate-900/50 border border-slate-800 rounded-xl">
              <div className="text-xs text-slate-400">Pagos fijos</div>
              <div className="text-lg font-bold text-amber-400">{pagosFijos.filter(p => p.activo).length}</div>
            </div>
            <div className="text-center p-3 bg-slate-900/50 border border-slate-800 rounded-xl">
              <div className="text-xs text-slate-400">Compromisos / mes</div>
              <div className="text-lg font-bold text-red-400">€{totalPagosMensuales.toFixed(2)}</div>
            </div>
            <div className="text-center p-3 bg-slate-900/50 border border-slate-800 rounded-xl">
              <div className="text-xs text-slate-400">Cuotas pendientes</div>
              <div className="text-lg font-bold text-purple-400">€{totalCuotasPendientes.toFixed(2)}</div>
            </div>
            <div className="text-center p-3 bg-slate-900/50 border border-slate-800 rounded-xl">
              <div className="text-xs text-slate-400">Cuotas de {mesProximoTexto}</div>
              <div className="text-lg font-bold text-rose-400">€{totalCuotasProximoMes.toFixed(2)}</div>
            </div>
            <div className="text-center p-3 bg-slate-900/50 border border-slate-800 rounded-xl">
              <div className="text-xs text-slate-400">Presupuesto variable próximo mes</div>
              <div className="text-lg font-bold text-sky-400">€{totalPresupuestoMesProximo.toFixed(2)}</div>
            </div>
          </div>
        </div>
      </div>

      {cuotasPagadasSinMovimiento > 0 && (
        <div className="mb-5 rounded-xl border border-amber-700/50 bg-amber-950/20 p-4 text-sm text-amber-100">
          <p className="font-semibold">Revisión de cuotas: {cuotasPagadasSinMovimiento} marcadas como pagadas sin movimiento bancario vinculado</p>
          <p className="mt-1 leading-6 text-amber-200/80">
            Estas cuotas no se descuentan del saldo bancario ni se suman al gasto real automáticamente.
            Comprueba si ya registraste cada cargo en Gastos antes de volver a introducirlo, para evitar duplicados.
          </p>
        </div>
      )}

      {/* BOTONES PRINCIPALES */}
      <div className="mb-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          onClick={() => setMostrarFormPagoFijo(true)}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition"
        >
          <Plus className="h-4 w-4" />
          Nuevo pago fijo
        </button>
        
        <button
          onClick={() => setMostrarFormCuotas(true)}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition"
        >
          <Plus className="h-4 w-4" />
          Nueva compra a cuotas
        </button>
      </div>

      {/* FORMULARIO PARA PAGO FIJO (igual, pero ahora usa guardarPagoFijo async) */}
      {mostrarFormPagoFijo && (
        <div className="mb-6 bg-slate-900/80 border border-slate-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white">Nuevo pago fijo</h2>
            <button
              onClick={() => setMostrarFormPagoFijo(false)}
              className="p-2 hover:bg-slate-800 rounded-lg transition"
            >
              <X className="h-5 w-5 text-slate-400" />
            </button>
          </div>
          
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Los inputs siguen igual... */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Nombre *
                </label>
                <input
                  type="text"
                  value={pagoFijo.nombre}
                  onChange={(e) => setPagoFijo({...pagoFijo, nombre: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition"
                  placeholder="Ej: Netflix, Alquiler..."
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
                  <Euro className="h-4 w-4" />
                  Monto *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <span className="text-slate-400">€</span>
                  </div>
                  <input
                    type="number"
                    value={pagoFijo.monto}
                    onChange={(e) => setPagoFijo({...pagoFijo, monto: e.target.value})}
                    step="0.01"
                    className="w-full pl-10 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Categoría
                </label>
                <select
                  value={pagoFijo.categoria}
                  onChange={(e) => setPagoFijo({...pagoFijo, categoria: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition"
                >
                  <option value="Alquiler">Alquiler</option>
                  <option value="Servicios">Servicios</option>
                  <option value="Entretenimiento">Entretenimiento</option>
                  <option value="Salud">Salud</option>
                  <option value="Transporte">Transporte</option>
                  <option value="Alimentación">Alimentación</option>
                  <option value="Telefonía">Telefonía</option>
                  <option value="Tecnología">Tecnología</option>
                  <option value="Educación">Educación</option>
                  <option value="Hogar">Hogar</option>
                  <option value="Otros">Otros</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Método de pago
                </label>
                <select
                  value={pagoFijo.metodo}
                  onChange={(e) => setPagoFijo({...pagoFijo, metodo: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition"
                >
                  <option value="Tarjeta">Tarjeta</option>
                  <option value="Transferencia">Transferencia</option>
                  <option value="Bizum">Bizum</option>
                  <option value="Efectivo">Efectivo</option>
                  <option value="PayPal">PayPal</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Frecuencia
                </label>
                <select
                  value={pagoFijo.frecuencia}
                  onChange={(e) => setPagoFijo({...pagoFijo, frecuencia: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition"
                >
                  <option value="semanal">Semanal</option>
                  <option value="quincenal">Quincenal</option>
                  <option value="mensual">Mensual</option>
                  <option value="trimestral">Trimestral</option>
                  <option value="anual">Anual</option>
                </select>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
                  <Calendar className="h-4 w-4" />
                  Próximo pago
                </label>
                <input
                  type="date"
                  value={pagoFijo.fechaInicio}
                  onChange={(e) => setPagoFijo({...pagoFijo, fechaInicio: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setMostrarFormPagoFijo(false)}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-medium transition"
              >
                Cancelar
              </button>
              <button
                onClick={guardarPagoFijo}
                className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition"
              >
                <Save className="h-4 w-4" />
                Crear pago fijo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FORMULARIO PARA COMPRAS A CUOTAS (igual, pero ahora usa guardarCompraCuotas async) */}
      {mostrarFormCuotas && (
        <div className="mb-6 bg-slate-900/80 border border-slate-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white">Nueva compra a cuotas</h2>
            <button
              onClick={() => setMostrarFormCuotas(false)}
              className="p-2 hover:bg-slate-800 rounded-lg transition"
            >
              <X className="h-5 w-5 text-slate-400" />
            </button>
          </div>
          
          <div className="space-y-4">
            <div className="mb-4 p-3 bg-purple-900/20 border border-purple-800/50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="h-4 w-4 text-purple-400" />
                <span className="text-sm text-purple-300 font-medium">
                  Sistema de cuotas variables
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Puedes definir montos diferentes para cada cuota. Si dejas vacías las cuotas específicas, 
                el sistema distribuirá el monto total equitativamente.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Los inputs siguen igual... */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Concepto *
                </label>
                <input
                  type="text"
                  value={compraCuotas.concepto}
                  onChange={(e) => setCompraCuotas({...compraCuotas, concepto: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition"
                  placeholder="Ej: iPhone, Sofá, Curso online..."
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
                  <Euro className="h-4 w-4" />
                  Monto total *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <span className="text-slate-400">€</span>
                  </div>
                  <input
                    type="number"
                    value={compraCuotas.montoTotal}
                    onChange={(e) => setCompraCuotas({...compraCuotas, montoTotal: e.target.value})}
                    step="0.01"
                    className="w-full pl-10 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
                  <Calculator className="h-4 w-4" />
                  Total de cuotas *
                </label>
                <select
                  value={compraCuotas.cuotasTotales}
                  onChange={(e) => setCompraCuotas({...compraCuotas, cuotasTotales: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition"
                >
                  {[1,2,3,4,5,6,7,8,9,10,11,12,18,24,36].map(num => (
                    <option key={num} value={num}>{num} cuota{num !== 1 ? 's' : ''}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Cuotas ya pagadas (deja 0 al crear)
                </label>
                <input
                  type="number"
                  value={compraCuotas.cuotasPagadas}
                  onChange={(e) => setCompraCuotas({...compraCuotas, cuotasPagadas: e.target.value})}
                  min="0"
                  max={compraCuotas.cuotasTotales}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition"
                  placeholder="0"
                />
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  Al crear un plan, las cuotas empiezan pendientes. Para marcar una como pagada se necesita registrar su fecha real y comprobar el movimiento de cuenta.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Monto primera cuota (opcional)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <span className="text-slate-400">€</span>
                  </div>
                  <input
                    type="number"
                    value={compraCuotas.montoPrimeraCuota}
                    onChange={(e) => setCompraCuotas({...compraCuotas, montoPrimeraCuota: e.target.value})}
                    step="0.01"
                    className="w-full pl-10 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition"
                    placeholder="Dejar vacío para distribución equitativa"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Monto última cuota (opcional)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <span className="text-slate-400">€</span>
                  </div>
                  <input
                    type="number"
                    value={compraCuotas.montoUltimaCuota}
                    onChange={(e) => setCompraCuotas({...compraCuotas, montoUltimaCuota: e.target.value})}
                    step="0.01"
                    className="w-full pl-10 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition"
                    placeholder="Dejar vacío para distribución equitativa"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Categoría
                </label>
                <select
                  value={compraCuotas.categoria}
                  onChange={(e) => setCompraCuotas({...compraCuotas, categoria: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition"
                >
                  <option value="Tecnología">Tecnología</option>
                  <option value="Hogar">Hogar</option>
                  <option value="Transporte">Transporte</option>
                  <option value="Educación">Educación</option>
                  <option value="Salud">Salud</option>
                  <option value="Entretenimiento">Entretenimiento</option>
                  <option value="Otros">Otros</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Método de pago
                </label>
                <select
                  value={compraCuotas.metodo}
                  onChange={(e) => setCompraCuotas({...compraCuotas, metodo: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition"
                >
                  <option value="Tarjeta">Tarjeta</option>
                  <option value="Transferencia">Transferencia</option>
                  <option value="Bizum">Bizum</option>
                  <option value="Efectivo">Efectivo</option>
                  <option value="PayPal">PayPal</option>
                </select>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
                  <Calendar className="h-4 w-4" />
                  Fecha primera cuota
                </label>
                <input
                  type="date"
                  value={compraCuotas.fechaInicio}
                  onChange={(e) => setCompraCuotas({...compraCuotas, fechaInicio: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Frecuencia de pago
                </label>
                <select
                  value={compraCuotas.frecuenciaPago}
                  onChange={(e) => setCompraCuotas({...compraCuotas, frecuenciaPago: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition"
                >
                  <option value="mensual">Mensual</option>
                  <option value="quincenal">Quincenal</option>
                  <option value="semanal">Semanal</option>
                  <option value="trimestral">Trimestral</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setMostrarFormCuotas(false)}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-medium transition"
              >
                Cancelar
              </button>
              <button
                onClick={guardarCompraCuotas}
                className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition"
              >
                <Save className="h-4 w-4" />
                Crear compra a cuotas
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LISTA DE PAGOS FIJOS EN CONFIGURACIÓN */}
      <div className="mb-8 bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BarChart3 className="h-5 w-5 text-amber-400" />
            <span className="font-semibold text-white">Pagos Fijos Configurados</span>
            <span className="text-xs text-slate-500 bg-slate-900 px-2 py-1 rounded">
              {pagosFijos.length} en total • {pagosFijos.filter(p => p.activo).length} activos
            </span>
          </div>
          <button
            onClick={() => setAcordeonesAbiertos({
              ...acordeonesAbiertos,
              pagosFijos: !acordeonesAbiertos.pagosFijos
            })}
            className="p-2 hover:bg-slate-800 rounded-lg transition"
          >
            {acordeonesAbiertos.pagosFijos ? 
              <ChevronDown className="h-5 w-5 text-slate-400" /> : 
              <ChevronRight className="h-5 w-5 text-slate-400" />
            }
          </button>
        </div>

        {acordeonesAbiertos.pagosFijos && (
          <div className="px-6 py-4 border-t border-slate-800">
            {pagosFijos.length === 0 ? (
              <div className="text-center py-8">
                <ShoppingBag className="h-12 w-12 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400 text-sm">No hay pagos fijos configurados</p>
                <p className="text-slate-500 text-xs mt-1">Usa el botón "Nuevo pago fijo" para agregar uno</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-full">
                  <thead className="bg-slate-800/50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                        Nombre
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                        Monto
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                        Categoría
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                        Estado
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {pagosFijos.map((pago) => (
                      <tr key={pago.id} className="hover:bg-slate-800/30">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-sm font-medium text-white">{pago.nombre}</div>
                          {pago.notas && <p className="mt-1 max-w-md whitespace-normal text-xs text-slate-500">{pago.notas}</p>}
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span className="capitalize">{pago.frecuencia}</span>
                            <span>•</span>
                            <span>{pago.metodo}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-sm font-bold text-red-400">€{pago.monto.toFixed(2)}</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-300">
                            {pago.categoria}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            pago.activo
                              ? 'bg-emerald-900/30 text-emerald-400'
                              : 'bg-slate-800 text-slate-400'
                          }`}>
                            {pago.activo ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => toggleActivoPagoFijo(pago.id, pago.activo)}
                              className={`p-1.5 rounded-lg transition ${
                                pago.activo
                                  ? 'bg-emerald-900/30 text-emerald-400 hover:bg-emerald-900/50'
                                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                              }`}
                              title={pago.activo ? 'Desactivar' : 'Activar'}
                            >
                              {pago.activo ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                            </button>
                            
                            <button
                              onClick={() => eliminarPagoFijo(pago.id, pago.nombre)}
                              className="p-1.5 rounded-lg bg-red-900/30 text-red-400 hover:bg-red-900/50 transition"
                              title="Eliminar"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* PRESUPUESTOS VARIABLES: SON PLANIFICACIÓN, NO PAGOS CONFIRMADOS */}
      <div className="mb-8 overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50">
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div>
            <div className="flex items-center gap-3">
              <Wallet className="h-5 w-5 text-sky-400" />
              <span className="font-semibold text-white">Presupuestos familiares</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">Mercado y ocio son límites de planificación; no se contabilizan como gastos pagados hasta registrar el movimiento real.</p>
          </div>
          <span className="text-sm font-semibold text-sky-300">€{totalPresupuestoMesProximo.toFixed(2)} · {mesProximoTexto}</span>
        </div>
        {presupuestos.length === 0 ? (
          <p className="px-6 py-6 text-sm text-slate-500">No hay presupuestos registrados.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
            {mesesPresupuesto.map((mes) => (
              <div key={mes} className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
                <h3 className="mb-3 font-medium capitalize text-white">{formatearPeriodo(mes)}</h3>
                <div className="space-y-3">
                  {presupuestos.filter(item => item.month === mes).map((item) => (
                    <div key={item.id} className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm text-slate-200">{item.category}</p>
                        {item.notes && <p className="mt-1 text-xs text-slate-500">{item.notes}</p>}
                      </div>
                      <span className="whitespace-nowrap text-sm font-semibold text-sky-300">€{item.amount.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 border-t border-slate-800 pt-3 text-right text-sm font-semibold text-white">
                  Total planificado: €{sumMoney(presupuestos.filter((item) => item.month === mes), (item) => item.amount || 0).toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* LISTA DE COMPRAS A CUOTAS */}
      <div className="mb-8 bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Calculator className="h-5 w-5 text-purple-400" />
            <span className="font-semibold text-white">Compras a Cuotas</span>
            <span className="text-xs text-slate-500 bg-slate-900 px-2 py-1 rounded">
              {comprasCuotas.length} en total • {comprasCuotas.filter(c => c.activo).length} activas
            </span>
          </div>
          <button
            onClick={() => setAcordeonesAbiertos({
              ...acordeonesAbiertos,
              comprasCuotas: !acordeonesAbiertos.comprasCuotas
            })}
            className="p-2 hover:bg-slate-800 rounded-lg transition"
          >
            {acordeonesAbiertos.comprasCuotas ? 
              <ChevronDown className="h-5 w-5 text-slate-400" /> : 
              <ChevronRight className="h-5 w-5 text-slate-400" />
            }
          </button>
        </div>

        {acordeonesAbiertos.comprasCuotas && (
          <div className="px-6 py-4 border-t border-slate-800">
            {/* ESTADÍSTICAS DE CUOTAS */}
            <div className="mb-6 p-4 bg-slate-800/30 rounded-lg">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-xs text-slate-400 mb-1">Planes registrados</div>
                  <div className="text-xl font-bold text-purple-400">{comprasCuotas.length}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-slate-400 mb-1">Cuotas pagadas</div>
                  <div className="text-xl font-bold text-emerald-400">{totalCuotasPagadas} / {totalCuotasTotales}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-slate-400 mb-1">Pendiente total</div>
                  <div className="text-xl font-bold text-rose-400">€{totalCuotasPendientes.toFixed(2)}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-slate-400 mb-1">Pendiente en {mesProximoTexto}</div>
                  <div className="text-xl font-bold text-amber-400">€{totalCuotasProximoMes.toFixed(2)}</div>
                </div>
              </div>
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-slate-400">Progreso general</span>
                  <span className="text-slate-300 font-medium">{porcentajeCuotasPagadas.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-2">
                  <div 
                    className="h-2 rounded-full bg-gradient-to-r from-purple-500 to-pink-500"
                    style={{ width: `${porcentajeCuotasPagadas}%` }}
                  ></div>
                </div>
              </div>
            </div>

            {comprasCuotas.length === 0 ? (
              <div className="text-center py-8">
                <Receipt className="h-12 w-12 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400 text-sm">No hay compras a cuotas configuradas</p>
                <p className="text-slate-500 text-xs mt-1">Usa el botón "Nueva compra a cuotas" para agregar una</p>
              </div>
            ) : (
              <div className="space-y-4">
                {comprasCuotas.map((compra) => {
                  const porcentaje = compra.cuotasTotales > 0 ? (compra.cuotasPagadas / compra.cuotasTotales) * 100 : 0
                  const cuotasRestantes = compra.cuotasTotales - compra.cuotasPagadas
                  const proximaCuota = compra.historialCuotas?.find(cuota => !cuota.pagada)
                  
                  return (
                    <div key={compra.id} className="p-4 bg-slate-800/30 rounded-lg border border-slate-700">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 bg-purple-900/30 rounded-lg">
                              <Receipt className="h-4 w-4 text-purple-400" />
                            </div>
                            <div>
                              <h4 className="font-medium text-white">{compra.concepto}</h4>
                              {compra.notas && <p className="mt-1 max-w-2xl text-xs text-amber-200/70">{compra.notas}</p>}
                              <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                                <span>{compra.categoria}</span>
                                <span>•</span>
                                <span>{compra.metodo}</span>
                                <span>•</span>
                                <span>{compra.frecuenciaPago || 'mensual'}</span>
                              </div>
                            </div>
                          </div>

                          <div className="mt-3">
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="text-slate-400">
                                {compra.cuotasPagadas} de {compra.cuotasTotales} cuotas pagadas
                              </span>
                              {proximaCuota && (
                                <span className="text-slate-300 font-medium">
                                  Próxima: €{proximaCuota.monto.toFixed(2)}
                                </span>
                              )}
                            </div>
                            <div className="w-full bg-slate-700 rounded-full h-1.5">
                              <div 
                                className="h-1.5 rounded-full bg-gradient-to-r from-purple-500 to-pink-500"
                                style={{ width: `${porcentaje}%` }}
                              ></div>
                            </div>
                            <div className="flex items-center justify-between text-xs mt-1">
                              <span className="text-slate-500">
                                Total: €{compra.montoTotal.toFixed(2)}
                              </span>
                              <span className="text-slate-500">
                                Restan: {cuotasRestantes} cuotas · €{sumMoney((compra.historialCuotas || []).filter((cuota) => !cuota.pagada), (cuota) => cuota.monto || 0).toFixed(2)}
                              </span>
                            </div>
                            <div className="mt-4 rounded-lg border border-slate-700/70 bg-slate-950/40 p-3">
                              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Historial completo de cuotas</div>
                              <div className="space-y-2">
                                {(compra.historialCuotas || []).map((cuota) => (
                                  <div key={cuota.numero} className="flex items-center justify-between gap-3 text-xs">
                                    <div className="min-w-0">
                                      <span className="text-slate-200">Cuota {cuota.numero} de {compra.cuotasTotales}</span>
                                      <span className="ml-2 capitalize text-slate-500">{formatearMesCuota(cuota.fecha)}</span>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                      <span className={cuota.pagada ? 'text-emerald-300' : 'text-amber-300'}>{cuota.pagada ? 'Pagada' : 'Pendiente'}</span>
                                      <span className="font-semibold text-white">€{Number(cuota.monto || 0).toFixed(2)}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => proximaCuota && marcarCuotaPagada(compra.id, proximaCuota.numero)}
                            disabled={!proximaCuota}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                              !proximaCuota
                                ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                                : 'bg-emerald-900/30 text-emerald-400 hover:bg-emerald-900/50'
                            }`}
                          >
                            <Check className="h-3 w-3 inline mr-1" />
                            Marcar pagada
                          </button>

                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => toggleActivoCompraCuotas(compra.id, compra.activo)}
                              className={`p-1.5 rounded-lg transition ${
                                compra.activo
                                  ? 'bg-emerald-900/30 text-emerald-400 hover:bg-emerald-900/50'
                                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                              }`}
                              title={compra.activo ? 'Desactivar' : 'Activar'}
                            >
                              {compra.activo ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                            </button>
                            
                            <button
                              onClick={() => eliminarCompraCuotas(compra.id, compra.concepto)}
                              className="p-1.5 rounded-lg bg-red-900/30 text-red-400 hover:bg-red-900/50 transition"
                              title="Eliminar"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* NOTIFICACIONES */}
      <div className="mt-8 bg-slate-900/50 border border-slate-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Bell className="h-4 w-4 text-amber-400" />
          Recordatorios
        </h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg">
            <div>
              <div className="text-sm text-slate-300">Recordatorios de pagos fijos</div>
              <div className="text-xs text-slate-500">Recibir notificación 3 días antes del vencimiento</div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" defaultChecked />
              <div className="w-11 h-6 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
            </label>
          </div>
          <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg">
            <div>
              <div className="text-sm text-slate-300">Recordatorios de cuotas</div>
              <div className="text-xs text-slate-500">Aviso cuando se acerca el pago de una cuota</div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" defaultChecked />
              <div className="w-11 h-6 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
            </label>
          </div>
        </div>
      </div>
    </div>
  )
}