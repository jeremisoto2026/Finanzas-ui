import { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { monthKeyFromDate, sumMoney, sumMoneyBy } from '@/lib/finance-core';

const GastosContext = createContext();

export function GastosProvider({ children }) {
  // Movimientos de gasto contabilizados del libro financiero.
  const [gastosMensuales, setGastosMensuales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

      } catch (err) {
        setError(err.message);
        console.error('Error fetching datos:', err);
        setGastosMensuales([]);
      } finally {
        setLoading(false);
      }
    };

    fetchTodosLosDatos();
  }, []);

  // No se generan gastos sintéticos desde compromisos o cuotas.
  // Solo los movimientos contabilizados del libro pueden afectar al histórico real.
  const transformarPagosFijosAGastos = []
  const transformarCuotasAGastos = []

  // 3. Meses disponibles únicamente a partir de movimientos reales contabilizados.
  const obtenerMesesDisponibles = useMemo(() => {
    const months = new Set();
    gastosMensuales.forEach((gasto) => {
      const value = String(gasto.fecha || '').slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(value)) months.add(value);
    });
    return Array.from(months).sort((a, b) => b.localeCompare(a));
  }, [gastosMensuales]);

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

  // 1. Total de gastos filtrados
  const totalGastosFiltrados = useMemo(() => {
    return sumMoney(gastosFiltrados, (gasto) => gasto.monto || 0);
  }, [gastosFiltrados]);

  // 2. Gastos por categoría (para ResumenGastos)
  const gastosPorCategoria = useMemo(() => {
    return sumMoneyBy(gastosFiltrados, (gasto) => gasto.categoria || 'Otros', (gasto) => gasto.monto || 0);
  }, [gastosFiltrados]);

  // 3. Estadísticas por tipo de gasto
  const estadisticasPorTipo = useMemo(() => ({
    normal: {
      total: sumMoney(gastosFiltrados, (gasto) => gasto.monto || 0),
      count: gastosFiltrados.length,
      label: 'Gastos registrados',
    },
    pago_fijo: { total: 0, count: 0, label: 'Pagos fijos (no incluidos)' },
    cuota: { total: 0, count: 0, label: 'Cuotas (no incluidas)' },
  }), [gastosFiltrados]);

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
      return monthKeyFromDate(gasto.fecha) === getMesActual;
    });
  }, [todosLosGastos, getMesActual]);

  // 3. Total del mes actual
  const totalMesActual = useMemo(() => {
    return sumMoney(gastosMesActual, (gasto) => gasto.monto || 0);
  }, [gastosMesActual]);

  // 4. Gastos por categoría del mes actual
  const gastosPorCategoriaMesActual = useMemo(() => {
    return sumMoneyBy(gastosMesActual, (gasto) => gasto.categoria || 'Otros', (gasto) => gasto.monto || 0);
  }, [gastosMesActual]);

  // 5. Estadísticas por tipo para el mes actual
  const estadisticasPorTipoMesActual = useMemo(() => ({
    normal: {
      total: sumMoney(gastosMesActual, (gasto) => gasto.monto || 0),
      count: gastosMesActual.length,
      label: 'Gastos registrados',
    },
    pago_fijo: { total: 0, count: 0, label: 'Pagos fijos (no incluidos)' },
    cuota: { total: 0, count: 0, label: 'Cuotas (no incluidas)' },
  }), [gastosMesActual]);

  // Valor del contexto
  const value = {
    // Estados
    gastosMensuales,
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
        return monthKeyFromDate(gasto.fecha) === mesFormato;
      });
      
      const totalDelMes = sumMoney(gastosDelMes, (gasto) => gasto.monto || 0);
      const porCategoriaDelMes = sumMoneyBy(
        gastosDelMes,
        (gasto) => gasto.categoria || 'Otros',
        (gasto) => gasto.monto || 0
      );
      
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