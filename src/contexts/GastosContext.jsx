import { createContext, useContext, useState, useEffect, useMemo } from 'react';

const GastosContext = createContext();

export function GastosProvider({ children }) {
  // Estados para los datos de Notion (igual que en TablaGastos.jsx)
  const [gastosMensuales, setGastosMensuales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Estados para pagos fijos y cuotas
  const [pagosFijos, setPagosFijos] = useState([]);
  const [comprasCuotas, setComprasCuotas] = useState([]);

  // Estados de filtros
  const [filtroMes, setFiltroMes] = useState('');
  const [filtroMetodo, setFiltroMetodo] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');

  // ========== CARGAR TODOS LOS DATOS ==========
  useEffect(() => {
    const fetchTodosLosDatos = async () => {
      try {
        setLoading(true);
        
        // 1. Cargar gastos normales
        const resGastos = await fetch('/api/gastos');
        if (!resGastos.ok) throw new Error('Error cargando gastos');
        const gastosData = await resGastos.json();
        setGastosMensuales(gastosData);

        // 2. Cargar pagos fijos
        const resPagos = await fetch('/api/pagos-fijos');
        if (resPagos.ok) {
          const pagosData = await resPagos.json();
          setPagosFijos(pagosData.filter(p => p.activo === true));
        }

        // 3. Cargar compras a cuotas
        const resCuotas = await fetch('/api/compras-cuotas');
        if (resCuotas.ok) {
          const cuotasData = await resCuotas.json();
          setComprasCuotas(cuotasData.filter(c => c.activo === true));
        }

      } catch (err) {
        setError(err.message);
        console.error('Error fetching datos:', err);
        setGastosMensuales([]);
        setPagosFijos([]);
        setComprasCuotas([]);
      } finally {
        setLoading(false);
      }
    };

    fetchTodosLosDatos();
  }, []);

  // ========== FUNCIONES DE TRANSFORMACIÓN - SOLO HISTÓRICOS ==========

  // 1. Transformar pagos fijos YA EFECTUADOS en gastos
  const transformarPagosFijosAGastos = useMemo(() => {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0); // Normalizar a inicio del día
    
    return pagosFijos.map(pago => {
      // Usar fechaRealPago si existe, sino fechaInicio
      const fechaPagoStr = pago.fechaRealPago || pago.fechaInicio;
      if (!fechaPagoStr) return null;
      
      const fechaPago = new Date(fechaPagoStr);
      fechaPago.setHours(0, 0, 0, 0);
      
      // SOLO incluir si la fecha de pago es HOY o PASADA
      if (fechaPago > hoy) {
        return null; // Pago futuro, no mostrar
      }
      
      const fechaStr = fechaPagoStr;
      const mesGasto = `${fechaPago.getFullYear()}-${String(fechaPago.getMonth() + 1).padStart(2, '0')}`;
      
      return {
        id: `pago-fijo-${pago.id}`,
        fecha: fechaStr,
        concepto: `${pago.nombre} (Pago Fijo)`,
        metodo: pago.metodo,
        categoria: pago.categoria,
        cuenta: 'Cuenta Principal',
        monto: parseFloat(pago.monto),
        origen: 'pago_fijo',
        frecuencia: pago.frecuencia,
        esHistorico: true
      };
    }).filter(Boolean);
  }, [pagosFijos]);

  // 2. Transformar CUOTAS YA PAGADAS en gastos
  const transformarCuotasAGastos = useMemo(() => {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    
    const gastosCuotas = [];
    
    comprasCuotas.forEach(compra => {
      // Verificar que tenga historial de cuotas
      if (!compra.historialCuotas || compra.historialCuotas.length === 0) {
        return;
      }
      
      // Filtrar SOLO cuotas PAGADAS con fecha HOY o PASADA
      compra.historialCuotas.forEach(cuota => {
        if (!cuota.pagada) return; // Solo cuotas pagadas
        if (!cuota.fecha) return; // Necesita fecha
        
        const fechaCuota = new Date(cuota.fecha);
        fechaCuota.setHours(0, 0, 0, 0);
        
        // Solo incluir si la fecha es hoy o pasada
        if (fechaCuota <= hoy) {
          const cuotasPagadas = compra.cuotasPagadas || compra.historialCuotas.filter(c => c.pagada).length;
          
          gastosCuotas.push({
            id: `cuota-${compra.id}-${cuota.numero}`,
            fecha: cuota.fecha,
            concepto: `${compra.concepto}`,
            metodo: compra.metodo,
            categoria: compra.categoria,
            cuenta: 'Financiación',
            monto: parseFloat(cuota.monto.toFixed(2)),
            origen: 'cuota',
            cuotaNumero: cuota.numero,
            totalCuotas: compra.cuotasTotales,
            cuotasPagadas: cuotasPagadas,
            infoCuota: `Cuota ${cuota.numero} de ${compra.cuotasTotales}`,
            infoProgreso: `${cuotasPagadas}/${compra.cuotasTotales} pagadas`,
            esHistorico: true
          });
        }
      });
    });
    
    return gastosCuotas;
  }, [comprasCuotas]);

  // 3. Obtener meses únicos de TODOS los datos HISTÓRICOS
  const obtenerMesesDisponibles = useMemo(() => {
    const mesesSet = new Set();
    
    // Agregar meses de gastos normales
    gastosMensuales.forEach(gasto => {
      if (gasto.fecha) {
        try {
          const fecha = new Date(gasto.fecha);
          if (!isNaN(fecha.getTime())) {
            const año = fecha.getFullYear();
            const mes = fecha.getMonth() + 1;
            const mesFormateado = `${año}-${mes.toString().padStart(2, '0')}`;
            mesesSet.add(mesFormateado);
          }
        } catch (error) {
          console.error('Error procesando fecha:', gasto.fecha, error);
        }
      }
    });
    
    // Agregar meses de pagos fijos históricos
    transformarPagosFijosAGastos.forEach(gasto => {
      if (gasto.fecha) {
        try {
          const fecha = new Date(gasto.fecha);
          const año = fecha.getFullYear();
          const mes = fecha.getMonth() + 1;
          const mesFormateado = `${año}-${mes.toString().padStart(2, '0')}`;
          mesesSet.add(mesFormateado);
        } catch (error) {
          console.error('Error procesando fecha pago fijo:', gasto.fecha, error);
        }
      }
    });
    
    // Agregar meses de cuotas históricas
    transformarCuotasAGastos.forEach(gasto => {
      if (gasto.fecha) {
        try {
          const fecha = new Date(gasto.fecha);
          const año = fecha.getFullYear();
          const mes = fecha.getMonth() + 1;
          const mesFormateado = `${año}-${mes.toString().padStart(2, '0')}`;
          mesesSet.add(mesFormateado);
        } catch (error) {
          console.error('Error procesando fecha cuota:', gasto.fecha, error);
        }
      }
    });
    
    const mesesArray = Array.from(mesesSet);
    return mesesArray.sort((a, b) => b.localeCompare(a));
  }, [gastosMensuales, transformarPagosFijosAGastos, transformarCuotasAGastos]);

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
  const todosLosGastos = useMemo(() => {
    return [
      ...gastosMensuales.map(g => ({ ...g, origen: 'normal' })),
      ...transformarPagosFijosAGastos,
      ...transformarCuotasAGastos
    ];
  }, [gastosMensuales, transformarPagosFijosAGastos, transformarCuotasAGastos]);

  // Filtrar gastos combinados
  const gastosFiltrados = useMemo(() => {
    return todosLosGastos.filter(gasto => {
      if (!gasto.fecha) return false;
      
      const fechaGasto = new Date(gasto.fecha);
      if (isNaN(fechaGasto.getTime())) return false;
      
      const mesGasto = `${fechaGasto.getFullYear()}-${String(fechaGasto.getMonth() + 1).padStart(2, '0')}`;
      
      const cumpleMes = !filtroMes || mesGasto === filtroMes;
      const cumpleMetodo = !filtroMetodo || gasto.metodo === filtroMetodo;
      const cumpleCategoria = !filtroCategoria || gasto.categoria === filtroCategoria;
      
      return cumpleMes && cumpleMetodo && cumpleCategoria;
    });
  }, [todosLosGastos, filtroMes, filtroMetodo, filtroCategoria]);

  // ========== CÁLCULOS ==========

  // 1. Total de gastos filtrados
  const totalGastosFiltrados = useMemo(() => {
    return gastosFiltrados.reduce((sum, gasto) => sum + (gasto.monto || 0), 0);
  }, [gastosFiltrados]);

  // 2. Gastos por categoría (para ResumenGastos)
  const gastosPorCategoria = useMemo(() => {
    const categorias = {};
    gastosFiltrados.forEach(gasto => {
      const cat = gasto.categoria || 'Otros';
      categorias[cat] = (categorias[cat] || 0) + (gasto.monto || 0);
    });
    return categorias;
  }, [gastosFiltrados]);

  // 3. Estadísticas por tipo de gasto
  const estadisticasPorTipo = useMemo(() => {
    const stats = {
      normal: { total: 0, count: 0, label: 'Gastos Normales' },
      pago_fijo: { total: 0, count: 0, label: 'Pagos Fijos' },
      cuota: { total: 0, count: 0, label: 'Cuotas Pagadas' }
    };
    
    gastosFiltrados.forEach(gasto => {
      const tipo = gasto.origen || 'normal';
      if (stats[tipo]) {
        stats[tipo].total += gasto.monto || 0;
        stats[tipo].count += 1;
      } else {
        stats.normal.total += gasto.monto || 0;
        stats.normal.count += 1;
      }
    });
    
    return stats;
  }, [gastosFiltrados]);

  // ========== DATOS DEL MES ACTUAL ==========

  // 1. Obtener el mes actual en formato YYYY-MM
  const getMesActual = useMemo(() => {
    const ahora = new Date();
    const año = ahora.getFullYear();
    const mes = ahora.getMonth() + 1;
    return `${año}-${mes.toString().padStart(2, '0')}`;
  }, []);

  // 2. Gastos del mes actual (sin filtros adicionales)
  const gastosMesActual = useMemo(() => {
    return todosLosGastos.filter(gasto => {
      if (!gasto.fecha) return false;
      const fechaGasto = new Date(gasto.fecha);
      const mesGasto = `${fechaGasto.getFullYear()}-${String(fechaGasto.getMonth() + 1).padStart(2, '0')}`;
      return mesGasto === getMesActual;
    });
  }, [todosLosGastos, getMesActual]);

  // 3. Total del mes actual
  const totalMesActual = useMemo(() => {
    return gastosMesActual.reduce((sum, gasto) => sum + (gasto.monto || 0), 0);
  }, [gastosMesActual]);

  // 4. Gastos por categoría del mes actual
  const gastosPorCategoriaMesActual = useMemo(() => {
    const categorias = {};
    gastosMesActual.forEach(gasto => {
      const cat = gasto.categoria || 'Otros';
      categorias[cat] = (categorias[cat] || 0) + (gasto.monto || 0);
    });
    return categorias;
  }, [gastosMesActual]);

  // 5. Estadísticas por tipo para el mes actual
  const estadisticasPorTipoMesActual = useMemo(() => {
    const stats = {
      normal: { total: 0, count: 0, label: 'Gastos Normales' },
      pago_fijo: { total: 0, count: 0, label: 'Pagos Fijos' },
      cuota: { total: 0, count: 0, label: 'Cuotas Pagadas' }
    };
    
    gastosMesActual.forEach(gasto => {
      const tipo = gasto.origen || 'normal';
      if (stats[tipo]) {
        stats[tipo].total += gasto.monto || 0;
        stats[tipo].count += 1;
      } else {
        stats.normal.total += gasto.monto || 0;
        stats.normal.count += 1;
      }
    });
    
    return stats;
  }, [gastosMesActual]);

  // Valor del contexto
  const value = {
    // Estados
    gastosMensuales,
    pagosFijos,
    comprasCuotas,
    loading,
    error,
    filtroMes,
    filtroMetodo,
    filtroCategoria,
    
    // Setters
    setFiltroMes,
    setFiltroMetodo,
    setFiltroCategoria,
    
    // Datos transformados
    transformarPagosFijosAGastos,
    transformarCuotasAGastos,
    
    // Funciones
    obtenerMesesDisponibles,
    formatearMesTexto,
    
    // Datos combinados y filtrados
    todosLosGastos,
    gastosFiltrados,
    
    // Cálculos
    totalGastosFiltrados,
    gastosPorCategoria,
    estadisticasPorTipo,
    
    // ========== NUEVOS DATOS DEL MES ACTUAL ==========
    // Mes actual
    mesActual: getMesActual,
    
    // Datos del mes actual
    gastosMesActual,
    totalMesActual,
    gastosPorCategoriaMesActual,
    estadisticasPorTipoMesActual,
    
    // ========== FUNCIONES ÚTILES ==========
    // Función para formatear el mes actual
    formatearMesActual: () => formatearMesTexto(getMesActual),
    
    // Función para obtener datos de un mes específico
    getDatosPorMes: (mesFormato) => {
      if (!mesFormato) return { gastos: [], total: 0, porCategoria: {} };
      
      const gastosDelMes = todosLosGastos.filter(gasto => {
        if (!gasto.fecha) return false;
        const fechaGasto = new Date(gasto.fecha);
        const mesGasto = `${fechaGasto.getFullYear()}-${String(fechaGasto.getMonth() + 1).padStart(2, '0')}`;
        return mesGasto === mesFormato;
      });
      
      const totalDelMes = gastosDelMes.reduce((sum, gasto) => sum + (gasto.monto || 0), 0);
      
      const porCategoriaDelMes = {};
      gastosDelMes.forEach(gasto => {
        const cat = gasto.categoria || 'Otros';
        porCategoriaDelMes[cat] = (porCategoriaDelMes[cat] || 0) + (gasto.monto || 0);
      });
      
      return {
        gastos: gastosDelMes,
        total: totalDelMes,
        porCategoria: porCategoriaDelMes,
        count: gastosDelMes.length
      };
    }
  };

  return (
    <GastosContext.Provider value={value}>
      {children}
    </GastosContext.Provider>
  );
}

export const useGastos = () => {
  const context = useContext(GastosContext);
  if (!context) {
    throw new Error('useGastos debe ser usado dentro de un GastosProvider');
  }
  return context;
};