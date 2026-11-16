import { createAuthenticatedClient, sendApiError } from '../server/supabase.js'

function mapItem(row) {
  return {
    id: row.id,
    kind: row.item_kind,
    title: row.title,
    amount: Number(row.amount || 0),
    outstandingAmount: Number(row.outstanding_amount || 0),
    status: row.status,
    beneficiary: row.beneficiary || '',
    effectiveOn: row.effective_on || null,
    dueOn: row.due_on || null,
    notes: row.notes || '',
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    const { supabase } = await createAuthenticatedClient(req)

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('financial_items')
        .select('id, item_kind, title, amount, outstanding_amount, status, beneficiary, effective_on, due_on, notes')
        .order('item_kind', { ascending: true })
        .order('title', { ascending: true })
      if (error) throw error
      return res.status(200).json((data || []).map(mapItem))
    }

    if (req.method === 'PATCH') {
      const body = req.body || {}
      if (!body.id || !body.status) {
        return res.status(400).json({ error: 'Falta el identificador o el nuevo estado del compromiso.' })
      }

      const { data: current, error: readError } = await supabase
        .from('financial_items')
        .select('id, item_kind, amount')
        .eq('id', body.id)
        .maybeSingle()
      if (readError) throw readError
      if (!current) return res.status(404).json({ error: 'No se encontró el compromiso.' })

      const allowed = {
        replenishment: ['open', 'partially_settled', 'settled'],
        reserve: ['reserved', 'released', 'settled'],
        planned_extra: ['open', 'settled', 'released'],
        historical_expense: ['recorded'],
      }
      if (!allowed[current.item_kind]?.includes(body.status)) {
        return res.status(400).json({ error: 'El estado no corresponde al tipo de registro.' })
      }

      const outstandingAmount = body.outstandingAmount === undefined
        ? (['settled', 'released'].includes(body.status) ? 0 : undefined)
        : Number(body.outstandingAmount)

      if (outstandingAmount !== undefined &&
          (!Number.isFinite(outstandingAmount) || outstandingAmount < 0 || outstandingAmount > Number(current.amount))) {
        return res.status(400).json({ error: 'El importe pendiente no es válido.' })
      }

      const patch = { status: body.status, updated_at: new Date().toISOString() }
      if (outstandingAmount !== undefined) patch.outstanding_amount = outstandingAmount

      const { data, error } = await supabase
        .from('financial_items')
        .update(patch)
        .eq('id', body.id)
        .select('id, item_kind, title, amount, outstanding_amount, status, beneficiary, effective_on, due_on, notes')
        .single()
      if (error) throw error
      return res.status(200).json(mapItem(data))
    }

    res.setHeader('Allow', 'GET, PATCH')
    return res.status(405).json({ error: 'Método no permitido.' })
  } catch (error) {
    return sendApiError(res, error, 'No se pudieron cargar o actualizar los compromisos.')
  }
}
