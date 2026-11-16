import { createAuthenticatedClient, findOrCreateCategory, findOrCreateAccount, sendApiError } from '../server/supabase.js'
import { fixedPaymentForUi, frequencyToDb } from '../server/finance.js'

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    const { supabase, user } = await createAuthenticatedClient(req)

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('fixed_payments')
        .select('id, name, amount, payment_method, frequency, next_due_on, status, notification_enabled, categories(name), accounts(name)')
        .neq('status', 'cancelled')
        .order('next_due_on', { ascending: true })
      if (error) throw error
      return res.status(200).json((data || []).map(fixedPaymentForUi))
    }

    if (req.method === 'POST') {
      const body = req.body || {}
      const name = String(body.nombre || '').trim()
      const amount = Number(body.monto)
      if (!name || !Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: 'Indica un nombre y un importe válido mayor que cero.' })
      }

      const categoryId = await findOrCreateCategory(supabase, user.id, body.categoria, 'expense')
      const accountId = body.cuenta ? await findOrCreateAccount(supabase, user.id, body.cuenta) : null
      const { data, error } = await supabase.from('fixed_payments').insert({
        user_id: user.id,
        account_id: accountId,
        category_id: categoryId,
        name,
        amount,
        payment_method: body.metodo || null,
        frequency: frequencyToDb(body.frecuencia),
        next_due_on: body.fechaInicio || null,
        notification_enabled: Boolean(body.notificacion),
        status: 'active',
      }).select('id, name, amount, payment_method, frequency, next_due_on, status, notification_enabled, categories(name), accounts(name)').single()

      if (error) throw error
      return res.status(201).json(fixedPaymentForUi(data))
    }

    if (req.method === 'PATCH') {
      const { id, activo } = req.body || {}
      if (!id || typeof activo !== 'boolean') {
        return res.status(400).json({ error: 'Faltan el identificador o el estado del pago.' })
      }
      const { data, error } = await supabase.from('fixed_payments')
        .update({ status: activo ? 'active' : 'paused' })
        .eq('id', id)
        .select('id')
        .maybeSingle()
      if (error) throw error
      if (!data) return res.status(404).json({ error: 'No se encontró el pago fijo.' })
      return res.status(200).json({ id, activo })
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {}
      if (!id) return res.status(400).json({ error: 'Falta el identificador del pago.' })
      const { data, error } = await supabase.from('fixed_payments')
        .update({ status: 'cancelled' })
        .eq('id', id)
        .select('id')
        .maybeSingle()
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
