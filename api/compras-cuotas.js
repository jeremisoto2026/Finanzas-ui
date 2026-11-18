import { handleCors } from '../server/cors.js'
import { createAuthenticatedClient, findOrCreateCategory, sendApiError } from '../server/supabase.js'
import { frequencyToDb, installmentPlanForUi } from '../server/finance.js'
import { toCents } from '../src/lib/finance-core.js'

function validDateOnly(value) {
  const date = String(value || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const parsed = new Date(`${date}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
}

function normalizeInstallment(item, userId, planId, fallbackNumber) {
  const installmentNumber = Number(item.numero ?? item.installment_number ?? fallbackNumber)
  const amount = Number(item.monto ?? item.amount)
  const dueOn = item.fecha ?? item.due_on
  if (!Number.isInteger(installmentNumber) || installmentNumber < 1 || !Number.isFinite(amount) || amount <= 0 || !validDateOnly(dueOn)) {
    throw new Error('El historial contiene una cuota incompleta o con importe inválido.')
  }
  const paid = Boolean(item.pagada ?? item.status === 'paid')
  const paidOn = paid ? String(item.fechaPago ?? item.paid_on ?? '').slice(0, 10) : null
  if (paid && !validDateOnly(paidOn)) throw new Error('Cada cuota pagada debe incluir una fecha real de pago.')
  return {
    user_id: userId,
    plan_id: planId,
    installment_number: installmentNumber,
    amount,
    due_on: String(dueOn).slice(0, 10),
    paid_on: paidOn,
    status: paid ? 'paid' : 'scheduled',
    due_date_precision: item.fechaPrecision || 'day',
    notes: String(item.notas || '').trim() || null,
  }
}

async function readPlans(supabase, userId) {
  const { data: plans, error } = await supabase
    .from('installment_plans')
    .select('id, name, total_amount, installments_total, start_on, frequency, status, payment_method, notes, start_date_precision, categories(name)')
    .eq('user_id', userId)
    .neq('status', 'cancelled')
    .order('start_on', { ascending: true })
  if (error) throw error

  if (!plans?.length) return []
  const ids = plans.map((plan) => plan.id)
  const { data: items, error: itemsError } = await supabase
    .from('installments')
    .select('id, user_id, plan_id, installment_number, amount, due_on, paid_on, status, transaction_id, notes, due_date_precision')
    .eq('user_id', userId)
    .in('plan_id', ids)
    .order('installment_number', { ascending: true })
  if (itemsError) throw itemsError

  const grouped = new Map()
  for (const item of items || []) {
    if (!grouped.has(item.plan_id)) grouped.set(item.plan_id, [])
    grouped.get(item.plan_id).push(item)
  }
  return plans.map((plan) => installmentPlanForUi(plan, grouped.get(plan.id) || []))
}

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  res.setHeader('Cache-Control', 'no-store')
  try {
    const { supabase, user } = await createAuthenticatedClient(req)

    if (req.method === 'GET') {
      return res.status(200).json(await readPlans(supabase, user.id))
    }

    if (req.method === 'POST') {
      const body = req.body || {}
      if (body.action === 'pay_installment') {
        if (!body.installmentId || !body.planId) return res.status(400).json({ error: 'Falta el identificador del plan o de la cuota.' })
        if (!body.existingTransactionId && (!body.accountId || !validDateOnly(body.paidOn))) {
          return res.status(400).json({ error: 'Selecciona la cuenta y la fecha real del pago.' })
        }
        const { data: payment, error: paymentError } = await supabase.rpc('register_installment_payment', {
          p_installment_id: body.installmentId,
          p_account_id: body.accountId || null,
          p_paid_on: body.paidOn || null,
          p_existing_transaction_id: body.existingTransactionId || null,
        })
        if (paymentError) throw paymentError
        const plans = await readPlans(supabase, user.id)
        const plan = plans.find((item) => item.id === body.planId)
        if (!plan) return res.status(404).json({ error: 'La compra a cuotas no se encontró después de registrar el movimiento.' })
        return res.status(200).json({
          success: true,
          plan: plan || null,
          transactionId: payment?.transactionId || null,
          alreadyRecorded: Boolean(payment?.alreadyRecorded),
        })
      }
      const name = String(body.concepto || '').trim()
      const totalAmount = Number(body.montoTotal)
      const totalInstallments = Number(body.cuotasTotales)
      const startOn = body.fechaInicio
      if (!name || !Number.isFinite(totalAmount) || totalAmount <= 0 || !Number.isInteger(totalInstallments) || totalInstallments < 1 || !validDateOnly(startOn)) {
        return res.status(400).json({ error: 'Revisa concepto, importe, número de cuotas y fecha de inicio.' })
      }

      const history = Array.isArray(body.historialCuotas) ? body.historialCuotas : []
      if (history.length !== totalInstallments) {
        return res.status(400).json({ error: 'El número de cuotas del calendario debe coincidir con el total indicado.' })
      }
      const paidDatesValid = history.every((item) => {
        const paid = Boolean(item.pagada ?? item.status === 'paid')
        if (!paid) return true
        const paidOn = String(item.fechaPago ?? item.paid_on ?? '')
        if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) return false
        const parsedPaidOn = new Date(`${paidOn}T00:00:00.000Z`)
        return Number.isFinite(parsedPaidOn.getTime()) && parsedPaidOn.toISOString().slice(0, 10) === paidOn
      })
      if (!paidDatesValid) {
        return res.status(400).json({ error: 'Cada cuota marcada como pagada debe incluir una fecha real de pago.' })
      }
      const normalizedHistory = history.map((item, index) => ({
        number: Number(item.numero ?? item.installment_number ?? index + 1),
        amount: Number(item.monto ?? item.amount),
        dueOn: String(item.fecha ?? item.due_on ?? '').slice(0, 10),
      }))
      const sequenceValid = normalizedHistory.every((item, index) => (
        Number.isInteger(item.number) && item.number === index + 1
        && Number.isFinite(item.amount) && item.amount > 0
        && /^\d{4}-\d{2}-\d{2}$/.test(item.dueOn)
        && Number.isFinite(Date.parse(`${item.dueOn}T00:00:00.000Z`))
        && new Date(`${item.dueOn}T00:00:00.000Z`).toISOString().slice(0, 10) === item.dueOn
      ))
      if (!sequenceValid) {
        return res.status(400).json({ error: 'El calendario contiene cuotas inválidas, fechas incompletas o números repetidos.' })
      }
      const scheduledTotalCents = normalizedHistory.reduce((sum, item) => sum + toCents(item.amount), 0)
      if (scheduledTotalCents !== toCents(totalAmount)) {
        return res.status(400).json({ error: 'La suma de las cuotas no coincide con el importe total de la compra.' })
      }
      const frequency = frequencyToDb(body.frecuenciaPago)
      if (!['weekly', 'biweekly', 'monthly', 'quarterly'].includes(frequency)) {
        return res.status(400).json({ error: 'La frecuencia indicada no está admitida para planes de cuotas.' })
      }

      // Evita crear dos planes para la misma compra si se repite el envío,
      // incluso cuando el primer registro se haya cancelado posteriormente.
      // Para dos compras realmente distintas con los mismos datos, el concepto
      // debe diferenciarlas (por ejemplo, añadiendo una referencia).
      const normalizePlanName = (value) => String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLocaleLowerCase('es');

      const { data: matchingPlans, error: matchingPlansError } = await supabase
        .from('installment_plans')
        .select('id, name, status, created_at')
        .eq('user_id', user.id)
        .eq('total_amount', totalAmount)
        .eq('installments_total', totalInstallments)
        .eq('start_on', String(startOn).slice(0, 10))
        .eq('frequency', frequency)
        .order('created_at', { ascending: false })
        .limit(25);
      if (matchingPlansError) throw matchingPlansError;

      const duplicatePlan = (matchingPlans || []).find((item) => (
        normalizePlanName(item.name) === normalizePlanName(name)
      ));
      if (duplicatePlan) {
        return res.status(409).json({
          error: duplicatePlan.status === 'cancelled'
            ? 'Ya existe un registro anterior de esta misma compra, aunque esté cancelado. Comprueba ese historial antes de crear otro plan. Si es otra compra distinta, añade una referencia al concepto.'
            : 'Ya existe una compra con el mismo concepto, importe, número de cuotas y fecha de inicio. No se ha creado un duplicado.',
          duplicatePlanId: duplicatePlan.id,
          duplicatePlanStatus: duplicatePlan.status,
        });
      }

      const categoryId = await findOrCreateCategory(supabase, user.id, body.categoria, 'expense')
      const { data: plan, error: planError } = await supabase.from('installment_plans').insert({
        user_id: user.id,
        name,
        total_amount: totalAmount,
        installments_total: totalInstallments,
        start_on: String(startOn).slice(0, 10),
        frequency,
        status: 'active',
        category_id: categoryId,
        payment_method: body.metodo || null,
        notes: String(body.notas || '').trim() || null,
        start_date_precision: body.fechaInicioPrecision || 'day',
      }).select('id').single()
      if (planError) throw planError

      let insertedRows = []
      try {
        const history = Array.isArray(body.historialCuotas) ? body.historialCuotas : []
        const rows = history.map((item, index) => normalizeInstallment(item, user.id, plan.id, index + 1))
        if (rows.length) {
          const { data, error: itemsError } = await supabase.from('installments')
            .insert(rows)
            .select('id, user_id, plan_id, installment_number, amount, due_on, paid_on, status, transaction_id, notes, due_date_precision')
          if (itemsError) throw itemsError
          insertedRows = data || []
        }
      } catch (error) {
        await supabase.from('installment_plans').delete().eq('id', plan.id).eq('user_id', user.id)
        throw error
      }

      // Return the committed plan directly from the insert results. A second
      // full-list read here could fail after the writes committed, making the
      // UI show an error even though the purchase had actually been created.
      const created = installmentPlanForUi({
        id: plan.id,
        name,
        total_amount: totalAmount,
        installments_total: totalInstallments,
        start_on: String(startOn).slice(0, 10),
        frequency,
        status: 'active',
        payment_method: body.metodo || null,
        notes: String(body.notas || '').trim() || null,
        start_date_precision: body.fechaInicioPrecision || 'day',
        categories: { name: String(body.categoria || '').trim() },
      }, insertedRows)
      return res.status(201).json(created)
    }

    if (req.method === 'PATCH') {
      const body = req.body || {}
      if (!body.id) return res.status(400).json({ error: 'Falta el identificador del plan.' })

      const { data: currentPlan, error: readPlanError } = await supabase.from('installment_plans')
        .select('id, name, total_amount, installments_total, start_on, frequency, status, category_id, payment_method, notes, start_date_precision')
        .eq('id', body.id).eq('user_id', user.id).maybeSingle()
      if (readPlanError) throw readPlanError
      if (!currentPlan) return res.status(404).json({ error: 'No se encontró la compra a cuotas.' })

      const planPatch = {}
      if (body.activo !== undefined) planPatch.status = body.activo ? 'active' : 'paused'
      if (body.concepto !== undefined) {
        const name = String(body.concepto || '').trim()
        if (!name) return res.status(400).json({ error: 'El concepto no puede estar vacío.' })
        planPatch.name = name
      }
      if (body.montoTotal !== undefined) {
        const amount = Number(body.montoTotal)
        if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'El importe total debe ser mayor que cero.' })
        planPatch.total_amount = amount
      }
      if (body.cuotasTotales !== undefined) {
        const count = Number(body.cuotasTotales)
        if (!Number.isInteger(count) || count < 1) return res.status(400).json({ error: 'El número de cuotas no es válido.' })
        planPatch.installments_total = count
      }
      if (body.fechaInicio !== undefined) {
        if (!validDateOnly(body.fechaInicio)) return res.status(400).json({ error: 'La fecha de inicio no es válida.' })
        planPatch.start_on = body.fechaInicio
      }
      if (body.frecuenciaPago !== undefined) {
        const frequency = frequencyToDb(body.frecuenciaPago)
        if (!['weekly', 'biweekly', 'monthly', 'quarterly'].includes(frequency)) {
          return res.status(400).json({ error: 'La frecuencia indicada no está admitida para planes de cuotas.' })
        }
        planPatch.frequency = frequency
      }
      if (body.categoria !== undefined) planPatch.category_id = await findOrCreateCategory(supabase, user.id, body.categoria, 'expense')
      if (body.metodo !== undefined) planPatch.payment_method = String(body.metodo || '').trim() || null
      if (body.notas !== undefined) planPatch.notes = String(body.notas || '').trim() || null
      if (body.fechaInicioPrecision !== undefined) planPatch.start_date_precision = body.fechaInicioPrecision || 'day'

      let currentInstallments = []
      if (Array.isArray(body.historialCuotas)) {
        const { data, error } = await supabase.from('installments')
          .select('id, installment_number, amount, due_on, paid_on, status, transaction_id')
          .eq('user_id', user.id).eq('plan_id', body.id)
          .order('installment_number', { ascending: true })
        if (error) throw error
        currentInstallments = data || []

        const totalAmount = Number(planPatch.total_amount ?? currentPlan.total_amount)
        const totalInstallments = Number(planPatch.installments_total ?? currentPlan.installments_total)
        if (body.historialCuotas.length !== totalInstallments) {
          return res.status(400).json({ error: 'El calendario debe contener exactamente el número de cuotas indicado.' })
        }

        let rows
        try {
          rows = body.historialCuotas.map((item, index) => normalizeInstallment(item, user.id, body.id, index + 1))
        } catch (error) {
          return res.status(400).json({ error: error.message })
        }
        if (rows.some((row, index) => row.installment_number !== index + 1)) {
          return res.status(400).json({ error: 'El calendario debe numerar las cuotas de forma consecutiva.' })
        }
        const scheduledCents = rows.reduce((sum, row) => sum + toCents(row.amount), 0)
        if (scheduledCents !== toCents(totalAmount)) {
          return res.status(400).json({ error: 'La suma de las cuotas no coincide con el importe total de la compra.' })
        }

        const currentByNumber = new Map(currentInstallments.map((item) => [item.installment_number, item]))
        for (const row of rows) {
          const previous = currentByNumber.get(row.installment_number)
          if (!previous) continue
          const protectedRow = Boolean(previous.transaction_id) || previous.status === 'paid'
          if (protectedRow && (
            toCents(previous.amount) !== toCents(row.amount)
            || String(previous.due_on).slice(0, 10) !== row.due_on
            || previous.status !== row.status
            || String(previous.paid_on || '') !== String(row.paid_on || '')
          )) {
            return res.status(409).json({ error: `La cuota ${row.installment_number} ya está pagada o vinculada a un movimiento y no se puede alterar.` })
          }
        }
        const requestedNumbers = new Set(rows.map((row) => row.installment_number))
        const protectedRemoved = currentInstallments.find((item) => (
          !requestedNumbers.has(item.installment_number) && (item.status === 'paid' || item.transaction_id)
        ))
        if (protectedRemoved) {
          return res.status(409).json({ error: `No puedes eliminar la cuota ${protectedRemoved.installment_number} porque ya está pagada o vinculada a un movimiento.` })
        }

        for (const row of rows) {
          const previous = currentByNumber.get(row.installment_number)
          const result = previous
            ? await supabase.from('installments').update(row)
                .eq('id', previous.id).eq('user_id', user.id).eq('plan_id', body.id)
            : await supabase.from('installments').insert(row)
          if (result.error) throw result.error
        }

        const removeIds = currentInstallments
          .filter((item) => !requestedNumbers.has(item.installment_number))
          .map((item) => item.id)
        if (removeIds.length) {
          const { error } = await supabase.from('installments').delete()
            .eq('user_id', user.id).eq('plan_id', body.id).in('id', removeIds)
          if (error) throw error
        }
      }

      if (Object.keys(planPatch).length) {
        const { error } = await supabase.from('installment_plans')
          .update({ ...planPatch, updated_at: new Date().toISOString() })
          .eq('id', body.id).eq('user_id', user.id)
        if (error) throw error
      }

      const allPlans = await readPlans(supabase, user.id)
      return res.status(200).json(allPlans.find((item) => item.id === body.id) || { success: true, id: body.id })
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {}
      if (!id) return res.status(400).json({ error: 'Falta el identificador del plan.' })
      const { data, error } = await supabase.from('installment_plans')
        .update({ status: 'cancelled' }).eq('id', id).eq('user_id', user.id).select('id').maybeSingle()
      if (error) throw error
      if (!data) return res.status(404).json({ error: 'No se encontró el plan de cuotas.' })
      return res.status(200).json({ success: true, id })
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE')
    return res.status(405).json({ error: 'Método no permitido.' })
  } catch (error) {
    return sendApiError(res, error, 'No se pudo completar la operación de cuotas.')
  }
}
