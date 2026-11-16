import { createAuthenticatedClient, findOrCreateCategory, sendApiError } from '../server/supabase.js'
import { frequencyToDb, installmentPlanForUi } from '../server/finance.js'

function normalizeInstallment(item, userId, planId, fallbackNumber) {
  const installmentNumber = Number(item.numero ?? item.installment_number ?? fallbackNumber)
  const amount = Number(item.monto ?? item.amount)
  const dueOn = item.fecha ?? item.due_on
  if (!Number.isInteger(installmentNumber) || installmentNumber < 1 || !Number.isFinite(amount) || amount <= 0 || !dueOn) {
    throw new Error('El historial contiene una cuota incompleta o con importe inválido.')
  }
  const paid = Boolean(item.pagada ?? item.status === 'paid')
  return {
    user_id: userId,
    plan_id: planId,
    installment_number: installmentNumber,
    amount,
    due_on: String(dueOn).slice(0, 10),
    paid_on: paid ? String(item.fechaPago || dueOn).slice(0, 10) : null,
    status: paid ? 'paid' : 'scheduled',
  }
}

async function readPlans(supabase) {
  const { data: plans, error } = await supabase
    .from('installment_plans')
    .select('id, name, total_amount, installments_total, start_on, frequency, status, payment_method, categories(name)')
    .neq('status', 'cancelled')
    .order('start_on', { ascending: true })
  if (error) throw error

  if (!plans?.length) return []
  const ids = plans.map((plan) => plan.id)
  const { data: items, error: itemsError } = await supabase
    .from('installments')
    .select('id, plan_id, installment_number, amount, due_on, paid_on, status')
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
  res.setHeader('Cache-Control', 'no-store')
  try {
    const { supabase, user } = await createAuthenticatedClient(req)

    if (req.method === 'GET') {
      return res.status(200).json(await readPlans(supabase))
    }

    if (req.method === 'POST') {
      const body = req.body || {}
      const name = String(body.concepto || '').trim()
      const totalAmount = Number(body.montoTotal)
      const totalInstallments = Number(body.cuotasTotales)
      const startOn = body.fechaInicio
      if (!name || !Number.isFinite(totalAmount) || totalAmount <= 0 || !Number.isInteger(totalInstallments) || totalInstallments < 1 || !startOn) {
        return res.status(400).json({ error: 'Revisa concepto, importe, número de cuotas y fecha de inicio.' })
      }

      const categoryId = await findOrCreateCategory(supabase, user.id, body.categoria, 'expense')
      const { data: plan, error: planError } = await supabase.from('installment_plans').insert({
        user_id: user.id,
        name,
        total_amount: totalAmount,
        installments_total: totalInstallments,
        start_on: String(startOn).slice(0, 10),
        frequency: frequencyToDb(body.frecuenciaPago),
        status: 'active',
        category_id: categoryId,
        payment_method: body.metodo || null,
      }).select('id').single()
      if (planError) throw planError

      try {
        const history = Array.isArray(body.historialCuotas) ? body.historialCuotas : []
        const rows = history.map((item, index) => normalizeInstallment(item, user.id, plan.id, index + 1))
        if (rows.length) {
          const { error: itemsError } = await supabase.from('installments').insert(rows)
          if (itemsError) throw itemsError
        }
      } catch (error) {
        await supabase.from('installment_plans').delete().eq('id', plan.id)
        throw error
      }

      const allPlans = await readPlans(supabase)
      const created = allPlans.find((item) => item.id === plan.id)
      return res.status(201).json(created)
    }

    if (req.method === 'PATCH') {
      const body = req.body || {}
      if (!body.id) return res.status(400).json({ error: 'Falta el identificador del plan.' })

      const planPatch = {}
      if (body.activo !== undefined) planPatch.status = body.activo ? 'active' : 'paused'
      if (Object.keys(planPatch).length) {
        const { data, error } = await supabase.from('installment_plans')
          .update(planPatch).eq('id', body.id).select('id').maybeSingle()
        if (error) throw error
        if (!data) return res.status(404).json({ error: 'No se encontró el plan de cuotas.' })
      }

      if (Array.isArray(body.historialCuotas)) {
        const rows = body.historialCuotas.map((item, index) => normalizeInstallment(item, user.id, body.id, index + 1))
        const { data: current, error: currentError } = await supabase.from('installments')
          .select('id, installment_number').eq('plan_id', body.id)
        if (currentError) throw currentError
        const currentByNumber = new Map((current || []).map((item) => [item.installment_number, item.id]))

        for (const row of rows) {
          const existingId = currentByNumber.get(row.installment_number)
          const result = existingId
            ? await supabase.from('installments').update(row).eq('id', existingId)
            : await supabase.from('installments').insert(row)
          if (result.error) throw result.error
        }
      }

      const allPlans = await readPlans(supabase)
      return res.status(200).json(allPlans.find((item) => item.id === body.id) || { success: true, id: body.id })
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {}
      if (!id) return res.status(400).json({ error: 'Falta el identificador del plan.' })
      const { data, error } = await supabase.from('installment_plans')
        .update({ status: 'cancelled' }).eq('id', id).select('id').maybeSingle()
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
