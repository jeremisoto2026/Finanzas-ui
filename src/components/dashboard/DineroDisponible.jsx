import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Wallet, TrendingUp, PieChart, RefreshCw, AlertCircle, Receipt, Repeat, Calculator } from 'lucide-react'

export default function DineroDisponible() {
  // Estados para los datos
  const [ingresoMensual, setIngresoMensual] = useState(0);
  const [gastosNormales, setGastosNormales] = useState(0);
  const [gastosFijos, setGastosFijos] = useState(0);
  const [gastosCuotas, setGastosCuotas] = useState(0);
  const [totalGastos, setTotalGastos] = useState(0);
  const [disponible, setDisponible] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mesFiltro, setMesFiltro] = useState('');

  // ========== OBTENER MES ACTUAL ==========
  const obtenerMesActual = () => {
    const ahora = new Date();
    return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`;
  };

  // ========== FORMATEAR MES A TEXTO ==========
  const formatearMesTexto = (mesFormato) => {
    if (!mesFormato) return '';
    const [año, mes] = mesFormato.split('-');
    const fecha = new Date(año, parseInt(mes) - 1);
    return fecha.toLocaleDateString('es-ES', { 
      month: 'long', 
      year: 'numeric' 
    });
  };

  // ========== CARGAR TODOS LOS DATOS ==========
  useEffect(() => {
    let cancelled = false;
    const fetchDatosFinancieros = async () => {
      try {
        setLoading(true);
        setError(null);
        const mesActual = obtenerMesActual();
        setMesFiltro(mesActual);
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        const responses = await Promise.all([
          fetch('/api/ingresos'), fetch('/api/gastos'),
          fetch('/api/pagos-fijos'), fetch('/api/compras-cuotas')
        ]);
        const names = ['ingresos', 'gastos', 'pagos fijos', 'cuotas'];
        responses.forEach((r, i) => { if (!r.ok) throw new Error(`No se pudieron cargar ${names[i]}.`); });
        const [ingresosData, gastosData, pagosFijosData, comprasCuotasData] = await Promise.all(responses.map(r => r.json()));
        const inMonth = (value) => {
          if (!value) return false;
          const date = new Date(`${String(value).slice(0,10)}T00:00:00`);
          return !Number.isNaN(date.getTime()) && `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}` === mesActual;
        };
        const cents = (items, getAmount) => items.reduce(
          (sum, item) => sum + Math.round(((Number(getAmount(item)) || 0) + Number.EPSILON) * 100), 0
        );
        const incomes = cents(ingresosData.filter(x => inMonth(x.fecha)), x => x.monto) / 100;
        const normalExpenses = cents(gastosData.filter(x => inMonth(x.fecha)), x => x.monto) / 100;
        // Active fixed payments are forecast commitments, not posted bank movements.
        const activeFixed = pagosFijosData.filter(x => x.activo !== false);
        const fixedForecast = cents(activeFixed, x => x.monto) / 100;
        const paidInstallments = [];
        comprasCuotasData.filter(x => x.activo !== false).forEach(plan => {
          if (!Array.isArray(plan.historialCuotas)) return;
          plan.historialCuotas.forEach(item => {
            if (!item.pagada || !inMonth(item.fecha)) return;
            const date = new Date(`${String(item.fecha).slice(0,10)}T00:00:00`);
            if (date <= hoy) paidInstallments.push(item);
          });
        });
        const installments = cents(paidInstallments, x => x.monto) / 100;
        const expenses = Math.round((normalExpenses + fixedForecast + installments + Number.EPSILON) * 100) / 100;
        const availableAmount = Math.round((incomes - expenses + Number.EPSILON) * 100) / 100;
        if (cancelled) return;
        setIngresoMensual(incomes);
        setGastosNormales(normalExpenses);
        setGastosFijos(fixedForecast);
        setGastosCuotas(installments);
        setTotalGastos(expenses);
        setDisponible(availableAmount);
      } catch (err) {
        console.error('Error cargando datos financieros:', err);
        if (cancelled) return;
        setError(err.message || 'No se pudieron cargar los datos financieros.');
        setIngresoMensual(0);
        setGastosNormales(0);
        setGastosFijos(0);
        setGastosCuotas(0);
        setTotalGastos(0);
        setDisponible(0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchDatosFinancieros();
    const interval = setInterval(fetchDatosFinancieros, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // ========== CÁLCULOS DERIVADOS ==========
  const porcentajeDisponible = ingresoMensual > 0 ? (disponible / ingresoMensual) * 100 : 0;
  const porcentajeGastos = ingresoMensual > 0 ? (totalGastos / ingresoMensual) * 100 : 0;
  const porcentajeGastosNormales = totalGastos > 0 ? (gastosNormales / totalGastos) * 100 : 0;
  const porcentajeGastosFijos = totalGastos > 0 ? (gastosFijos / totalGastos) * 100 : 0;
  const porcentajeGastosCuotas = totalGastos > 0 ? (gastosCuotas / totalGastos) * 100 : 0;

  // ========== ESTADOS DE CARGA Y ERROR ==========
  if (loading) {
    return (
      <Card className="bg-gradient-to-br from-emerald-900/40 to-slate-900/40 border border-emerald-800/30 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-white flex items-center gap-2">
            <div className="p-2 bg-emerald-900/30 rounded-lg">
              <Wallet className="h-5 w-5 text-emerald-400" />
            </div>
            Dinero Disponible
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-10">
          <div className="text-center">
            <RefreshCw className="h-8 w-8 text-emerald-400 animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-400">Calculando...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-gradient-to-br from-emerald-900/40 to-slate-900/40 border border-emerald-800/30 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-white flex items-center gap-2">
            <div className="p-2 bg-emerald-900/30 rounded-lg">
              <AlertCircle className="h-5 w-5 text-emerald-400" />
            </div>
            Dinero Disponible
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-6">
          <p className="text-sm text-amber-400 mb-2">Error cargando datos</p>
          <button
            onClick={() => window.location.reload()}
            className="text-xs bg-emerald-700 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-md transition"
          >
            Reintentar
          </button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-gradient-to-br from-emerald-900/40 to-slate-900/40 border border-emerald-800/30 backdrop-blur-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-white flex items-center gap-2">
            <div className="p-2 bg-emerald-900/30 rounded-lg">
              <Wallet className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <div>Disponible estimado</div>
              <div className="text-xs text-emerald-300 font-normal">
                {mesFiltro ? formatearMesTexto(mesFiltro) : 'Mes actual'}
              </div>
            </div>
          </CardTitle>
          <div className={`text-xs px-2 py-1 rounded-lg ${
            porcentajeDisponible > 30 ? 'bg-emerald-900/30 text-emerald-300' :
            porcentajeDisponible > 10 ? 'bg-amber-900/30 text-amber-300' :
            'bg-red-900/30 text-red-300'
          }`}>
            {porcentajeDisponible.toFixed(0)}% libre
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* MONTO PRINCIPAL */}
        <div className="text-center">
          <p className="text-4xl font-bold text-white mb-2">
            €{disponible.toFixed(2)}
          </p>
          <p className="text-sm text-emerald-300">
            Estimación tras gastos y compromisos del mes
          </p>
        </div>

        {/* BARRA DE PROGRESO */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-slate-300">Distribución mensual</span>
            <span className="font-medium text-slate-300">
              €{disponible.toFixed(0)} disponible
            </span>
          </div>
          <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden flex">
            <div 
              className="h-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${Math.min(Math.max(porcentajeDisponible, 0), 100)}%` }}
              title={`${porcentajeDisponible.toFixed(1)}% disponible`}
            ></div>
            <div 
              className="h-full bg-slate-600 transition-all duration-500"
              style={{ width: `${Math.min(Math.max(porcentajeGastos, 0), 100)}%` }}
              title={`${porcentajeGastos.toFixed(1)}% gastos totales`}
            ></div>
          </div>
        </div>

        {/* DESGLOSE DETALLADO */}
        <div className="space-y-3">
          {/* INGRESO MENSUAL */}
          <div className="flex items-center justify-between p-3 bg-emerald-900/20 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-900/30 rounded-lg">
                <TrendingUp className="h-4 w-4 text-emerald-400" />
              </div>
              <div>
                <span className="text-sm text-slate-300">Ingresos totales</span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-lg font-bold text-emerald-400">
                €{ingresoMensual.toFixed(2)}
              </span>
            </div>
          </div>

          {/* GASTOS TOTALES - CON DESGLOSE */}
          <div className="space-y-2">
            {/* GASTOS NORMALES */}
            <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-800 rounded-lg">
                  <Receipt className="h-4 w-4 text-slate-400" />
                </div>
                <div>
                  <span className="text-sm text-slate-300">Gastos normales</span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-lg font-bold text-slate-300">
                  €{gastosNormales.toFixed(2)}
                </span>
                {totalGastos > 0 && (
                  <div className="text-xs text-slate-500">
                    {porcentajeGastosNormales.toFixed(0)}% del total gastos
                  </div>
                )}
              </div>
            </div>

            {/* GASTOS FIJOS */}
            <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-800 rounded-lg">
                  <Repeat className="h-4 w-4 text-amber-400" />
                </div>
                <div>
                  <span className="text-sm text-slate-300">Pagos fijos previstos</span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-lg font-bold text-slate-300">
                  €{gastosFijos.toFixed(2)}
                </span>
                {totalGastos > 0 && (
                  <div className="text-xs text-slate-500">
                    {porcentajeGastosFijos.toFixed(0)}% del total gastos
                  </div>
                )}
              </div>
            </div>

            {/* GASTOS DE CUOTAS */}
            {gastosCuotas > 0 && (
              <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-slate-800 rounded-lg">
                    <Calculator className="h-4 w-4 text-purple-400" />
                  </div>
                  <div>
                    <span className="text-sm text-slate-300">Cuotas pagadas</span>
                    <p className="text-xs text-slate-500">Compras financiadas</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-lg font-bold text-purple-400">
                    €{gastosCuotas.toFixed(2)}
                  </span>
                  {totalGastos > 0 && (
                    <div className="text-xs text-slate-500">
                      {porcentajeGastosCuotas.toFixed(0)}% del total gastos
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TOTAL GASTOS */}
            <div className="flex items-center justify-between p-3 bg-red-900/20 rounded-lg border border-red-800/30">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-900/30 rounded-lg">
                  <PieChart className="h-4 w-4 text-red-400" />
                </div>
                <div>
                  <span className="text-sm text-slate-300">Gastos y compromisos</span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-lg font-bold text-red-400">
                  €{totalGastos.toFixed(2)}
                </span>
                {ingresoMensual > 0 && (
                  <div className="text-xs text-slate-500">
                    {porcentajeGastos.toFixed(0)}% del ingreso
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* INDICADORES FINANCIEROS */}
        <div className="pt-2 border-t border-slate-800/50">
          <div className="grid grid-cols-2 gap-2 text-xs mb-3">
            <div className="p-2 bg-slate-800/30 rounded">
              <div className="text-slate-500">Salud financiera</div>
              <div className={
                porcentajeDisponible > 30 ? 'text-emerald-400' : 
                porcentajeDisponible > 10 ? 'text-amber-400' : 
                'text-red-400'
              }>
                {porcentajeDisponible > 30 ? 'Excelente' : 
                 porcentajeDisponible > 10 ? 'Aceptable' : 
                 'Crítica'}
              </div>
            </div>
            
            <div className="p-2 bg-slate-800/30 rounded">
              <div className="text-slate-500">Relación D/G</div>
              <div className="text-slate-300">
                {totalGastos > 0 ? (disponible/totalGastos).toFixed(1) : '∞'}:1
              </div>
            </div>
          </div>

          {/* ALERTAS INTELIGENTES */}
          {disponible < 0 ? (
            <div className="mt-3 p-2 bg-red-900/20 border border-red-800/30 rounded text-center">
              <p className="text-xs text-red-400">
                ⚠️ ¡Atención! Los gastos superan tus ingresos en €{Math.abs(disponible).toFixed(2)}
              </p>
            </div>
          ) : disponible < ingresoMensual * 0.2 && disponible > 0 ? (
            <div className="mt-3 p-2 bg-amber-900/20 border border-amber-800/30 rounded text-center">
              <p className="text-xs text-amber-400">
                💡 Solo el {porcentajeDisponible.toFixed(0)}% disponible
              </p>
            </div>
          ) : porcentajeDisponible > 50 ? (
            <div className="mt-3 p-2 bg-emerald-900/20 border border-emerald-800/30 rounded text-center">
              <p className="text-xs text-emerald-400">
                ✅ Excelente! Tienes {porcentajeDisponible.toFixed(0)}% disponible para ahorrar
              </p>
            </div>
          ) : null}
          
          {/* RESUMEN RÁPIDO */}
          <div className="mt-3 text-xs text-slate-600 text-center">
            <span>
              {gastosNormales > 0 && gastosFijos > 0 && gastosCuotas > 0 
                ? `${gastosNormales.toFixed(0)}€ normales + ${gastosFijos.toFixed(0)}€ fijos + ${gastosCuotas.toFixed(0)}€ cuotas` 
                : gastosNormales > 0 && gastosFijos > 0
                ? `${gastosNormales.toFixed(0)}€ normales + ${gastosFijos.toFixed(0)}€ fijos`
                : gastosNormales > 0 && gastosCuotas > 0
                ? `${gastosNormales.toFixed(0)}€ normales + ${gastosCuotas.toFixed(0)}€ cuotas`
                : 'Sin gastos registrados este mes'
              }
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}