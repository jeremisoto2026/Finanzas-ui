export const roundMoney = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100

export function dateOnly(value) {
  return value ? String(value).slice(0, 10) : null
}

export function frequencyToDb(value) {
  const map = {
    mensual: 'monthly', mensualidad: 'monthly',
    quincenal: 'biweekly', semanal: 'weekly',
    trimestral: 'quarterly', anual: 'yearly', annual: 'yearly',
    monthly: 'monthly', biweekly: 'biweekly', weekly: 'weekly',
    quarterly: 'quarterly', yearly: 'yearly', custom: 'custom',
  }
  return map[String(value || '').toLowerCase()] || 'monthly'
}

export function frequencyFromDb(value) {
  const map = {
    monthly: 'mensual', biweekly: 'quincenal', weekly: 'semanal',
    quarterly: 'trimestral', yearly: 'anual', custom: 'personalizado',
  }
  return map[value] || value || 'mensual'
}

export function transactionForUi(row) {
  return {
    id: row.id,
    concepto: row.description || '',
    monto: Number(row.amount || 0),
    fecha: dateOnly(row.occurred_on),
    categoria: row.categories?.name || '',
    metodo: row.payment_method || '',
    cuenta: row.accounts?.name || '',
    origen: 'normal',
  }
}

export function fixedPaymentForUi(row) {
  return {
    id: row.id,
    nombre: row.name,
    monto: Number(row.amount || 0),
    metodo: row.payment_method || '',
    categoria: row.categories?.name || '',
    frecuencia: frequencyFromDb(row.frequency),
    fechaInicio: dateOnly(row.next_due_on) || '',
    activo: row.status === 'active',
    notificacion: Boolean(row.notification_enabled),
  }
}

export function installmentPlanForUi(plan, installments = []) {
  const history = installments
    .slice()
    .sort((a, b) => a.installment_number - b.installment_number)
    .map((item) => ({
      numero: item.installment_number,
      monto: Number(item.amount || 0),
      pagada: item.status === 'paid',
      fecha: dateOnly(item.due_on),
      fechaPago: dateOnly(item.paid_on),
    }))

  return {
    id: plan.id,
    concepto: plan.name,
    montoTotal: Number(plan.total_amount || 0),
    cuotasTotales: Number(plan.installments_total || history.length),
    cuotasPagadas: history.filter((item) => item.pagada).length,
    montoPrimeraCuota: history[0]?.monto || 0,
    montoUltimaCuota: history[history.length - 1]?.monto || 0,
    tipoCuotas: history.length > 1 && history[0].monto !== history[history.length - 1].monto ? 'decrecientes' : 'fijas',
    fechaInicio: dateOnly(plan.start_on) || '',
    metodo: plan.payment_method || '',
    categoria: plan.categories?.name || '',
    frecuenciaPago: frequencyFromDb(plan.frequency),
    activo: plan.status === 'active',
    historialCuotas: history,
  }
}
