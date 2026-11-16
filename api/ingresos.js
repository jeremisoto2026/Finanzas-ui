import { createAuthenticatedClient, findOrCreateCategory, findOrCreateAccount, sendApiError } from '../server/supabase.js'
import { transactionForUi } from '../server/finance.js'

function isDateOnly(value) {
  const text = String(value || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false
  const parsed = new Date(`${text}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  try {
    const { supabase, user } = await createAuthenticatedClient(req)

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('transactions')
        .select('id, amount, occurred_on, description, payment_method, categories(name), accounts(name)')
        .eq('user_id', user.id)
        .eq('kind', 'income')
        .eq('status', 'posted')
        .order('occurred_on', { ascending: false })
      if (error) throw error
      return res.status(200).json((data || []).map(transactionForUi))
    }

    if (req.method === 'POST') {
      const body = req.body || {}
      const description = String(body.concepto || '').trim()
      const amount = Number(body.monto)
      const occurredOn = String(body.fecha || '').slice(0, 10)
      if (!description || !Number.isFinite(amount) || amount <= 0 || !isDateOnly(occurredOn)) {
        return res.status(400).json({ error: 'Indica concepto, importe positivo y fecha válida.' })
      }

      const categoryId = await findOrCreateCategory(supabase, user.id, body.categoria || 'Otros', 'income')
      const accountId = await findOrCreateAccount(supabase, user.id, body.cuenta || 'Revolut')
      const { data, error } = await supabase.from('transactions').insert({
        user_id: user.id,
        account_id: accountId,
        category_id: categoryId,
        kind: 'income',
        status: 'posted',
        amount,
        occurred_on: occurredOn,
        description,
        payment_method: body.metodo || null,
        idempotency_key: body.idempotencyKey || null,
      }).select('id, amount, occurred_on, description, payment_method, categories(name), accounts(name)').single()
      if (error) throw error
      return res.status(201).json(transactionForUi(data))
    }

    if (req.method === 'PATCH') {
      const body = req.body || {}
      if (!body.id) return res.status(400).json({ error: 'Falta el identificador del ingreso.' })
      const patch = {}
      if (body.concepto !== undefined) {
        const value = String(body.concepto || '').trim()
        if (!value) return res.status(400).json({ error: 'El concepto no puede estar vacío.' })
        patch.description = value
      }
      if (body.monto !== undefined) {
        const amount = Number(body.monto)
        if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'El importe debe ser mayor que cero.' })
        patch.amount = amount
      }
      if (body.fecha !== undefined) {
        const date = String(body.fecha || '').slice(0, 10)
        if (!isDateOnly(date)) return res.status(400).json({ error: 'La fecha no es válida.' })
        patch.occurred_on = date
      }
      if (body.categoria !== undefined) patch.category_id = await findOrCreateCategory(supabase, user.id, body.categoria, 'income')
      if (body.cuenta !== undefined) patch.account_id = await findOrCreateAccount(supabase, user.id, body.cuenta)
      if (body.metodo !== undefined) patch.payment_method = String(body.metodo || '').trim() || null
      if (!Object.keys(patch).length) return res.status(400).json({ error: 'No hay cambios para guardar.' })
      const { data, error } = await supabase.from('transactions').update(patch)
        .eq('id', body.id).eq('user_id', user.id).eq('kind', 'income').eq('status', 'posted')
        .select('id, amount, occurred_on, description, payment_method, categories(name), accounts(name)').maybeSingle()
      if (error) throw error
      if (!data) return res.status(404).json({ error: 'No se encontró el ingreso.' })
      return res.status(200).json(transactionForUi(data))
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {}
      if (!id) return res.status(400).json({ error: 'Falta el identificador del ingreso.' })
      const { data, error } = await supabase.from('transactions')
        .update({ status: 'void' }).eq('id', id).eq('user_id', user.id).eq('kind', 'income').eq('status', 'posted')
        .select('id').maybeSingle()
      if (error) throw error
      if (!data) return res.status(404).json({ error: 'No se encontró el ingreso.' })
      return res.status(200).json({ success: true, id })
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE')
    return res.status(405).json({ error: 'Método no permitido.' })
  } catch (error) {
    return sendApiError(res, error, 'No se pudieron cargar o guardar los ingresos.')
  }
}
