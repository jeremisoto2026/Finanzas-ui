import { handleCors } from '../server/cors.js'
import { createAuthenticatedClient, findOrCreateCategory, sendApiError } from '../server/supabase.js'

function debtForUi(row) {
  return {
    id: row.id,
    direction: row.direction,
    personName: row.person_name,
    description: row.description || '',
    originalAmount: Number(row.original_amount || 0),
    outstandingAmount: Number(row.outstanding_amount || 0),
    dueOn: row.due_on || null,
    status: row.status,
  }
}

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  res.setHeader('Cache-Control', 'no-store')
  try {
    const { supabase, user } = await createAuthenticatedClient(req)

    if (req.method === 'GET') {
      const { data, error } = await supabase.from('debts')
        .select('id, direction, person_name, description, original_amount, outstanding_amount, due_on, status')
        .eq('user_id', user.id).order('created_at', { ascending: false })
      if (error) throw error
      return res.status(200).json((data || []).map(debtForUi))
    }

    if (req.method === 'POST' && req.body?.action === 'settle') {
      const body = req.body
      if (!body.id || !body.accountId || !body.idempotencyKey) {
        return res.status(400).json({ error: 'Selecciona deuda, cuenta y confirma la operación.' })
      }
      const amount = Number(body.amount)
      const occurredOn = String(body.occurredOn || '').slice(0, 10)
      if (!Number.isFinite(amount) || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) {
        return res.status(400).json({ error: 'Indica un importe válido y la fecha del movimiento.' })
      }
      const { data: currentDebt, error: readError } = await supabase.from('debts')
        .select('id, direction').eq('id', body.id).eq('user_id', user.id).maybeSingle()
      if (readError) throw readError
      if (!currentDebt) return res.status(404).json({ error: 'No se encontró la deuda seleccionada.' })
      const transactionKind = currentDebt.direction === 'receivable' ? 'income' : 'expense'
      const categoryName = currentDebt.direction === 'receivable' ? 'Cobros de préstamos' : 'Pago de deudas'
      const categoryId = await findOrCreateCategory(supabase, user.id, categoryName, transactionKind)
      const { data: settlement, error: settlementError } = await supabase.rpc('register_debt_settlement', {
        p_debt_id: body.id,
        p_account_id: body.accountId,
        p_amount: amount,
        p_occurred_on: occurredOn,
        p_idempotency_key: body.idempotencyKey,
        p_category_id: categoryId,
      })
      if (settlementError) throw settlementError
      const { data: updatedDebt, error: updateError } = await supabase.from('debts')
        .select('id, direction, person_name, description, original_amount, outstanding_amount, due_on, status')
        .eq('id', body.id).eq('user_id', user.id).single()
      if (updateError) throw updateError
      return res.status(200).json({
        success: true,
        debt: debtForUi(updatedDebt),
        transactionId: settlement?.transactionId || null,
        alreadyRecorded: Boolean(settlement?.alreadyRecorded),
      })
    }

    if (req.method === 'POST' || req.method === 'PATCH') {
      const body = req.body || {}
      if (req.method === 'PATCH' && !body.id) return res.status(400).json({ error: 'Falta el identificador de la deuda.' })

      let current = null
      if (req.method === 'PATCH') {
        const { data, error } = await supabase.from('debts')
          .select('id, original_amount, outstanding_amount, direction, status')
          .eq('id', body.id).eq('user_id', user.id).maybeSingle()
        if (error) throw error
        if (!data) return res.status(404).json({ error: 'No se encontró la deuda.' })
        current = data
      }

      const patch = {}
      if (req.method === 'POST' || body.personName !== undefined) {
        const name = String(body.personName || '').trim()
        if (!name) return res.status(400).json({ error: 'Indica una persona.' })
        patch.person_name = name
      }
      if (req.method === 'POST' || body.direction !== undefined) {
        if (!['receivable', 'payable'].includes(body.direction)) return res.status(400).json({ error: 'Tipo de deuda no válido.' })
        patch.direction = body.direction
      }
      if (body.description !== undefined || req.method === 'POST') patch.description = String(body.description || '').trim() || null
      if (body.dueOn !== undefined) patch.due_on = body.dueOn ? String(body.dueOn).slice(0, 10) : null

      if (req.method === 'POST' || body.amount !== undefined || body.originalAmount !== undefined) {
        const amount = Number(body.amount ?? body.originalAmount)
        if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'El importe original debe ser mayor que cero.' })
        patch.original_amount = amount
      }
      if (body.outstandingAmount !== undefined) {
        const outstanding = Number(body.outstandingAmount)
        if (!Number.isFinite(outstanding) || outstanding < 0) return res.status(400).json({ error: 'El saldo pendiente no puede ser negativo.' })
        patch.outstanding_amount = outstanding
      } else if (req.method === 'POST') {
        patch.outstanding_amount = patch.original_amount
      }

      const resultingOriginal = patch.original_amount ?? Number(current?.original_amount || 0)
      const resultingOutstanding = patch.outstanding_amount ?? Number(current?.outstanding_amount || 0)
      if (resultingOutstanding > resultingOriginal) {
        return res.status(400).json({ error: 'El importe pendiente no puede superar el importe original.' })
      }

      if (body.status !== undefined) {
        if (!['open', 'partially_settled', 'settled', 'written_off'].includes(body.status)) return res.status(400).json({ error: 'Estado de deuda no válido.' })
        patch.status = body.status
      } else if (patch.outstanding_amount !== undefined || req.method === 'POST') {
        patch.status = resultingOutstanding === 0
          ? 'settled'
          : resultingOutstanding < resultingOriginal
            ? 'partially_settled'
            : 'open'
      }

      const query = req.method === 'POST'
        ? supabase.from('debts').insert({ user_id: user.id, ...patch })
        : supabase.from('debts').update(patch).eq('id', body.id).eq('user_id', user.id)
      const { data, error } = await query
        .select('id, direction, person_name, description, original_amount, outstanding_amount, due_on, status')
        .single()
      if (error) throw error
      return res.status(req.method === 'POST' ? 201 : 200).json(debtForUi(data))
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {}
      if (!id) return res.status(400).json({ error: 'Falta el identificador de la deuda.' })
      const { data, error } = await supabase.from('debts').delete()
        .eq('id', id).eq('user_id', user.id).select('id').maybeSingle()
      if (error) throw error
      if (!data) return res.status(404).json({ error: 'No se encontró la deuda.' })
      return res.status(200).json({ success: true, id })
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE')
    return res.status(405).json({ error: 'Método no permitido.' })
  } catch (error) {
    return sendApiError(res, error, 'No se pudo completar la operación de deudas.')
  }
}
