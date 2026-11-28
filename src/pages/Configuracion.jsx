import FinanceSelect from '@/components/ui/FinanceSelect'
import { useState, useEffect, useRef } from 'react'
import { addInstallmentDate, distributeInstallmentAmounts, localDateInputValue, sumMoney, sumMonthlyEquivalent } from '@/lib/finance-core'
import { uniqueCategoryNames } from '@/lib/category-utils'
import { useScrollToForm } from '@/lib/useScrollToForm'
import { useConfirmationDialog } from '@/components/ui/ConfirmationDialog'
import { 
  Settings, 
  Pencil,
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
  const confirm = useConfirmationDialog()
  // Estados de pagos fijos y compras a cuotas
  const [pagosFijos, setPagosFijos] = useState([])
  const [comprasCuotas, setComprasCuotas] = useState([])
  const [presupuestos, setPresupuestos] = useState([])
  const [categoriasDisponibles, setCategoriasDisponibles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [errorCargaConfiguracion, setErrorCargaConfiguracion] = useState(null)
  const [cuentasDisponibles, setCuentasDisponibles] = useState([])
  const [gastosRegistrados, setGastosRegistrados] = useState([])
  const [pagoCuotaDialog, setPagoCuotaDialog] = useState(null)
  const [pagoFijoDialog, setPagoFijoDialog] = useState(null)
  const [guardandoPagoFijo, setGuardandoPagoFijo] = useState(false)
  const guardandoPagoFijoRef = useRef(false)
  const [guardandoPagoCuota, setGuardandoPagoCuota] = useState(false)
  const [guardandoCompraCuotas, setGuardandoCompraCuotas] = useState(false)
  const guardandoCompraCuotasRef = useRef(false)
  const [guardandoPresupuesto, setGuardandoPresupuesto] = useState(false)
  const guardandoPresupuestoRef = useRef(false)
  const [mensajeCuotas, setMensajeCuotas] = useState(null)

  // Estados para acordeones
  const [acordeonesAbiertos, setAcordeonesAbiertos] = useState({
    pagosFijos: true,
    comprasCuotas: true,
    exportacion: false
  })

  // Estados para mostrar formularios
  const [mostrarFormPagoFijo, setMostrarFormPagoFijo] = useState(false)
  const [mostrarFormCuotas, setMostrarFormCuotas] = useState(false)
  const [editingPagoFijoId, setEditingPagoFijoId] = useState(null)
  const [editingCompraCuotasId, setEditingCompraCuotasId] = useState(null)
  const [editingCalendarioId, setEditingCalendarioId] = useState(null)
  const [historialEditable, setHistorialEditable] = useState([])
  const [mostrarFormPresupuesto, setMostrarFormPresupuesto] = useState(false)
  const [editingPresupuestoId, setEditingPresupuestoId] = useState(null)
  const [presupuestoForm, setPresupuestoForm] = useState({ month: localDateInputValue().slice(0, 7), category: 'Alimentación', amount: '', notes: '' })
  
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

  const pagoFijoFormRef = useScrollToForm(mostrarFormPagoFijo, editingPagoFijoId)
  const cuotasFormRef = useScrollToForm(mostrarFormCuotas, editingCompraCuotasId)
  const presupuestoFormRef = useScrollToForm(mostrarFormPresupuesto, editingPresupuestoId)

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
        setErrorCargaConfiguracion(err.message);
        console.error('Error cargando datos:', err);
        setPagosFijos([]);
        setComprasCuotas([]);
      } finally {
        setLoading(false)
      }
    }

    cargarDatos()
  }, [])

  useEffect(() => {
    let activo = true
    fetch('/api/gastos?resource=categories', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error('No se pudieron cargar las categorías.')
        return response.json()
      })
      .then((data) => {
        if (activo && Array.isArray(data)) setCategoriasDisponibles(data)
      })
      .catch((loadError) => console.error('No se pudieron cargar las categorías:', loadError))
    return () => { activo = false }
  }, [])

  useEffect(() => {
    let activo = true
    const cargarCuentasYGastos = async () => {
      try {
        const [cuentasResponse, gastosResponse] = await Promise.all([
          fetch('/api/cuentas', { cache: 'no-store' }),
          fetch('/api/gastos', { cache: 'no-store' }),
        ])
        if (cuentasResponse.ok) {
          const rows = await cuentasResponse.json()
          if (activo) setCuentasDisponibles(Array.isArray(rows) ? rows.filter((row) => row.currencyCode === 'EUR' && row.isActive !== false) : [])
        }
        if (gastosResponse.ok) {
          const rows = await gastosResponse.json()
          if (activo) setGastosRegistrados(Array.isArray(rows) ? rows : [])
        }
      } catch (loadError) {
        console.error('No se pudieron cargar las cuentas y gastos para vincular cuotas:', loadError)
      }
    }
    cargarCuentasYGastos()
    return () => { activo = false }
  }, [])

  // ========== FUNCIONES PARA PAGOS FIJOS ==========

  const abrirNuevoPagoFijo = () => {
    setEditingPagoFijoId(null)
    setPagoFijo({
      nombre: '', monto: '', metodo: 'Tarjeta', categoria: 'Servicios',
      frecuencia: 'mensual', fechaInicio: localDateInputValue(), notificacion: true, notas: '',
    })
    setMostrarFormPagoFijo(true)
  }

  const editarPagoFijo = (pago) => {
    setEditingPagoFijoId(pago.id)
    setPagoFijo({
      nombre: pago.nombre || '',
      monto: String(pago.monto ?? ''),
      metodo: pago.metodo || 'Tarjeta',
      categoria: pago.categoria || 'Servicios',
      frecuencia: pago.frecuencia || 'mensual',
      fechaInicio: pago.fechaInicio || '',
      notificacion: Boolean(pago.notificacion),
      notas: pago.notas || '',
    })
    setMostrarFormPagoFijo(true)
  }

  const guardarPagoFijo = async () => {
    const amount = Number(pagoFijo.monto)
    if (!pagoFijo.nombre.trim() || !Number.isFinite(amount) || amount <= 0) {
      alert('Completa el nombre y un importe válido mayor que cero.')
      return
    }

    try {
      const response = await fetch('/api/pagos-fijos', {
        method: editingPagoFijoId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(editingPagoFijoId ? { id: editingPagoFijoId } : {}),
          ...pagoFijo,
          monto: amount,
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo guardar el pago fijo.')
      setPagosFijos((current) => editingPagoFijoId
        ? current.map((item) => item.id === editingPagoFijoId ? result : item)
        : [...current, result])
      setPagoFijo({
        nombre: '', monto: '', metodo: 'Tarjeta', categoria: 'Servicios',
        frecuencia: 'mensual', fechaInicio: localDateInputValue(), notificacion: true, notas: '',
      })
      setEditingPagoFijoId(null)
      setMostrarFormPagoFijo(false)
    } catch (err) {
      alert(err.message || 'No se pudo guardar el pago fijo.')
    }
  }

  const abrirPagoFijoDialog = (pago) => {
    if (!pago.fechaInicio) { setError('Este pago fijo no tiene una fecha de vencimiento configurada.'); return }
    setPagoFijoDialog({ pago, accountId: cuentasDisponibles[0]?.id || '', paidOn: localDateInputValue() })
  }

  const registrarPagoFijo = async (event) => {
    event.preventDefault()
    if (guardandoPagoFijoRef.current || !pagoFijoDialog) return
    if (!pagoFijoDialog.accountId) { setError('Selecciona la cuenta desde la que pagaste.'); return }
    guardandoPagoFijoRef.current = true
    setGuardandoPagoFijo(true)
    try {
      setError(null)
      const response = await fetch('/api/pagos-fijos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_paid', id: pagoFijoDialog.pago.id,
          accountId: pagoFijoDialog.accountId, paidOn: pagoFijoDialog.paidOn,
          periodKey: pagoFijoDialog.pago.fechaInicio }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo registrar el pago fijo.')
      const refreshed = await fetch('/api/pagos-fijos', { cache: 'no-store' })
      if (refreshed.ok) setPagosFijos(await refreshed.json())
      setPagoFijoDialog(null)
      setMensajeCuotas({ type: 'success', message: result.alreadyRecorded
        ? 'Este periodo ya estaba registrado. No se ha creado otro gasto.'
        : 'Pago fijo registrado: el gasto ya está en el historial y se ha actualizado el saldo.' })
    } catch (err) { setError(err.message || 'No se pudo registrar el pago fijo.') }
    finally { guardandoPagoFijoRef.current = false; setGuardandoPagoFijo(false) }
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
    const approved = await confirm({
      title: '¿Eliminar este pago fijo?',
      description: `Se cancelará "${nombre}" y dejará de aparecer entre tus pagos activos. Los movimientos anteriores no se modificarán.`,
      confirmLabel: 'Eliminar pago fijo',
    })
    if (!approved) return

    try {
      setError(null)
      const res = await fetch('/api/pagos-fijos', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'No se pudo eliminar el pago fijo.')
      setPagosFijos((current) => current.filter((p) => p.id !== id))
    } catch (error) {
      console.error('Error eliminando pago fijo:', error)
      setError(error.message || 'Error al eliminar el pago fijo.')
    }
  }

  const abrirNuevoPresupuesto = () => {
    setEditingPresupuestoId(null)
    setPresupuestoForm({ month: localDateInputValue().slice(0, 7), category: categoriasDisponibles.find((category) => category.toLowerCase() === 'alimentación') || categoriasDisponibles[0] || 'Otros', amount: '', notes: '' })
    setMostrarFormPresupuesto(true)
  }

  const editarPresupuesto = (item) => {
    setEditingPresupuestoId(item.id)
    setPresupuestoForm({ month: item.month, category: item.category, amount: String(item.amount), notes: item.notes || '' })
    setMostrarFormPresupuesto(true)
  }

  const guardarPresupuesto = async (event) => {
    event.preventDefault()

    // Prevent double taps or repeated submit events from creating two POST requests.
    // The ref is set synchronously, before the first await, so a second event is ignored.
    if (guardandoPresupuestoRef.current) return

    const amount = Number(presupuestoForm.amount)
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(presupuestoForm.month) || !presupuestoForm.category.trim() || !Number.isFinite(amount) || amount < 0) {
      setError('Revisa el mes, la categoría y el importe del presupuesto.')
      return
    }

    guardandoPresupuestoRef.current = true
    setGuardandoPresupuesto(true)
    try {
      setError(null)
      const response = await fetch('/api/presupuestos', {
        method: editingPresupuestoId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(editingPresupuestoId ? { id: editingPresupuestoId } : {}), ...presupuestoForm, amount }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo guardar el presupuesto.')
      setPresupuestos((current) => editingPresupuestoId
        ? current.map((item) => item.id === editingPresupuestoId ? result : item)
        : [...current, result])
      setMostrarFormPresupuesto(false)
      setEditingPresupuestoId(null)
      setPresupuestoForm({ month: localDateInputValue().slice(0, 7), category: 'Alimentación', amount: '', notes: '' })
    } catch (err) {
      setError(err.message || 'No se pudo guardar el presupuesto.')
    } finally {
      guardandoPresupuestoRef.current = false
      setGuardandoPresupuesto(false)
    }
  }

  const eliminarPresupuesto = async (item) => {
    const approved = await confirm({
      title: '¿Eliminar este presupuesto?',
      description: `Se eliminará el presupuesto de ${item.category} para ${item.month}. Los gastos e ingresos reales ya registrados se conservarán.`,
      confirmLabel: 'Eliminar presupuesto',
    })
    if (!approved) return
    try {
      const response = await fetch('/api/presupuestos', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo eliminar el presupuesto.')
      setPresupuestos((current) => current.filter((row) => row.id !== item.id))
    } catch (err) {
      setError(err.message || 'No se pudo eliminar el presupuesto.')
    }
  }

  // ========== FUNCIONES PARA COMPRAS A CUOTAS ==========

  const abrirEdicionCompraCuotas = (compra) => {
    setEditingCompraCuotasId(compra.id)
    setCompraCuotas({
      concepto: compra.concepto || '',
      montoTotal: String(compra.montoTotal ?? ''),
      cuotasTotales: String(compra.cuotasTotales ?? ''),
      cuotasPagadas: String(compra.cuotasPagadas ?? 0),
      montoPrimeraCuota: String(compra.montoPrimeraCuota ?? ''),
      montoUltimaCuota: String(compra.montoUltimaCuota ?? ''),
      fechaInicio: compra.fechaInicio || localDateInputValue(),
      metodo: compra.metodo || 'Tarjeta',
      categoria: compra.categoria || 'Tecnología',
      frecuenciaPago: compra.frecuenciaPago || 'mensual',
      notas: compra.notas || '',
    })
    setMostrarFormCuotas(true)
  }



  const guardarCompraCuotas = async () => {
    if (guardandoCompraCuotasRef.current) return
    setMensajeCuotas(null)
    if (!compraCuotas.concepto.trim() || !String(compraCuotas.montoTotal).trim()) {
      setMensajeCuotas({ type: 'error', message: 'Completa el concepto y el importe total.' })
      return
    }

    const cuotasTotales = Number.parseInt(compraCuotas.cuotasTotales, 10)
    const cuotasPagadas = Number.parseInt(compraCuotas.cuotasPagadas || '0', 10)
    const montoTotal = Number(compraCuotas.montoTotal)
    if (!Number.isInteger(cuotasTotales) || cuotasTotales < 1 || !Number.isFinite(montoTotal) || montoTotal <= 0) {
      setMensajeCuotas({ type: 'error', message: 'Indica un importe mayor que cero y un número de cuotas válido.' })
      return
    }
    if (!Number.isInteger(cuotasPagadas) || cuotasPagadas < 0 || cuotasPagadas > cuotasTotales) {
      setMensajeCuotas({ type: 'error', message: 'El número de cuotas pagadas debe estar entre cero y el total de cuotas.' })
      return
    }
    const planActual = editingCompraCuotasId ? comprasCuotas.find((item) => item.id === editingCompraCuotasId) : null
    const tieneCuotasPagadas = Boolean(planActual?.historialCuotas?.some((cuota) => cuota.pagada || cuota.transactionId))
    if (cuotasPagadas > 0 && !editingCompraCuotasId) {
      setMensajeCuotas({ type: 'error', message: 'Crea el plan con cero cuotas pagadas y registra cada cargo desde el calendario para elegir la cuenta y mantener el saldo correcto.' })
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
      historialCuotas = importesCuotas.map((monto, index) => {
        const fecha = addInstallmentDate(compraCuotas.fechaInicio, compraCuotas.frecuenciaPago, index)
        const existing = planActual?.historialCuotas?.find((cuota) => cuota.numero === index + 1)
        if (existing?.transactionId || existing?.pagada) {
          if (Number(existing.monto) !== Number(monto) || existing.fecha !== fecha) {
            throw new Error('No puedes cambiar el importe o la fecha de una cuota ya pagada o vinculada a un movimiento bancario.')
          }
          return existing
        }
        return { numero: index + 1, monto, pagada: false, fecha }
      })
      if (tieneCuotasPagadas && (historialCuotas.length !== planActual.historialCuotas.length ||
          historialCuotas.some((cuota, index) => cuota.numero !== planActual.historialCuotas[index]?.numero))) {
        throw new Error('No puedes cambiar el número de cuotas de un plan que ya tiene pagos registrados.')
      }
    } catch (err) {
      setMensajeCuotas({ type: 'error', message: err.message || 'No se pudo calcular el calendario de cuotas.' })
      return
    }

    guardandoCompraCuotasRef.current = true
    setGuardandoCompraCuotas(true)
    try {
      setMensajeCuotas(null)
      const res = await fetch('/api/compras-cuotas', {
        method: editingCompraCuotasId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...compraCuotas,
          ...(editingCompraCuotasId ? { id: editingCompraCuotasId } : {}),
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
      setComprasCuotas((current) => editingCompraCuotasId
        ? current.map((item) => item.id === editingCompraCuotasId ? nuevaCompra : item)
        : [...current, nuevaCompra])
      setCompraCuotas({
        concepto: '', montoTotal: '', cuotasTotales: '12', cuotasPagadas: '0',
        montoPrimeraCuota: '', montoUltimaCuota: '',
        fechaInicio: localDateInputValue(),
        metodo: 'Tarjeta', categoria: 'Tecnología', frecuenciaPago: 'mensual',
      })
      setMostrarFormCuotas(false)
      setEditingCompraCuotasId(null)
      setMensajeCuotas({ type: 'success', message: editingCompraCuotasId ? 'Compra a cuotas actualizada correctamente.' : 'Compra a cuotas creada correctamente. El calendario coincide con el importe total.' })
    } catch (err) {
      console.error('Error guardando compra a cuotas:', err)
      setMensajeCuotas({ type: 'error', message: err.message || 'No se pudo guardar la compra a cuotas. Revisa los datos e inténtalo de nuevo.' })
    } finally {
      guardandoCompraCuotasRef.current = false
      setGuardandoCompraCuotas(false)
    }
  }

  const abrirDialogoPagoCuota = (compra, cuota) => {
    const cuentaPredeterminada = cuentasDisponibles[0]
    setMensajeCuotas(null)
    setPagoCuotaDialog({
      compra, cuota, modo: 'nuevo',
      accountId: cuentaPredeterminada?.id || '',
      paidOn: cuota.fechaPago || localDateInputValue(),
      existingTransactionId: '',
    })
  }

  const registrarPagoCuota = async (event) => {
    event.preventDefault()
    if (!pagoCuotaDialog) return
    const { compra, cuota, modo, accountId, paidOn, existingTransactionId } = pagoCuotaDialog
    if (modo === 'nuevo' && (!accountId || !paidOn)) {
      setMensajeCuotas({ type: 'error', message: 'Selecciona la cuenta y la fecha real del cargo.' })
      return
    }
    if (modo === 'existente' && !existingTransactionId) {
      setMensajeCuotas({ type: 'error', message: 'Selecciona el gasto que ya registraste.' })
      return
    }
    try {
      setGuardandoPagoCuota(true)
      setMensajeCuotas(null)
      const response = await fetch('/api/compras-cuotas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'pay_installment',
          planId: compra.id,
          installmentId: cuota.installmentId,
          accountId: modo === 'nuevo' ? accountId : null,
          paidOn: modo === 'nuevo' ? paidOn : null,
          existingTransactionId: modo === 'existente' ? existingTransactionId : null,
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo registrar el pago de la cuota.')
      if (!result.plan) throw new Error('El movimiento se registró, pero no se pudo actualizar la vista. Recarga la página para comprobarlo.')
      setComprasCuotas((current) => current.map((item) => item.id === result.plan.id ? result.plan : item))
      setPagoCuotaDialog(null)
      setMensajeCuotas({
        type: 'success',
        message: result.alreadyRecorded
          ? 'Esta cuota ya tenía un movimiento bancario vinculado.'
          : modo === 'existente'
            ? 'El gasto existente quedó vinculado a la cuota. No se creó un cargo duplicado.'
            : 'Pago registrado: se creó el gasto y se actualizó el saldo de la cuenta.',
      })
    } catch (paymentError) {
      console.error('Error registrando el pago de la cuota:', paymentError)
      setMensajeCuotas({ type: 'error', message: paymentError.message || 'No se pudo registrar el pago de la cuota.' })
    } finally {
      setGuardandoPagoCuota(false)
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
    const approved = await confirm({
      title: '¿Eliminar esta compra a cuotas?',
      description: `Se cancelará "${concepto}" y su calendario de cuotas. Los movimientos de cuotas que ya estén registrados se conservarán.`,
      confirmLabel: 'Eliminar compra',
    })
    if (!approved) return

    try {
      const res = await fetch('/api/compras-cuotas', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'No se pudo eliminar la compra a cuotas.')
      setComprasCuotas((current) => current.filter((c) => c.id !== id))
    } catch (error) {
      console.error('Error eliminando compra a cuotas:', error)
      setError(error.message || 'Error al eliminar la compra a cuotas.')
    }
  }

  const abrirEdicionCalendario = (compra) => {
    setEditingCalendarioId(compra.id)
    setHistorialEditable((compra.historialCuotas || []).map((cuota) => ({ ...cuota })))
  }

  const actualizarCuotaEditable = (numero, field, value) => {
    setHistorialEditable((current) => current.map((cuota) => (
      cuota.numero === numero ? { ...cuota, [field]: field === 'monto' ? value : value } : cuota
    )))
  }

  const guardarCalendarioCuotas = async (compra) => {
    const totalCuotas = sumMoney(historialEditable, (cuota) => cuota.monto || 0)
    if (Math.round(totalCuotas * 100) !== Math.round(Number(compra.montoTotal) * 100)) {
      alert(`La suma del calendario es ${totalCuotas.toFixed(2)} €. Debe cuadrar exactamente con el total del plan de ${Number(compra.montoTotal).toFixed(2)} €.`)
      return
    }
    try {
      const response = await fetch('/api/compras-cuotas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: compra.id,
          cuotasTotales: historialEditable.length,
          historialCuotas: historialEditable.map((cuota) => ({
            numero: cuota.numero,
            monto: Number(cuota.monto),
            fecha: cuota.fecha,
            pagada: Boolean(cuota.pagada),
            fechaPago: cuota.fechaPago || null,
            notas: cuota.notas || '',
          })),
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo actualizar el calendario.')
      setComprasCuotas((current) => current.map((item) => item.id === compra.id ? result : item))
      setEditingCalendarioId(null)
      setHistorialEditable([])
    } catch (err) {
      alert(err.message || 'No se pudo actualizar el calendario.')
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

  const categoriasConfiguracion = uniqueCategoryNames([
    ...categoriasDisponibles,
    ...presupuestos.map((item) => item.category),
    ...pagosFijos.map((item) => item.categoria),
    ...comprasCuotas.map((item) => item.categoria),
    presupuestoForm.category,
    pagoFijo.categoria,
    compraCuotas.categoria,
  ])
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

  if (errorCargaConfiguracion) {
    return (
      <div className="min-h-screen bg-slate-950 p-6">
        <div className="max-w-2xl mx-auto mt-20">
          <div className="bg-red-900/20 border border-red-800/30 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="h-8 w-8 text-red-400" />
              <h2 className="text-xl font-bold text-white">Error al cargar configuración</h2>
            </div>
            <p className="text-slate-300 mb-4">{errorCargaConfiguracion}</p>
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
    <div className="mx-auto w-full max-w-7xl space-y-6 pb-8">
      {error && (
        <div role="alert" className="flex items-start justify-between gap-3 rounded-xl border border-rose-700/60 bg-rose-950/30 px-4 py-3 text-sm text-rose-200">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="shrink-0 font-medium text-rose-100 underline underline-offset-2">Cerrar</button>
        </div>
      )}
      {pagoFijoDialog && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/70 p-4" role="presentation">
          <form onSubmit={registrarPagoFijo} className="w-full max-w-lg space-y-4 rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-xs font-semibold uppercase tracking-wider text-amber-400">Registrar gasto real</p>
                <h2 className="mt-1 text-lg font-bold text-white">{pagoFijoDialog.pago.nombre}</h2>
                <p className="mt-1 text-sm text-slate-400">€{Number(pagoFijoDialog.pago.monto).toFixed(2)} · Vencimiento {pagoFijoDialog.pago.fechaInicio}</p></div>
              <button type="button" onClick={() => setPagoFijoDialog(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800" aria-label="Cerrar"><X className="h-5 w-5" /></button>
            </div>
            <label className="block text-sm text-slate-300">Cuenta desde la que pagaste
              <FinanceSelect required value={pagoFijoDialog.accountId} onChange={(event) => setPagoFijoDialog((current) => ({ ...current, accountId: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white">
                <option value="">Seleccionar cuenta</option>{cuentasDisponibles.map((cuenta) => <option key={cuenta.id} value={cuenta.id}>{cuenta.name}</option>)}
              </FinanceSelect>
            </label>
            <label className="block text-sm text-slate-300">Fecha real del pago
              <input required type="date" value={pagoFijoDialog.paidOn} onChange={(event) => setPagoFijoDialog((current) => ({ ...current, paidOn: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" />
            </label>
            <p className="text-xs leading-5 text-slate-500">Se registrará un gasto real por el importe del pago fijo. Puedes pagarlo antes del vencimiento. El mismo periodo no podrá descontarse dos veces.</p>
            <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
              <button type="button" onClick={() => setPagoFijoDialog(null)} className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-slate-300">Cancelar</button>
              <button type="submit" disabled={guardandoPagoFijo || cuentasDisponibles.length === 0} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{guardandoPagoFijo ? 'Registrando…' : 'Marcar como pagado'}</button>
            </div>
          </form>
        </div>
      )}
      {pagoCuotaDialog && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4" role="presentation">
          <form onSubmit={registrarPagoCuota} className="w-full max-w-lg space-y-4 rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Registrar movimiento</p>
                <h2 className="mt-1 text-lg font-bold text-white">{pagoCuotaDialog.compra.concepto}</h2>
                <p className="mt-1 text-sm text-slate-400">Cuota {pagoCuotaDialog.cuota.numero} · €{Number(pagoCuotaDialog.cuota.monto).toFixed(2)}</p>
              </div>
              <button type="button" onClick={() => setPagoCuotaDialog(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Cerrar"><X className="h-5 w-5" /></button>
            </div>
            {pagoCuotaDialog.cuota.pagada && !pagoCuotaDialog.cuota.transactionId && (
              <div className="rounded-lg border border-amber-700/50 bg-amber-950/20 p-3 text-xs leading-5 text-amber-200">
                Esta cuota ya figura como pagada, pero no tiene movimiento asociado. Primero comprueba si ya registraste el gasto para no descontarlo dos veces.
              </div>
            )}
            <label className="block text-sm text-slate-300">Cómo quieres contabilizarla
              <FinanceSelect value={pagoCuotaDialog.modo} onChange={(event) => setPagoCuotaDialog((current) => ({ ...current, modo: event.target.value, existingTransactionId: '' }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white">
                <option value="nuevo">Crear automáticamente un gasto nuevo</option>
                <option value="existente">Vincular un gasto que ya registré</option>
              </FinanceSelect>
            </label>
            {pagoCuotaDialog.modo === 'nuevo' ? (
              <>
                <label className="block text-sm text-slate-300">Cuenta desde la que se pagó
                  <FinanceSelect required value={pagoCuotaDialog.accountId} onChange={(event) => setPagoCuotaDialog((current) => ({ ...current, accountId: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white">
                    <option value="">Seleccionar cuenta</option>
                    {cuentasDisponibles.map((cuenta) => <option key={cuenta.id} value={cuenta.id}>{cuenta.name}</option>)}
                  </FinanceSelect>
                </label>
                <label className="block text-sm text-slate-300">Fecha del cargo
                  <input required type="date" value={pagoCuotaDialog.paidOn} onChange={(event) => setPagoCuotaDialog((current) => ({ ...current, paidOn: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" />
                </label>
                <p className="text-xs leading-5 text-slate-500">Se creará un gasto por el importe exacto de la cuota y quedará vinculado al calendario. Volver a pulsar no creará un segundo cargo.</p>
              </>
            ) : (
              <label className="block text-sm text-slate-300">Gastos existentes por el mismo importe
                <FinanceSelect required value={pagoCuotaDialog.existingTransactionId} onChange={(event) => setPagoCuotaDialog((current) => ({ ...current, existingTransactionId: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white">
                  <option value="">Seleccionar gasto existente</option>
                  {gastosRegistrados
                    .filter((gasto) => Number(gasto.monto) === Number(pagoCuotaDialog.cuota.monto))
                    .filter((gasto) => !comprasCuotas.some((plan) => plan.historialCuotas?.some((cuota) => cuota.transactionId === gasto.id)))
                    .map((gasto) => <option key={gasto.id} value={gasto.id}>{gasto.fecha} · {gasto.concepto} · {gasto.cuenta} · €{Number(gasto.monto).toFixed(2)}</option>)}
                </FinanceSelect>
              </label>
            )}
            <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
              <button type="button" onClick={() => setPagoCuotaDialog(null)} className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-slate-300">Cancelar</button>
              <button type="submit" disabled={guardandoPagoCuota || (pagoCuotaDialog.modo === 'nuevo' && cuentasDisponibles.length === 0)} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50">
                {guardandoPagoCuota ? 'Registrando…' : pagoCuotaDialog.modo === 'existente' ? 'Vincular gasto' : 'Registrar pago'}
              </button>
            </div>
          </form>
        </div>
      )}
      {/* HEADER */}
      <div className="mb-8">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-900/30 rounded-lg">
                <Settings className="h-6 w-6 text-blue-400" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Pagos y presupuestos</h1>
            </div>
            <p className="text-slate-400 mt-2">
              Organiza pagos fijos, compras a cuotas y límites de gasto. El presupuesto sirve para planificar: no aparta dinero ni modifica los saldos de tus cuentas.
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

      {mensajeCuotas && (
        <div role={mensajeCuotas.type === 'error' ? 'alert' : 'status'} className={`mb-5 flex items-start gap-3 rounded-xl border p-4 text-sm ${mensajeCuotas.type === 'error' ? 'border-rose-700/60 bg-rose-950/30 text-rose-200' : 'border-emerald-700/50 bg-emerald-950/20 text-emerald-200'}`}>
          {mensajeCuotas.type === 'error' ? <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /> : <CheckCircle className="mt-0.5 h-5 w-5 shrink-0" />}
          <p>{mensajeCuotas.message}</p>
          <button type="button" onClick={() => setMensajeCuotas(null)} className="ml-auto text-current/70 hover:text-current" aria-label="Cerrar aviso"><X className="h-4 w-4" /></button>
        </div>
      )}

      {cuotasPagadasSinMovimiento > 0 && (
        <div className="mb-5 rounded-xl border border-amber-700/50 bg-amber-950/20 p-4 text-sm text-amber-100">
          <p className="font-semibold">Revisión de cuotas: {cuotasPagadasSinMovimiento} pagadas sin movimiento vinculado</p>
          <p className="mt-1 leading-6 text-amber-200/80">
            No se han cargado automáticamente para evitar duplicados. En cada cuota puedes vincular un gasto que ya exista o registrar uno nuevo seleccionando la cuenta.
          </p>
        </div>
      )}

      {/* BOTONES PRINCIPALES */}
      <div className="mb-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          onClick={abrirNuevoPagoFijo}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition"
        >
          <Plus className="h-4 w-4" />
          Nuevo pago fijo
        </button>
        
        <button
          onClick={() => { setEditingCompraCuotasId(null); setCompraCuotas({ concepto: '', montoTotal: '', cuotasTotales: '12', cuotasPagadas: '0', montoPrimeraCuota: '', montoUltimaCuota: '', fechaInicio: localDateInputValue(), metodo: 'Tarjeta', categoria: 'Tecnología', frecuenciaPago: 'mensual', notas: '' }); setMostrarFormCuotas(true); }}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition"
        >
          <Plus className="h-4 w-4" />
          Nueva compra a cuotas
        </button>
      </div>

      {/* FORMULARIO PARA PAGO FIJO (igual, pero ahora usa guardarPagoFijo async) */}
      {mostrarFormPagoFijo && (
        <div ref={pagoFijoFormRef} className="mb-6 scroll-mt-24 bg-slate-900/80 border border-slate-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white">{editingPagoFijoId ? 'Editar pago fijo' : 'Nuevo pago fijo'}</h2>
            <button
              onClick={() => { setMostrarFormPagoFijo(false); setEditingPagoFijoId(null); }}
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
                <FinanceSelect
                  value={pagoFijo.categoria}
                  onChange={(e) => setPagoFijo({...pagoFijo, categoria: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition"
                >
                  {categoriasConfiguracion.map((category) => <option key={category} value={category}>{category}</option>)}
                </FinanceSelect>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Método de pago
                </label>
                <FinanceSelect
                  value={pagoFijo.metodo}
                  onChange={(e) => setPagoFijo({...pagoFijo, metodo: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition"
                >
                  <option value="Tarjeta">Tarjeta</option>
                  <option value="Transferencia">Transferencia</option>
                  <option value="Bizum">Bizum</option>
                  <option value="Efectivo">Efectivo</option>
                  <option value="PayPal">PayPal</option>
                </FinanceSelect>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Frecuencia
                </label>
                <FinanceSelect
                  value={pagoFijo.frecuencia}
                  onChange={(e) => setPagoFijo({...pagoFijo, frecuencia: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition"
                >
                  <option value="semanal">Semanal</option>
                  <option value="quincenal">Quincenal</option>
                  <option value="mensual">Mensual</option>
                  <option value="trimestral">Trimestral</option>
                  <option value="anual">Anual</option>
                </FinanceSelect>
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

              <div className="md:col-span-2 flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-800/50 p-3">
                <input
                  id="pago-fijo-notificacion"
                  type="checkbox"
                  checked={Boolean(pagoFijo.notificacion)}
                  onChange={(e) => setPagoFijo({ ...pagoFijo, notificacion: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
                />
                <label htmlFor="pago-fijo-notificacion" className="cursor-pointer">
                  <span className="block text-sm font-medium text-slate-200">Recordarme este pago</span>
                  <span className="block text-xs text-slate-400">Aviso automático antes de su próximo vencimiento</span>
                </label>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-300 mb-2">Notas (opcional)</label>
                <textarea rows={2} value={pagoFijo.notas || ''} onChange={(e) => setPagoFijo({ ...pagoFijo, notas: e.target.value })} className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white" />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => { setMostrarFormPagoFijo(false); setEditingPagoFijoId(null); }}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-medium transition"
              >
                Cancelar
              </button>
              <button
                onClick={guardarPagoFijo}
                className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition"
              >
                <Save className="h-4 w-4" />
                {editingPagoFijoId ? 'Guardar cambios' : 'Crear pago fijo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FORMULARIO PARA COMPRAS A CUOTAS (igual, pero ahora usa guardarCompraCuotas async) */}
      {mostrarFormCuotas && (
        <div ref={cuotasFormRef} className="mb-6 scroll-mt-24 bg-slate-900/80 border border-slate-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white">{editingCompraCuotasId ? 'Editar compra a cuotas' : 'Nueva compra a cuotas'}</h2>
            <button
              onClick={() => { setMostrarFormCuotas(false); setEditingCompraCuotasId(null); }}
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
                <FinanceSelect
                  value={compraCuotas.cuotasTotales}
                  onChange={(e) => setCompraCuotas({...compraCuotas, cuotasTotales: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition"
                >
                  {[1,2,3,4,5,6,7,8,9,10,11,12,18,24,36].map(num => (
                    <option key={num} value={num}>{num} cuota{num !== 1 ? 's' : ''}</option>
                  ))}
                </FinanceSelect>
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
                <FinanceSelect
                  value={compraCuotas.categoria}
                  onChange={(e) => setCompraCuotas({...compraCuotas, categoria: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition"
                >
                  {categoriasConfiguracion.map((category) => <option key={category} value={category}>{category}</option>)}
                </FinanceSelect>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Método de pago
                </label>
                <FinanceSelect
                  value={compraCuotas.metodo}
                  onChange={(e) => setCompraCuotas({...compraCuotas, metodo: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition"
                >
                  <option value="Tarjeta">Tarjeta</option>
                  <option value="Transferencia">Transferencia</option>
                  <option value="Bizum">Bizum</option>
                  <option value="Efectivo">Efectivo</option>
                  <option value="PayPal">PayPal</option>
                </FinanceSelect>
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
                <FinanceSelect
                  value={compraCuotas.frecuenciaPago}
                  onChange={(e) => setCompraCuotas({...compraCuotas, frecuenciaPago: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition"
                >
                  <option value="mensual">Mensual</option>
                  <option value="quincenal">Quincenal</option>
                  <option value="semanal">Semanal</option>
                  <option value="trimestral">Trimestral</option>
                </FinanceSelect>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-300 mb-2">Notas (opcional)</label>
                <textarea rows={2} value={compraCuotas.notas || ''} onChange={(e) => setCompraCuotas({ ...compraCuotas, notas: e.target.value })} className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white" />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => { setMostrarFormCuotas(false); setEditingCompraCuotasId(null); }}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-medium transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={guardarCompraCuotas}
                disabled={guardandoCompraCuotas}
                aria-busy={guardandoCompraCuotas}
                className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-purple-600 text-white rounded-lg font-medium transition"
              >
                <Save className="h-4 w-4" />
                {guardandoCompraCuotas ? 'Guardando...' : editingCompraCuotasId ? 'Guardar cambios' : 'Crear compra a cuotas'}
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
                          <div className="mt-1 text-xs text-slate-500">Vence: {pago.fechaInicio || 'Sin fecha'}</div>
                          {(pago.historialPagos || []).slice(0, 3).map((registro) => <div key={registro.id} className="mt-1 text-xs text-emerald-400">Pagado {registro.fechaPago} · {registro.cuenta}</div>)}
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
                            {pago.activo && (pago.pagadoPeriodo
                              ? <span className="rounded-lg bg-emerald-900/30 px-2 py-1 text-xs font-medium text-emerald-300">Periodo pagado</span>
                              : <button onClick={() => abrirPagoFijoDialog(pago)} className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-500">Marcar como pagado</button>)}
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
                              onClick={() => editarPagoFijo(pago)}
                              className="p-1.5 rounded-lg bg-sky-900/30 text-sky-300 hover:bg-sky-900/50 transition"
                              title="Editar"
                            >
                              <Pencil className="h-4 w-4" />
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
      {mostrarFormPresupuesto && (
        <form ref={presupuestoFormRef} onSubmit={guardarPresupuesto} className="mb-4 scroll-mt-24 space-y-3 rounded-xl border border-sky-800/40 bg-slate-900/70 p-5">
          <div className="flex items-center justify-between"><h3 className="font-semibold text-white">{editingPresupuestoId ? 'Editar presupuesto' : 'Nuevo presupuesto'}</h3><button type="button" onClick={() => { setMostrarFormPresupuesto(false); setEditingPresupuestoId(null); }} className="text-sm text-slate-400 hover:text-white">Cerrar</button></div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="text-sm text-slate-300">Mes<input type="month" required value={presupuestoForm.month} onChange={(e) => setPresupuestoForm({ ...presupuestoForm, month: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white" /></label>
            <label className="text-sm text-slate-300">Categoría<FinanceSelect required value={presupuestoForm.category} onChange={(e) => setPresupuestoForm({ ...presupuestoForm, category: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white"><option value="" disabled>Selecciona una categoría</option>{categoriasConfiguracion.map((category) => <option key={category} value={category}>{category}</option>)}</FinanceSelect></label>
            <label className="text-sm text-slate-300">Importe planificado (€)<input type="number" min="0" step="0.01" required value={presupuestoForm.amount} onChange={(e) => setPresupuestoForm({ ...presupuestoForm, amount: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white" /></label>
            <label className="text-sm text-slate-300">Notas<input value={presupuestoForm.notes} onChange={(e) => setPresupuestoForm({ ...presupuestoForm, notes: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white" /></label>
          </div>
          <div className="flex justify-end gap-2"><button type="button" onClick={() => { setMostrarFormPresupuesto(false); setEditingPresupuestoId(null); }} className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-slate-300">Cancelar</button><button type="submit" disabled={guardandoPresupuesto} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">{guardandoPresupuesto ? 'Guardando...' : editingPresupuestoId ? 'Guardar cambios' : 'Guardar presupuesto'}</button></div>
        </form>
      )}

      <div className="mb-8 overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50">
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div>
            <div className="flex items-center gap-3">
              <Wallet className="h-5 w-5 text-sky-400" />
              <span className="font-semibold text-white">Presupuestos mensuales</span>
            </div>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-400">El presupuesto es un límite de planificación: compara lo previsto con los gastos reales del mes. No aparta dinero, no modifica el saldo de una cuenta ni genera un movimiento. Para separar dinero real por objetivo, utiliza «Reservas».</p>
          </div>
          <div className="flex items-center gap-3"><span className="text-sm font-semibold text-sky-300">€{totalPresupuestoMesProximo.toFixed(2)} · {mesProximoTexto}</span><button onClick={abrirNuevoPresupuesto} className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-500">Nuevo presupuesto</button></div>
        </div>
        {presupuestos.length === 0 ? (
          <p className="px-6 py-6 text-sm text-slate-500">No hay presupuestos registrados.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
            {mesesPresupuesto.map((mes) => (
              <div key={mes} className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
                <h3 className="mb-3 font-medium capitalize text-white">{formatearPeriodo(mes)}</h3>
                <div className="space-y-3">
                  {presupuestos.filter((item) => item.month === mes).map((item) => {
                    const gastoReal = sumMoney(
                      gastosRegistrados.filter((gasto) =>
                        gasto.categoria === item.category && String(gasto.fecha || '').slice(0, 7) === item.month
                      ),
                      (gasto) => gasto.monto || 0
                    )
                    const pendienteApartar = Math.max(0, Number(item.amount || 0) - gastoReal)
                    return (
                      <div key={item.id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/40 p-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-200">{item.category}</p>
                          {item.notes && <p className="mt-1 text-xs text-slate-500">{item.notes}</p>}
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                            <span className="text-slate-400">Gastado: <strong className="font-semibold text-white">€{gastoReal.toFixed(2)}</strong></span>
                            <span className="text-amber-300">Pendiente de apartar: <strong className="font-semibold">€{pendienteApartar.toFixed(2)}</strong></span>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="whitespace-nowrap text-sm font-semibold text-emerald-300">€{item.amount.toFixed(2)}</span>
                          <button onClick={() => editarPresupuesto(item)} className="rounded-lg bg-slate-800 p-1.5 text-sky-300 hover:bg-slate-700" title="Editar presupuesto" aria-label="Editar presupuesto"><Pencil className="h-4 w-4" /></button>
                          <button onClick={() => eliminarPresupuesto(item)} className="rounded-lg bg-rose-950/30 p-1.5 text-rose-300 hover:bg-rose-900/40" title="Eliminar presupuesto" aria-label="Eliminar presupuesto"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="mt-3 border-t border-slate-800 pt-3 text-right text-sm font-semibold text-white">
                  <span>Total planificado: €{sumMoney(presupuestos.filter((item) => item.month === mes), (item) => item.amount || 0).toFixed(2)}</span><span className="ml-3 text-amber-300">Por apartar: €{sumMoney(presupuestos.filter((item) => item.month === mes), (item) => { const spent = sumMoney(gastosRegistrados.filter((gasto) => gasto.categoria === item.category && String(gasto.fecha || "").slice(0, 7) === item.month), (gasto) => gasto.monto || 0); return Math.max(0, item.amount - spent) }).toFixed(2)}</span>
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
                                  <div key={cuota.numero} className="grid grid-cols-1 items-center gap-2 border-b border-slate-800/60 py-2 last:border-0 sm:grid-cols-[minmax(0,1fr)_auto]">
                                    <div className="min-w-0">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-slate-200">Cuota {cuota.numero} de {compra.cuotasTotales}</span>
                                        <span className="capitalize text-slate-500">{formatearMesCuota(editingCalendarioId === compra.id ? (historialEditable.find((item) => item.numero === cuota.numero)?.fecha || cuota.fecha) : cuota.fecha)}</span>
                                        <span className={cuota.pagada ? 'text-emerald-300' : 'text-amber-300'}>{cuota.pagada ? 'Pagada' : 'Pendiente'}</span>
                                      </div>
                                      {editingCalendarioId === compra.id && (
                                        <label className="mt-2 block text-[11px] text-slate-500">
                                          Fecha de vencimiento
                                          <input
                                            type="date"
                                            value={historialEditable.find((item) => item.numero === cuota.numero)?.fecha || cuota.fecha || ''}
                                            disabled={Boolean(cuota.pagada || cuota.transactionId)}
                                            onChange={(e) => actualizarCuotaEditable(cuota.numero, 'fecha', e.target.value)}
                                            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white disabled:opacity-50"
                                          />
                                        </label>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2 sm:justify-end">
                                      {editingCalendarioId === compra.id ? (
                                        <label className="text-[11px] text-slate-500">
                                          Importe (€)
                                          <input
                                            type="number"
                                            min="0.01"
                                            step="0.01"
                                            value={historialEditable.find((item) => item.numero === cuota.numero)?.monto ?? cuota.monto}
                                            disabled={Boolean(cuota.pagada || cuota.transactionId)}
                                            onChange={(e) => actualizarCuotaEditable(cuota.numero, 'monto', e.target.value)}
                                            className="mt-1 w-28 rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-right text-xs font-semibold text-white disabled:opacity-50"
                                          />
                                        </label>
                                      ) : (
                                        <span className="font-semibold text-white">€{Number(cuota.monto || 0).toFixed(2)}</span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                              {editingCalendarioId === compra.id ? (
                                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-700 pt-3">
                                  <span className="text-xs text-slate-500">Los importes deben sumar €{Number(compra.montoTotal).toFixed(2)}. Los pagos vinculados están bloqueados.</span>
                                  <div className="flex gap-2">
                                    <button type="button" onClick={() => { setEditingCalendarioId(null); setHistorialEditable([]); }} className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-300">Cancelar</button>
                                    <button type="button" onClick={() => guardarCalendarioCuotas(compra)} className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500">Guardar calendario</button>
                                  </div>
                                </div>
                              ) : (
                                <div className="mt-3 flex justify-end">
                                  <button type="button" onClick={() => abrirEdicionCalendario(compra)} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-sky-300 hover:bg-slate-700"><Pencil className="h-3.5 w-3.5" />Editar importes y fechas</button>
                                </div>
                              )}
                            </div>

                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                          <button
                            onClick={() => proximaCuota && abrirDialogoPagoCuota(compra, proximaCuota)}
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
                            <button onClick={() => abrirEdicionCompraCuotas(compra)} className="rounded-lg bg-sky-900/30 p-1.5 text-sky-300 hover:bg-sky-900/50" title="Editar plan" aria-label="Editar plan"><Pencil className="h-4 w-4" /></button>
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
    </div>
  )
}