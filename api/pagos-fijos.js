import { handleCors } from '../server/cors.js'
import { createAuthenticatedClient, findOrCreateCategory, findOrCreateAccount, sendApiError } from '../server/supabase.js'
import { fixedPaymentForUi, frequencyToDb } from '../server/finance.js'

const allowedFrequencies = new Set(['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly', 'custom'])

function validateFixedPayment(body, partial = false) {
  const patch = {}
  if (!partial || body.nombre !== undefined) {
    const name = String(body.nombre || '').trim()
    if (!name) throw new Error('Indica un nombre para el pago fijo.')
    patch.name = name
  }
  if (!partial || body.monto !== undefined) {
    const amount = Number(body.monto)
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('El importe debe ser mayor que cero.')
    patch.amount = amount
  }
  if (body.frecuencia !== undefined) {
    const frequency = frequencyToDb(body.frecuencia)
    if (!allowedFrequencies.has(frequency)) throw new Error('La frecuencia del pago no es válida.')
    patch.frequency = frequency
  }
  if (body.fechaInicio !== undefined) patch.next_due_on = body.fechaInicio ? String(body.fechaInicio).slice(0, 10) : null
  if (body.metodo !== undefined) patch.payment_method = String(body.metodo || '').trim() || null
  if (body.notificacion !== undefined) patch.notification_enabled = Boolean(body.notificacion)
  if (body.notas !== undefined) patch.notes = String(body.notas || '').trim() || null
  return patch
}

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  res.setHeader('Cache-Control', 'no-store')
  try {
    const { supabase, user } = await createAuthenticatedClient(req)

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('fixed_payments')
        .select('id, name, amount, payment_method, frequency, next_due_on, status, notification_enabled, notes, categories(name), accounts(name), fixed_payment_records(id, period_key, due_on, paid_on, amount, transaction_id, accounts(name))')
        .eq('user_id', user.id)
        .neq('status', 'cancelled')
        .order('next_due_on', { ascending: true })
      if (error) throw error
      return res.status(200).json((data || []).map((row) => {
        const mapped = fixedPaymentForUi(row)
        const history = (row.fixed_payment_records || []).map((record) => ({
          id: record.id, periodo: record.period_key, vencimiento: record.due_on,
          fechaPago: record.paid_on, monto: Number(record.amount || 0),
          transactionId: record.transaction_id, cuenta: record.accounts?.name || '',
        })).sort((a, b) => String(b.fechaPago).localeCompare(String(a.fechaPago)))
        return { ...mapped, historialPagos: history,
          pagadoPeriodo: history.some((record) => record.periodo === mapped.fechaInicio) }
      }))
    }

    if (req.method === 'POST') {
      const body = req.body || {}
      if (body.action === 'mark_paid') {
        if (!body.id || !body.accountId || !/^\\d{4}-\\d{2}-\\d{2}$/.test(String(body.paidOn || '')) ||
            !/^\\d{4}-\\d{2}-\\d{2}$/.test(String(body.periodKey || ''))) {
          return res.status(400).json({ error: 'Selecciona la cuenta y la fecha real del pago.' })
        }
        const { data, error } = await supabase.rpc('register_fixed_payment', {
          p_fixed_payment_id: body.id, p_account_id: body.accountId,
          p_paid_on: body.paidOn, p_period_key: body.periodKey,
        })
        if (error) throw error
        return res.status(200).json({ success: true, ...data })
      }
      let patch
      try { patch = validateFixedPayment(body) } catch (error) {
        return res.status(400).json({ error: error.message })
      }
      if (body.categoria) patch.category_id = await findOrCreateCategory(supabase, user.id, body.categoria, 'expense')
      if (body.cuenta) patch.account_id = await findOrCreateAccount(supabase, user.id, body.cuenta)
      const { data, error } = await supabase.from('fixed_payments').insert({
        user_id: user.id,
        ...patch,
        status: 'active',
      }).select('id, name, amount, payment_method, frequency, next_due_on, status, notification_enabled, notes, categories(name), accounts(name)').single()
      if (error) throw error
      return res.status(201).json(fixedPaymentForUi(data))
    }

    if (req.method === 'PATCH') {
      const body = req.body || {}
      if (!body.id) return res.status(400).json({ error: 'Falta el identificador del pago fijo.' })
      const patch = {}
      if (body.activo !== undefined) {
        if (typeof body.activo !== 'boolean') return res.status(400).json({ error: 'El estado activo no es válido.' })
        patch.status = body.activo ? 'active' : 'paused'
      }
      try { Object.assign(patch, validateFixedPayment(body, true)) } catch (error) {
        return res.status(400).json({ error: error.message })
      }
      if (body.categoria !== undefined) patch.category_id = await findOrCreateCategory(supabase, user.id, body.categoria, 'expense')
      if (body.cuenta !== undefined) patch.account_id = body.cuenta ? await findOrCreateAccount(supabase, user.id, body.cuenta) : null
      if (!Object.keys(patch).length) return res.status(400).json({ error: 'No hay cambios para guardar.' })
      const { data, error } = await supabase.from('fixed_payments')
        .update(patch).eq('id', body.id).eq('user_id', user.id)
        .select('id, name, amount, payment_method, frequency, next_due_on, status, notification_enabled, notes, categories(name), accounts(name)')
        .maybeSingle()
      if (error) throw error
      if (!data) return res.status(404).json({ error: 'No se encontró el pago fijo.' })
      return res.status(200).json(fixedPaymentForUi(data))
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {}
      if (!id) return res.status(400).json({ error: 'Falta el identificador del pago.' })
      const { data, error } = await supabase.from('fixed_payments')
        .update({ status: 'cancelled' }).eq('id', id).eq('user_id', user.id)
        .select('id').maybeSingle()
      if (error) throw error
      if (!data) return res.status(404).json({ error: 'No se encontró el pago fijo.' })
      return res.status(200).json({ success: true, id })
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE')
    return res.status(405).json({ error: 'Método no permitido.' })
  } catch (error) {
    return sendApiError(res, error, 'No se pudo completar la operación de pagos fijos.')
  }
}
