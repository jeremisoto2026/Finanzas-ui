import { useState, useMemo, useEffect, useCallback } from 'react';
import { localDateInputValue, monthKeyFromDate, parseDateOnlyLocal, sumMoney, sumMoneyBy } from '@/lib/finance-core';

// ICONOS LUCIDE REACT para ingresos (paleta verde unificada)
import { 
  Download, 
  Filter,
  Calendar,
  CreditCard,
  Database,
  Tag,
  TrendingUp,
  Bell,
  ChevronDown,
  FileText,
  Wallet,
  AlertCircle,
  RefreshCw,
  Lightbulb,
  Clock,
  TrendingDown,
  PieChart,
  Target,
  BarChart3,
  AlertTriangle,
  DollarSign,
  Percent,
  Zap,
  Shield,
  Thermometer,
  Plus,
  Save,
  X,
  Pencil,
  Trash2
} from 'lucide-react';

const normalizeIncomeCategory = (value) => String(value || '').trim().normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es-ES')
const FIXED_INCOME_CATEGORIES = new Set(['sueldo', 'pension', 'alquiler recibido', 'subsidio', 'nomina'])

export default function TablaIngresos() {
  // Estados para los ingresos registrados en Supabase
  const [ingresosMensuales, setIngresosMensuales] = useState([]);
  const [cuentasUsuario, setCuentasUsuario] = useState([]);
  const [cuentasLoading, setCuentasLoading] = useState(true);
  const [cuentasError, setCuentasError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingIngresoId, setEditingIngresoId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [nuevoIngreso, setNuevoIngreso] = useState({
    concepto: '',
    monto: '',
    fecha: localDateInputValue(),
    categoria: 'Nómina',
    cuentaId: '',
    metodo: 'Transferencia'
  });

  // Estados de filtros
  const [filtroMes, setFiltroMes] = useState('');
  const [filtroMetodo, setFiltroMetodo] = useState('');
  const [filtroCuenta, setFiltroCuenta] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');

  // Load real data only. Failed requests never populate demo figures.
  useEffect(() => {
    const fetchIngresos = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch('/api/ingresos');
        if (!res.ok) throw new Error('No se pudieron cargar los ingresos.');
        const data = await res.json();
        if (!Array.isArray(data)) throw new Error('La respuesta de ingresos no tiene el formato esperado.');
        setIngresosMensuales(data);
      } catch (err) {
        setError(err.message);
        console.error('Error fetching ingresos:', err);
        setIngresosMensuales([]);
      } finally {
        setLoading(false);
      }
    };
    fetchIngresos();
  }, []);

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
      console.error('No se pudieron cargar las cuentas para registrar ingresos:', loadError)
      setCuentasUsuario([])
      setCuentasError(loadError?.message || 'No se pudieron cargar tus cuentas.')
    } finally {
      setCuentasLoading(false)
    }
  }, [])

  useEffect(() => {
    void cargarCuentasUsuario()
  }, [cargarCuentasUsuario])

  const abrirNuevoIngreso = () => {
    setEditingIngresoId(null)
    setNuevoIngreso({
      concepto: '', monto: '', fecha: localDateInputValue(),
      categoria: 'Nómina', cuentaId: '', metodo: 'Transferencia',
      idempotencyKey: crypto.randomUUID(),
    })
    setFormError('')
    setFormOpen(true)
  }

  const editarIngreso = (ingreso) => {
    setEditingIngresoId(ingreso.id)
    setNuevoIngreso({
      concepto: ingreso.concepto || '',
      monto: String(ingreso.monto ?? ''),
      fecha: String(ingreso.fecha || '').slice(0, 10),
      categoria: ingreso.categoria || 'Otros',
      cuentaId: ingreso.cuentaId || '',
      metodo: ingreso.metodo || 'Transferencia',
    })
    setFormError('')
    setFormOpen(true)
  }

  const guardarIngreso = async (event) => {
    event.preventDefault()
    const amount = Number(nuevoIngreso.monto)
    if (!nuevoIngreso.concepto.trim() || !Number.isFinite(amount) || amount <= 0 || !nuevoIngreso.fecha) {
      setFormError('Completa el concepto, un importe positivo y la fecha.')
      return
    }
    if (!nuevoIngreso.cuentaId || !cuentasUsuario.some((account) => account.id === nuevoIngreso.cuentaId)) {
      setFormError('Selecciona una cuenta válida donde recibiste el dinero.')
      return
    }

    try {
      setSaving(true)
      setFormError('')
      const response = await fetch('/api/ingresos', {
        method: editingIngresoId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(editingIngresoId ? { id: editingIngresoId } : { idempotencyKey: nuevoIngreso.idempotencyKey || crypto.randomUUID() }),
          ...nuevoIngreso,
          monto: amount,
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo guardar el ingreso.')

      setIngresosMensuales((current) => editingIngresoId
        ? current.map((item) => item.id === editingIngresoId ? result : item)
        : [result, ...current])
      setFiltroMes(result.fecha.slice(0, 7))
      setNuevoIngreso({
        concepto: '', monto: '', fecha: localDateInputValue(),
        categoria: 'Nómina', cuentaId: '', metodo: 'Transferencia',
        idempotencyKey: crypto.randomUUID(),
      })
      setEditingIngresoId(null)
      setFormOpen(false)
    } catch (err) {
      setFormError(err.message || 'No se pudo guardar el ingreso.')
    } finally {
      setSaving(false)
    }
  }

  const eliminarIngreso = (ingreso) => setDeleteTarget(ingreso)

  const confirmarEliminarIngreso = async () => {
    if (!deleteTarget) return
    try {
      setSaving(true)
      const response = await fetch('/api/ingresos', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deleteTarget.id }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo anular el ingreso.')
      setIngresosMensuales((current) => current.filter((item) => item.id !== deleteTarget.id))
      setDeleteTarget(null)
      setFormError('')
    } catch (err) {
      setFormError(err.message || 'No se pudo anular el ingreso.')
    } finally {
      setSaving(false)
    }
  }

  // ========== FUNCIONES PARA DATOS DINÁMICOS ==========

  // 1. Obtener meses únicos de los datos
  const obtenerMesesDisponibles = useMemo(() => {
    const mesesSet = new Set();
    
    ingresosMensuales.forEach(ingreso => {
      if (ingreso.fecha) {
        try {
          const monthKey = monthKeyFromDate(ingreso.fecha);
          if (monthKey) mesesSet.add(monthKey);
        } catch (error) {
          console.error('Error procesando fecha:', ingreso.fecha, error);
        }
      }
    });
    
    // Convertir a array y ordenar descendente (más reciente primero)
    const mesesArray = Array.from(mesesSet);
    return mesesArray.sort((a, b) => b.localeCompare(a));
  }, [ingresosMensuales]);

  // 2. Obtener métodos de recepción únicos
  const metodosRecepcionDisponibles = useMemo(() => {
    const metodosSet = new Set();
    ingresosMensuales.forEach(ingreso => {
      if (ingreso.metodo) metodosSet.add(ingreso.metodo);
    });
    return Array.from(metodosSet).sort();
  }, [ingresosMensuales]);

  // 3. Obtener cuentas únicas
  const cuentasDisponibles = useMemo(() => {
    const cuentasSet = new Set();
    ingresosMensuales.forEach(ingreso => {
      if (ingreso.cuenta) cuentasSet.add(ingreso.cuenta);
    });
    return Array.from(cuentasSet).sort();
  }, [ingresosMensuales]);

  // 4. Obtener categorías únicas
  const categoriasDisponibles = useMemo(() => {
    const categoriasSet = new Set();
    ingresosMensuales.forEach(ingreso => {
      if (ingreso.categoria) categoriasSet.add(ingreso.categoria);
    });
    return Array.from(categoriasSet).sort();
  }, [ingresosMensuales]);

  // 5. Función para formatear mes a texto
  const formatearMesTexto = (mesFormato) => {
    if (!mesFormato) return '';
    const [año, mes] = mesFormato.split('-');
    const fecha = new Date(año, parseInt(mes) - 1);
    return fecha.toLocaleDateString('es-ES', { 
      month: 'long', 
      year: 'numeric' 
    });
  };

  // 6. Obtener mes actual en formato YYYY-MM
  const mesActual = useMemo(() => {
    const ahora = new Date();
    return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  // ========== FILTRADO DE DATOS ==========
  const ingresosFiltrados = useMemo(() => {
    return ingresosMensuales.filter(ingreso => {
      if (ingreso.fecha) {
        const mesIngreso = monthKeyFromDate(ingreso.fecha);
        if (!mesIngreso) return false;
        
        const cumpleMes = !filtroMes || mesIngreso === filtroMes;
        const cumpleMetodo = !filtroMetodo || ingreso.metodo === filtroMetodo;
        const cumpleCuenta = !filtroCuenta || ingreso.cuenta === filtroCuenta;
        const cumpleCategoria = !filtroCategoria || ingreso.categoria === filtroCategoria;
        
        return cumpleMes && cumpleMetodo && cumpleCuenta && cumpleCategoria;
      }
      return false;
    });
  }, [ingresosMensuales, filtroMes, filtroMetodo, filtroCuenta, filtroCategoria]);

  // ========== CÁLCULOS PRINCIPALES MEJORADOS ==========

  // 1. Total
  const total = sumMoney(ingresosFiltrados, (ingreso) => ingreso.monto || 0);

  // 2. Calcular estadísticas por categoría con clasificación
  const estadisticasCategorias = useMemo(() => {
    const groupedTotals = sumMoneyBy(
      ingresosFiltrados,
      (ingreso) => ingreso.categoria || 'Otros',
      (ingreso) => ingreso.monto || 0
    );
    const categorias = Object.fromEntries(Object.entries(groupedTotals).map(([name, value]) => [
      name,
      { total: value, count: ingresosFiltrados.filter((ingreso) => (ingreso.categoria || 'Otros') === name).length,
        promedio: 0, porcentaje: 0, tipo: 'variable' }
    ]));
    
    // Calcular promedio y porcentaje
    Object.keys(categorias).forEach(categoria => {
      categorias[categoria].promedio = categorias[categoria].total / categorias[categoria].count;
      categorias[categoria].porcentaje = (categorias[categoria].total / total) * 100;
      
      // Determinar tipo de ingreso (FIJO vs VARIABLE)
      // La categoría fija se identifica sin depender de mayúsculas o tildes.
      // La repetición en un mismo mes nunca convierte automáticamente un ingreso en fijo.
      categorias[categoria].tipo = FIXED_INCOME_CATEGORIES.has(normalizeIncomeCategory(categoria))
        ? 'fijo'
        : 'variable';
    });
    
    return categorias;
  }, [ingresosFiltrados, total]);

  // 3. Análisis de ingresos FIJOS vs VARIABLES
  const analisisTiposIngresos = useMemo(() => {
    const categoryStats = Object.values(estadisticasCategorias)
    const fijos = sumMoney(
      categoryStats.filter((item) => item.tipo === 'fijo'),
      (item) => item.total
    )
    const variables = sumMoney(
      categoryStats.filter((item) => item.tipo !== 'fijo'),
      (item) => item.total
    )
    const totalCalculado = sumMoney([fijos, variables])

    return {
      fijos,
      variables,
      porcentajeFijos: totalCalculado > 0 ? (fijos / totalCalculado) * 100 : 0,
      porcentajeVariables: totalCalculado > 0 ? (variables / totalCalculado) * 100 : 0,
      estabilidad: totalCalculado > 0 && fijos >= 0.6 * totalCalculado ? 'Alta' : 'Media',
    }
  }, [estadisticasCategorias]);

  // 4. Calcular categoría principal con más detalles
  const categoriaPrincipal = useMemo(() => {
    const categorias = Object.entries(estadisticasCategorias);
    if (categorias.length === 0) return { nombre: 'N/A', monto: 0, porcentaje: 0, tipo: 'N/A' };
    
    const [nombre, datos] = categorias.sort((a, b) => b[1].total - a[1].total)[0];
    return { 
      nombre, 
      monto: datos.total,
      porcentaje: datos.porcentaje,
      tipo: datos.tipo
    };
  }, [estadisticasCategorias]);

  // 5. Calcular cuenta más usada
  const cuentaMasUsada = useMemo(() => {
    const cuentas = ingresosFiltrados.reduce((acc, ingreso) => {
      acc[ingreso.cuenta] = (acc[ingreso.cuenta] || 0) + 1;
      return acc;
    }, {});
    
    const cuenta = Object.entries(cuentas).sort((a, b) => b[1] - a[1])[0];
    return cuenta ? cuenta[0] : 'N/A';
  }, [ingresosFiltrados]);

  // 6. Calcular método más común
  const metodoMasComun = useMemo(() => {
    const metodos = ingresosFiltrados.reduce((acc, ingreso) => {
      acc[ingreso.metodo] = (acc[ingreso.metodo] || 0) + 1;
      return acc;
    }, {});
    
    const metodo = Object.entries(metodos).sort((a, b) => b[1] - a[1])[0];
    return metodo ? metodo[0] : 'N/A';
  }, [ingresosFiltrados]);

  // 7. Análisis de frecuencia de ingresos
  const analisisFrecuencia = useMemo(() => {
    if (ingresosFiltrados.length === 0) return { promedioDiario: 0, diasConIngresos: 0, ingresoPorDia: 0 };
    
    const fechasUnicas = new Set();
    let totalDias = 0;
    
    ingresosFiltrados.forEach(ingreso => {
      if (ingreso.fecha) {
        fechasUnicas.add(ingreso.fecha.split('T')[0]);
      }
    });
    
    // Calcular promedio por día con ingresos
    const diasConIngresos = fechasUnicas.size;
    const ingresoPorDia = total / diasConIngresos;
    
    // Si tenemos filtro por mes, calcular días totales del mes
    if (filtroMes) {
      const [año, mes] = filtroMes.split('-').map(Number);
      const diasEnMes = new Date(año, mes, 0).getDate();
      totalDias = diasEnMes;
    }
    
    return {
      promedioDiario: diasConIngresos > 0 ? total / diasConIngresos : 0,
      diasConIngresos,
      ingresoPorDia,
      porcentajeDiasConIngresos: totalDias > 0 ? (diasConIngresos / totalDias) * 100 : 0
    };
  }, [ingresosFiltrados, total, filtroMes]);

  // 8. Alertas de ingresos atípicos
  const alertasIngresos = useMemo(() => {
    if (ingresosFiltrados.length < 3) return [];
    
    const alertas = [];
    
    // Calcular promedio y desviación estándar
    const montos = ingresosFiltrados.map(i => i.monto);
    const promedio = montos.reduce((a, b) => a + b, 0) / montos.length;
    const desviacion = Math.sqrt(
      montos.reduce((sq, n) => sq + Math.pow(n - promedio, 2), 0) / montos.length
    );
    
    // Buscar ingresos atípicos (más de 2 desviaciones estándar)
    ingresosFiltrados.forEach(ingreso => {
      if (ingreso.monto > promedio + (2 * desviacion)) {
        alertas.push({
          tipo: 'alto',
          mensaje: `Ingreso inusualmente alto en ${ingreso.concepto}: €${ingreso.monto.toFixed(2)}`,
          categoria: ingreso.categoria,
          monto: ingreso.monto,
          fecha: ingreso.fecha
        });
      }
    });
    
    // Verificar dependencia excesiva de una categoría
    Object.entries(estadisticasCategorias).forEach(([categoria, datos]) => {
      if (datos.porcentaje > 80) {
        alertas.push({
          tipo: 'dependencia',
          mensaje: `Dependes en un ${datos.porcentaje.toFixed(1)}% de ${categoria}`,
          categoria,
          porcentaje: datos.porcentaje
        });
      }
    });
    
    return alertas.slice(0, 3);
  }, [ingresosFiltrados, estadisticasCategorias]);

  // 9. Sugerencia de crecimiento inteligente mejorada
  const sugerenciaCrecimiento = useMemo(() => {
    if (Object.keys(estadisticasCategorias).length === 0) {
      return { categoria: null, crecimientoPotencial: 0, mensaje: '', tipo: 'diversificacion' };
    }
    
    // Priorizar categorías VARIABLES para crecimiento (más fácil de aumentar)
    const categoriasVariables = Object.entries(estadisticasCategorias)
      .filter(([_, datos]) => datos.tipo === 'variable')
      .sort((a, b) => b[1].promedio - a[1].promedio);
    
    if (categoriasVariables.length > 0) {
      const [nombre, datos] = categoriasVariables[0];
      const crecimientoPotencial = datos.promedio * 2;
      
      return {
        categoria: nombre,
        crecimientoPotencial,
        mensaje: `Duplica tu actividad en ${nombre} para ganar ~€${crecimientoPotencial.toFixed(0)} extra/mes`,
        tipo: 'variable',
        porcentajeCrecimiento: 100
      };
    }
    
    // Si solo hay ingresos fijos, sugerir diversificación
    const [nombre, datos] = Object.entries(estadisticasCategorias)
      .sort((a, b) => b[1].total - a[1].total)[0];
    const crecimientoPotencial = datos.total * 0.10;
    
    return {
      categoria: nombre,
      crecimientoPotencial,
      mensaje: `Diversifica añadiendo nuevas fuentes de ingreso, podrías ganar ~€${crecimientoPotencial.toFixed(0)} más/mes`,
      tipo: 'diversificacion',
      porcentajeCrecimiento: 10
    };
  }, [estadisticasCategorias]);

  // 10. Meta de ingresos y progreso (mantenemos esta funcionalidad única)
  const metaIngresos = useMemo(() => {
    // El promedio solo utiliza meses con ingresos reales registrados.
    const meses = obtenerMesesDisponibles.slice(0, 3);
    const movimientosRecientes = ingresosMensuales.filter((ingreso) => meses.includes(monthKeyFromDate(ingreso.fecha)));
    const totalesPorMes = sumMoneyBy(
      movimientosRecientes,
      (ingreso) => monthKeyFromDate(ingreso.fecha),
      (ingreso) => ingreso.monto || 0
    );
    const valores = meses.map((mes) => totalesPorMes[mes]).filter((value) => value !== undefined);
    const promedioUltimosMeses = valores.length > 0 ? sumMoney(valores) / valores.length : 0;
    const meta = promedioUltimosMeses * 1.1;
    const progreso = meta > 0 ? (total / meta) * 100 : 0;

    return {
      meta: Math.round(meta * 100) / 100,
      progreso: Math.min(progreso, 100),
      alcanzada: meta > 0 && total >= meta,
      diferencia: total - meta,
    };
  }, [ingresosMensuales, total, obtenerMesesDisponibles]);

  // 11. Próximos ingresos estimados
  const proximosIngresos = useMemo(() => {
    const ingresosMesActual = ingresosMensuales.filter(ingreso => {
      if (!ingreso.fecha) return false;
      return monthKeyFromDate(ingreso.fecha) === mesActual;
    });
    
    if (ingresosMesActual.length === 0) return [];
    
    const conceptosRecurrentes = {};
    
    ingresosMesActual.forEach(ingreso => {
      const clave = `${ingreso.concepto}-${ingreso.categoria}`;
      
      if (!conceptosRecurrentes[clave]) {
        conceptosRecurrentes[clave] = {
          concepto: ingreso.concepto,
          categoria: ingreso.categoria,
          montos: [],
          cuenta: ingreso.cuenta,
          metodo: ingreso.metodo,
          ultimaFecha: ingreso.fecha
        };
      } else if (String(ingreso.fecha).slice(0, 10) > String(conceptosRecurrentes[clave].ultimaFecha).slice(0, 10)) {
        conceptosRecurrentes[clave].ultimaFecha = ingreso.fecha;
      }
      conceptosRecurrentes[clave].montos.push(ingreso.monto);
    });
    
    const estimaciones = Object.values(conceptosRecurrentes)
      .filter(item => item.montos.length >= 1)
      .map(item => {
        const montoPromedio = sumMoney(item.montos) / item.montos.length;
        const fechaUltima = parseDateOnlyLocal(item.ultimaFecha);
        if (!fechaUltima) return null;

        const proximaFechaEstimada = new Date(fechaUltima);
        if (item.concepto.toLowerCase().includes('salario') ||
            item.concepto.toLowerCase().includes('nómina')) {
          proximaFechaEstimada.setMonth(proximaFechaEstimada.getMonth() + 1, 1);
        } else if (item.categoria === 'Freelance' || item.categoria === 'Consultoría') {
          proximaFechaEstimada.setDate(proximaFechaEstimada.getDate() + 15);
        } else {
          proximaFechaEstimada.setDate(proximaFechaEstimada.getDate() + 30);
        }
        
        return {
          concepto: item.concepto,
          categoria: item.categoria,
          montoEstimado: montoPromedio,
          proximaFecha: localDateInputValue(proximaFechaEstimada),
          confianza: item.montos.length > 1 ? 'Alta' : 'Media',
          cuenta: item.cuenta
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.proximaFecha.localeCompare(b.proximaFecha))
      .slice(0, 3);
    
    return estimaciones;
  }, [ingresosMensuales, mesActual]);

  // 12. Tendencias mensuales mejoradas (igual que TablaGastos)
  const tendenciaMensual = useMemo(() => {
    if (obtenerMesesDisponibles.length < 2) {
      return { cambio: 0, mensaje: 'Datos insuficientes', tendencia: 'neutral' };
    }

    const meses = obtenerMesesDisponibles.slice(0, 2);
    const movimientos = ingresosMensuales.filter((ingreso) => meses.includes(monthKeyFromDate(ingreso.fecha)));
    const totalesPorMes = sumMoneyBy(
      movimientos,
      (ingreso) => monthKeyFromDate(ingreso.fecha),
      (ingreso) => ingreso.monto || 0
    );
    const categoriasPorMes = {};
    movimientos.forEach((ingreso) => {
      const mes = monthKeyFromDate(ingreso.fecha);
      const categoria = ingreso.categoria || 'Otros';
      if (!categoriasPorMes[mes]) categoriasPorMes[mes] = {};
      categoriasPorMes[mes][categoria] = sumMoney([
        categoriasPorMes[mes][categoria] || 0,
        ingreso.monto || 0,
      ]);
    });

    const [mesActualKey, mesAnteriorKey] = meses;
    const actual = totalesPorMes[mesActualKey] || 0;
    const anterior = totalesPorMes[mesAnteriorKey] || 0;

    if (anterior === 0) return { 
      cambio: 0, 
      mensaje: 'Sin datos previos',
      tendencia: 'neutral'
    };
    
    const cambio = ((actual - anterior) / anterior) * 100;
    
    // Analizar cambio en categorías principales
    let analisisCategorias = '';
    if (categoriasPorMes[mesActualKey] && categoriasPorMes[mesAnteriorKey]) {
      const categoriasActual = Object.keys(categoriasPorMes[mesActualKey]);
      const categoriasAnterior = Object.keys(categoriasPorMes[mesAnteriorKey]);
      
      const nuevasCategorias = categoriasActual.filter(c => !categoriasAnterior.includes(c));
      if (nuevasCategorias.length > 0) {
        analisisCategorias = ` Nuevas categorías: ${nuevasCategorias.join(', ')}`;
      }
    }
    
    return {
      cambio,
      tendencia: cambio > 5 ? 'subiendo' : cambio < -5 ? 'bajando' : 'estable',
      mensaje: cambio > 0 
        ? `↑ Aumento del ${Math.abs(cambio).toFixed(1)}% vs ${formatearMesTexto(mesAnteriorKey)}${analisisCategorias}`
        : cambio < 0
        ? `↓ Disminución del ${Math.abs(cambio).toFixed(1)}% vs ${formatearMesTexto(mesAnteriorKey)}${analisisCategorias}`
        : `Sin cambios significativos vs ${formatearMesTexto(mesAnteriorKey)}${analisisCategorias}`
    };
  }, [ingresosMensuales, obtenerMesesDisponibles]);

  // 13. Exportar CSV mejorado (igual que TablaGastos)
  const exportarCSV = () => {
    const headers = ['Fecha', 'Concepto', 'Método', 'Categoría', 'Tipo', 'Cuenta', 'Monto'];
    const filas = ingresosFiltrados.map(i => {
      const tipo = estadisticasCategorias[i.categoria]?.tipo || 'variable';
      return [i.fecha, i.concepto, i.metodo, i.categoria, tipo, i.cuenta, i.monto].join(',');
    });
    
    const csv = [headers.join(','), ...filas].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ingresos_${filtroMes || 'todos'}_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  // ========== ESTADOS DE CARGA Y ERROR ==========
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-12 w-12 text-emerald-400 animate-spin mx-auto mb-4" />
          <p className="text-slate-400 text-lg">Cargando ingresos desde Supabase...</p>
          <p className="text-slate-500 text-sm mt-2">Conectando con tu base de datos</p>
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
              <h2 className="text-xl font-bold text-white">Error al cargar ingresos</h2>
            </div>
            <p className="text-slate-300 mb-4">{error}</p>
            <p className="text-slate-400 text-sm mb-6">
              No se muestran importes hasta recuperar los datos reales. Comprueba la conexión y vuelve a intentarlo.
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
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 pb-8">
      {/* HEADER MEJORADO (igual que TablaGastos) */}
      <div className="mb-8">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">Ingresos del Mes</h1>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-3xl font-bold text-emerald-400">€{total.toFixed(2)}</span>
              <div className="h-2 w-2 rounded-full bg-slate-600"></div>
              <span className="text-slate-400">
                {filtroMes ? formatearMesTexto(filtroMes) : 'Todos los meses'}
              </span>
              <span className="text-slate-500 text-sm bg-slate-900 px-3 py-1 rounded-full">
                {ingresosFiltrados.length} transacciones
              </span>
            </div>
            {/* TENDENCIA MEJORADA (igual que TablaGastos) */}
            {tendenciaMensual.cambio !== 0 && (
              <div className={`mt-2 text-sm flex items-center gap-2 ${
                tendenciaMensual.tendencia === 'subiendo' ? 'text-emerald-400' : 
                tendenciaMensual.tendencia === 'bajando' ? 'text-red-400' : 'text-slate-400'
              }`}>
                {tendenciaMensual.tendencia === 'subiendo' ? <TrendingUp className="h-4 w-4" /> :
                 tendenciaMensual.tendencia === 'bajando' ? <TrendingDown className="h-4 w-4" /> :
                 <TrendingDown className="h-4 w-4" />}
                <span>{tendenciaMensual.mensaje}</span>
              </div>
            )}
            {/* BARRA DE PROGRESO DE META (mantenemos esta funcionalidad única) */}
            <div className="mt-3 max-w-md">
              <div className="flex justify-between text-sm text-slate-400 mb-1">
                <span>Meta mensual: €{metaIngresos.meta}</span>
                <span>{metaIngresos.progreso.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full transition-all duration-700 ${
                    metaIngresos.alcanzada 
                      ? 'bg-emerald-500' 
                      : 'bg-gradient-to-r from-amber-500 to-amber-400'
                  }`}
                  style={{ width: `${Math.min(metaIngresos.progreso, 100)}%` }}
                ></div>
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {metaIngresos.alcanzada 
                  ? '✅ Meta alcanzada' 
                  : `Faltan €${Math.max(0, metaIngresos.meta - total).toFixed(2)} para la meta`}
              </div>
            </div>
          </div>
          
          {/* BOTÓN DE EXPORTAR MEJORADO (igual que TablaGastos) */}
          <button 
            onClick={exportarCSV}
            className="group flex items-center gap-3 px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-all duration-200 hover:shadow-lg hover:shadow-emerald-900/30"
          >
            <Download className="h-5 w-5 group-hover:scale-110 transition-transform" />
            <FileText className="h-5 w-5" />
            <span>Exportar CSV</span>
          </button>
        </div>
      </div>

      <div className="mb-5 flex justify-end">
        <button onClick={abrirNuevoIngreso} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500"><Plus className="h-4 w-4" />Nuevo ingreso</button>
      </div>

      {formOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm sm:p-6"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) {
              setFormOpen(false)
              setEditingIngresoId(null)
            }
          }}
        >
          <form onSubmit={guardarIngreso} role="dialog" aria-modal="true" aria-labelledby="income-dialog-title" className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-400">Libro de ingresos</p>
                <h2 id="income-dialog-title" className="mt-1 text-xl font-semibold text-white">{editingIngresoId ? 'Editar ingreso' : 'Registrar ingreso'}</h2>
                <p className="mt-1 text-sm text-slate-400">El cambio actualizará el movimiento y el saldo de la cuenta.</p>
              </div>
              <button type="button" onClick={() => { setFormOpen(false); setEditingIngresoId(null); }} className="rounded-xl border border-slate-700 p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white" aria-label="Cerrar formulario"><X className="h-5 w-5" /></button>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="text-sm font-medium text-slate-300 md:col-span-2">Concepto
                <input required value={nuevoIngreso.concepto} onChange={(e) => setNuevoIngreso({ ...nuevoIngreso, concepto: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-3 text-white outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" placeholder="Ej. Nómina de noviembre" />
              </label>
              <label className="text-sm font-medium text-slate-300">Importe (€)
                <input required type="number" min="0.01" step="0.01" value={nuevoIngreso.monto} onChange={(e) => setNuevoIngreso({ ...nuevoIngreso, monto: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-3 text-white outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
              </label>
              <label className="text-sm font-medium text-slate-300">Fecha
                <input required type="date" value={nuevoIngreso.fecha} onChange={(e) => setNuevoIngreso({ ...nuevoIngreso, fecha: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-3 text-white outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
              </label>
              <label className="text-sm font-medium text-slate-300">Categoría
                <select value={nuevoIngreso.categoria} onChange={(e) => setNuevoIngreso({ ...nuevoIngreso, categoria: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-3 text-white outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20">
                  <optgroup label="Ingresos habituales"><option>Nómina</option><option>Trabajo / reparto</option><option>Horas extra</option><option>Extras</option><option>Alquiler recibido</option><option>Prestaciones y ayudas</option></optgroup>
                  <optgroup label="Ingresos puntuales"><option>Propinas</option><option>Ventas</option><option>Cobros de préstamos</option><option>Préstamo recibido</option><option>Reembolsos</option><option>Intereses</option><option>Otros</option></optgroup>
                </select>
              </label>
              <label className="text-sm font-medium text-slate-300">¿En qué cuenta recibiste el ingreso?
                <select required value={nuevoIngreso.cuentaId} onChange={(e) => setNuevoIngreso({ ...nuevoIngreso, cuentaId: e.target.value })} disabled={cuentasLoading || cuentasUsuario.length === 0} className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-3 text-white outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-60">
                  <option value="">{cuentasLoading ? 'Cargando cuentas…' : cuentasUsuario.length ? 'Selecciona una cuenta' : 'No hay cuentas disponibles'}</option>
                  {cuentasUsuario.filter((account) => account.isActive !== false || account.id === nuevoIngreso.cuentaId).map((account) => <option key={account.id} value={account.id} disabled={account.isActive === false}>{account.name}{account.isActive === false ? ' · Desactivada' : ''} · {account.currencyCode || 'EUR'}</option>)}
                </select>
                <span className="mt-1 block text-xs font-normal text-slate-500">El importe se sumará al saldo de esta cuenta.</span>
                {cuentasError && (
                  <span role="alert" className="mt-2 flex flex-wrap items-center gap-2 text-xs font-normal text-rose-300">
                    {cuentasError}
                    <button type="button" onClick={() => void cargarCuentasUsuario()} className="rounded-lg border border-rose-700/60 px-2 py-1 font-semibold text-rose-200 hover:bg-rose-950/40">Volver a cargar</button>
                  </span>
                )}
              </label>
              <label className="text-sm font-medium text-slate-300">Método de recepción
                <select value={nuevoIngreso.metodo} onChange={(e) => setNuevoIngreso({ ...nuevoIngreso, metodo: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-3 text-white outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"><option>Transferencia</option><option>Bizum</option><option>Efectivo</option><option>Tarjeta</option></select>
              </label>
            </div>
            {formError && <p role="alert" className="mt-4 rounded-xl border border-rose-800/50 bg-rose-950/30 px-3 py-2.5 text-sm text-rose-200">{formError}</p>}
            <div className="mt-6 flex flex-col-reverse gap-2 border-t border-slate-800 pt-4 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => { setFormOpen(false); setEditingIngresoId(null); setFormError(''); }} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-slate-800">Cancelar</button>
              <button type="submit" disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"><Save className="h-4 w-4" />{saving ? 'Guardando…' : editingIngresoId ? 'Guardar cambios' : 'Registrar ingreso'}</button>
            </div>
          </form>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-labelledby="delete-income-title" className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="rounded-xl bg-rose-500/10 p-2.5 text-rose-300"><Trash2 className="h-5 w-5" /></span>
              <div><h2 id="delete-income-title" className="font-semibold text-white">Anular este ingreso</h2><p className="mt-1 text-sm leading-6 text-slate-400">Se retirará del saldo y de los totales, pero quedará conservado en el registro para mantener la trazabilidad.</p></div>
            </div>
            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
              <p className="truncate text-sm font-medium text-slate-200">{deleteTarget.concepto}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-emerald-300">{new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(deleteTarget.monto)}</p>
            </div>
            {formError && <p role="alert" className="mt-3 rounded-lg border border-rose-800/50 bg-rose-950/30 p-3 text-sm text-rose-200">{formError}</p>}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" disabled={saving} onClick={() => setDeleteTarget(null)} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50">Conservar ingreso</button>
              <button type="button" disabled={saving} onClick={confirmarEliminarIngreso} className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-50">{saving ? 'Anulando…' : 'Sí, anular ingreso'}</button>
            </div>
          </section>
        </div>
      )}

      {/* LAYOUT DE DOS COLUMNAS (igual que TablaGastos) */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* COLUMNA IZQUIERDA - FILTROS Y ANÁLISIS */}
        <div className="lg:w-1/3 xl:w-1/4 space-y-6">
          {/* PANEL DE FILTROS MEJORADO */}
          <div className="bg-slate-900/80 backdrop-blur-sm rounded-xl border border-slate-800 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Filter className="h-5 w-5 text-emerald-400" />
              <h2 className="text-lg font-semibold text-white">Filtros</h2>
            </div>
            
            <div className="space-y-4">
              {/* FILTRO MES - DINÁMICO */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-1.5">
                  <Calendar className="h-4 w-4 text-emerald-400" />
                  Mes
                </label>
                <div className="relative">
                  <select 
                    value={filtroMes}
                    onChange={(e) => setFiltroMes(e.target.value)}
                    className="w-full px-4 py-2.5 pl-10 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition appearance-none"
                  >
                    <option value="">Todos los meses</option>
                    {obtenerMesesDisponibles.map((mes) => (
                      <option key={mes} value={mes}>
                        {formatearMesTexto(mes)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
                </div>
              </div>

              {/* FILTRO MÉTODO - DINÁMICO */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-1.5">
                  <CreditCard className="h-4 w-4 text-blue-400" />
                  Método de recepción
                </label>
                <div className="relative">
                  <select 
                    value={filtroMetodo}
                    onChange={(e) => setFiltroMetodo(e.target.value)}
                    className="w-full px-4 py-2.5 pl-10 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition appearance-none"
                  >
                    <option value="">Todos los métodos</option>
                    {metodosRecepcionDisponibles.map(metodo => (
                      <option key={metodo} value={metodo}>{metodo}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
                </div>
              </div>

              {/* FILTRO CUENTA - DINÁMICO */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-1.5">
                  <Database className="h-4 w-4 text-green-400" />
                  Cuenta
                </label>
                <div className="relative">
                  <select 
                    value={filtroCuenta}
                    onChange={(e) => setFiltroCuenta(e.target.value)}
                    className="w-full px-4 py-2.5 pl-10 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition appearance-none"
                  >
                    <option value="">Todas las cuentas</option>
                    {cuentasDisponibles.map(cuenta => (
                      <option key={cuenta} value={cuenta}>{cuenta}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
                </div>
              </div>

              {/* FILTRO CATEGORÍA - DINÁMICO */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-1.5">
                  <Tag className="h-4 w-4 text-yellow-400" />
                  Categoría
                </label>
                <div className="relative">
                  <select 
                    value={filtroCategoria}
                    onChange={(e) => setFiltroCategoria(e.target.value)}
                    className="w-full px-4 py-2.5 pl-10 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition appearance-none"
                  >
                    <option value="">Todas las categorías</option>
                    {categoriasDisponibles.map(categoria => (
                      <option key={categoria} value={categoria}>{categoria}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* RESUMEN MEJORADO */}
            <div className="mt-6 pt-5 border-t border-slate-800">
              <div className="space-y-4">
                <div className="flex justify-between items-center p-3 bg-slate-800/30 rounded-lg">
                  <div>
                    <div className="text-sm text-slate-400">Total filtrado</div>
                    <div className="text-xl font-bold text-emerald-400">€{total.toFixed(2)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-slate-400">Transacciones</div>
                    <div className="text-lg font-semibold text-slate-300">{ingresosFiltrados.length}</div>
                  </div>
                </div>
                
                {/* ESTADÍSTICAS RÁPIDAS MEJORADAS */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Categorías activas:</span>
                    <span className="text-slate-300">{Object.keys(estadisticasCategorias).length}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Ingreso promedio:</span>
                    <span className="text-emerald-300">
                      €{(ingresosFiltrados.length > 0 ? total / ingresosFiltrados.length : 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Ingreso por día:</span>
                    <span className="text-emerald-300">
                      €{analisisFrecuencia.ingresoPorDia.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Estabilidad:</span>
                    <span className={`${
                      analisisTiposIngresos.estabilidad === 'Alta' ? 'text-emerald-400' : 'text-amber-400'
                    }`}>
                      {analisisTiposIngresos.estabilidad}
                    </span>
                  </div>
                </div>
              </div>

              <button 
                onClick={() => {
                  setFiltroMes('');
                  setFiltroMetodo('');
                  setFiltroCuenta('');
                  setFiltroCategoria('');
                }}
                className="w-full mt-4 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium transition"
              >
                Limpiar filtros
              </button>
            </div>
          </div>

          {/* TARJETA DE ANÁLISIS RÁPIDO MEJORADA */}
          <div className="bg-slate-900/80 backdrop-blur-sm rounded-xl border border-slate-800 p-5">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-emerald-400" />
              Análisis rápido
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-emerald-900/20 rounded-lg border border-emerald-800/30">
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-emerald-400" />
                  <span className="text-sm text-slate-300">Fuente principal</span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-medium text-white">{categoriaPrincipal.nombre}</span>
                  <div className="text-xs text-emerald-400">
                    €{categoriaPrincipal.monto.toFixed(2)} ({categoriaPrincipal.porcentaje?.toFixed(1)}%)
                  </div>
                </div>
              </div>
              
              <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-green-400" />
                  <span className="text-sm text-slate-300">Cuenta más usada</span>
                </div>
                <span className="text-sm font-medium text-white">{cuentaMasUsada}</span>
              </div>
              
              <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-purple-400" />
                  <span className="text-sm text-slate-300">Método favorito</span>
                </div>
                <span className="text-sm font-medium text-white">{metodoMasComun}</span>
              </div>
              
              {/* ANÁLISIS FIJOS VS VARIABLES */}
              <div className="pt-3 border-t border-slate-800">
                <h4 className="text-xs font-medium text-slate-400 mb-2">Composición de ingresos</h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-300">Ingresos fijos</span>
                    <span className="text-emerald-400 font-medium">
                      €{analisisTiposIngresos.fijos.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-300">Ingresos variables</span>
                    <span className="text-amber-400 font-medium">
                      €{analisisTiposIngresos.variables.toFixed(2)}
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-2">
                    <div 
                      className="bg-gradient-to-r from-emerald-500 to-amber-500 h-2 rounded-full transition-all duration-500"
                      style={{ 
                        width: `${analisisTiposIngresos.porcentajeFijos}%` 
                      }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ALERTAS DE INGRESOS */}
          {alertasIngresos.length > 0 && (
            <div className="bg-amber-900/20 border border-amber-800/30 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                Alertas importantes
              </h3>
              <div className="space-y-2">
                {alertasIngresos.map((alerta, index) => (
                  <div key={index} className="text-xs text-amber-300 p-2 bg-amber-900/20 rounded-lg">
                    {alerta.mensaje}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* COLUMNA DERECHA - TABLA Y ANÁLISIS DETALLADO */}
        <div className="lg:w-2/3 xl:w-3/4">
          <div className="bg-slate-900/80 backdrop-blur-sm rounded-xl border border-slate-800 overflow-hidden">
            {/* HEADER DE TABLA MEJORADO */}
            <div className="px-6 py-4 border-b border-slate-800">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-white">Historial de ingresos</h2>
                  <p className="text-sm text-slate-400 mt-1">
                    Mostrando {ingresosFiltrados.length} de {ingresosMensuales.length} transacciones
                    {filtroMes && ` en ${formatearMesTexto(filtroMes)}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-900 px-3 py-1.5 rounded-lg">
                  <span>Desliza</span>
                  <span className="text-slate-400">→</span>
                  <span>para ver más columnas</span>
                </div>
              </div>
            </div>

            {/* TABLA MEJORADA CON TIPO DE INGRESO */}
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
                      Tipo
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Cuenta
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Monto
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Acciones
                    </th>
                  </tr>
                </thead>
                
                <tbody className="divide-y divide-slate-800">
                  {ingresosFiltrados.map((ingreso) => {
                    const tipo = estadisticasCategorias[ingreso.categoria]?.tipo || 'variable';
                    const colorTipo = tipo === 'fijo' ? 'text-emerald-400' : 'text-amber-400';
                    const bgTipo = tipo === 'fijo' ? 'bg-emerald-900/30' : 'bg-amber-900/30';
                    
                    return (
                      <tr key={ingreso.id} className="hover:bg-slate-800/50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                          {ingreso.fecha}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-white">{ingreso.concepto}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <CreditCard className="h-4 w-4 text-slate-500" />
                            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-slate-800 text-slate-300">
                              {ingreso.metodo}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <Tag className="h-4 w-4 text-slate-500" />
                            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-blue-900/30 text-blue-300">
                              {ingreso.categoria}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${bgTipo} ${colorTipo}`}>
                              {tipo === 'fijo' ? 'Fijo' : 'Variable'}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                          <div className="flex items-center gap-2">
                            <Database className="h-4 w-4 text-slate-500" />
                            {ingreso.cuenta}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <div className="inline-flex items-center gap-1 bg-emerald-900/20 px-3 py-1.5 rounded-lg">
                            <span className="text-sm font-semibold text-emerald-400">
                              €{ingreso.monto.toFixed(2)}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <div className="inline-flex items-center gap-1">
                            <button type="button" disabled={saving} onClick={() => editarIngreso(ingreso)} className="rounded-lg bg-slate-800 p-2 text-sky-300 hover:bg-slate-700 disabled:opacity-50" title="Editar ingreso"><Pencil className="h-4 w-4" /></button>
                            <button type="button" disabled={saving} onClick={() => eliminarIngreso(ingreso)} className="rounded-lg bg-rose-950/30 p-2 text-rose-300 hover:bg-rose-900/40 disabled:opacity-50" title="Anular ingreso"><Trash2 className="h-4 w-4" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* FOOTER DE TABLA */}
            <div className="px-6 py-3 border-t border-slate-800 bg-slate-900/50">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm">
                <div className="text-slate-400">
                  <span className="font-medium text-slate-300">{ingresosFiltrados.length}</span> transacciones • 
                  Total: <span className="font-medium text-emerald-400">€{total.toFixed(2)}</span>
                </div>
                <div className="text-slate-500 text-sm flex items-center gap-1">
                  <Bell className="h-3 w-3" />
                  <span>Actualizado recientemente</span>
                </div>
              </div>
            </div>
          </div>

          {/* PANELES DE ANÁLISIS MEJORADOS */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* SUGERENCIA DE CRECIMIENTO MEJORADA */}
            <div className="bg-blue-900/20 border border-blue-800/30 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb className="h-4 w-4 text-blue-400" />
                <h4 className="text-sm font-semibold text-blue-300">Sugerencia de crecimiento</h4>
              </div>
              {sugerenciaCrecimiento.categoria ? (
                <div>
                  <p className="text-sm text-slate-300 mb-2">
                    {sugerenciaCrecimiento.mensaje}
                  </p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-blue-400">
                      {sugerenciaCrecimiento.tipo === 'variable' ? 
                        <TrendingUp className="h-3 w-3" /> : 
                        <Zap className="h-3 w-3" />
                      }
                      <span>{sugerenciaCrecimiento.tipo === 'variable' ? 'Ingreso variable' : 'Diversificación'}</span>
                    </div>
                    <div className="text-xs text-slate-400">
                      {sugerenciaCrecimiento.porcentajeCrecimiento}% potencial
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-300">Agrega más ingresos para recibir sugerencias personalizadas.</p>
              )}
            </div>

            {/* PRÓXIMOS INGRESOS MEJORADOS */}
            <div className="bg-emerald-900/20 border border-emerald-800/30 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-emerald-400" />
                <h4 className="text-sm font-semibold text-emerald-300">Próximos ingresos estimados</h4>
              </div>
              {proximosIngresos.length > 0 ? (
                <div className="space-y-2">
                  {proximosIngresos.map((ingreso, index) => (
                    <div key={index} className="flex justify-between items-center">
                      <div>
                        <span className="text-sm text-slate-300">{ingreso.concepto}</span>
                        <div className="text-xs text-slate-500">{ingreso.categoria}</div>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-medium text-emerald-400">€{ingreso.montoEstimado.toFixed(2)}</span>
                        <div className="text-xs text-slate-500">
                          {ingreso.proximaFecha} • {ingreso.confianza}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-300">Analizando patrones de ingresos recurrentes...</p>
              )}
            </div>
          </div>

          {/* DISTRIBUCIÓN POR CATEGORÍAS */}
          <div className="mt-4 bg-slate-900/80 backdrop-blur-sm rounded-xl border border-slate-800 p-4">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <PieChart className="h-4 w-4 text-purple-400" />
              Distribución por categorías
            </h3>
            <div className="space-y-2">
              {Object.entries(estadisticasCategorias)
                .sort((a, b) => b[1].total - a[1].total)
                .map(([categoria, datos]) => {
                  const esFijo = datos.tipo === 'fijo';
                  const colorBarra = esFijo ? 'from-emerald-500 to-emerald-400' : 'from-amber-500 to-amber-400';
                  
                  return (
                    <div key={categoria} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-300">{categoria}</span>
                          {esFijo && (
                            <span className="text-xs text-emerald-500 bg-emerald-900/30 px-1.5 py-0.5 rounded">
                              Fijo
                            </span>
                          )}
                        </div>
                        <span className={`${esFijo ? 'text-emerald-400' : 'text-amber-400'}`}>
                          €{datos.total.toFixed(2)} ({datos.porcentaje.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-1.5">
                        <div 
                          className={`bg-gradient-to-r ${colorBarra} h-1.5 rounded-full transition-all duration-700`}
                          style={{ width: `${datos.porcentaje}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}