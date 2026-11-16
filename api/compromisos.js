import { createAuthenticatedClient, sendApiError } from '../server/supabase.js'

const allowed = {
  replenishment: ['open', 'partially_settled', 'settled'],
  reserve: ['reserved', 'released', 'settled'],
  planned_extra: ['open', 'settled', 'released'],
  historical_expense: ['recorded'],
}

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

function validateAmounts(amountValue, outstandingValue = 0) {
  const amount = Number(amountValue)
  const outstanding = Number(outstandingValue)
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('El importe debe ser mayor que cero.')
  if (!Number.isFinite(outstanding) || outstanding < 0 || outstanding > amount) throw new Error('El importe pendiente debe estar entre cero y el importe total.')
  return { amount, outstanding }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    const { supabase, user } = await createAuthenticatedClient(req)

    if (req.method === 'GET') {
      const { data, error } = await supabase.from('financial_items')
        .select('id, item_kind, title, amount, outstanding_amount, status, beneficiary, effective_on, due_on, notes')
        .eq('user_id', user.id)
        .order('item_kind', { ascending: true }).order('title', { ascending: true })
      if (error) throw error
      return res.status(200).json((data || []).map(mapItem))
    }

    if (req.method === 'POST' || req.method === 'PATCH') {
      const body = req.body || {}
      if (req.method === 'PATCH' && !body.id) return res.status(400).json({ error: 'Falta el identificador del compromiso.' })
      const patch = {}
      const kind = body.kind
      if (req.method === 'POST' || kind !== undefined) {
        if (!allowed[kind]) return res.status(400).json({ error: 'Tipo de compromiso no válido.' })
        patch.item_kind = kind
      }
      if (req.method === 'POST' || body.title !== undefined) {
        const title = String(body.title || '').trim()
        if (!title) return res.status(400).json({ error: 'Indica un título para el compromiso.' })
        patch.title = title
      }
      if (req.method === 'POST' || body.amount !== undefined) {
        try {
          const amounts = validateAmounts(body.amount, body.outstandingAmount ?? body.amount)
          patch.amount = amounts.amount
          patch.outstanding_amount = amounts.outstanding
        } catch (error) { return res.status(400).json({ error: error.message }) }
      } else if (body.outstandingAmount !== undefined) {
        const outstanding = Number(body.outstandingAmount)
        if (!Number.isFinite(outstanding) || outstanding < 0) return res.status(400).json({ error: 'El importe pendiente no es válido.' })
        patch.outstanding_amount = outstanding
      }
      if (body.beneficiary !== undefined || req.method === 'POST') patch.beneficiary = String(body.beneficiary || '').trim() || null
      if (body.effectiveOn !== undefined || req.method === 'POST') patch.effective_on = body.effectiveOn || null
      if (body.dueOn !== undefined || req.method === 'POST') patch.due_on = body.dueOn || null
      if (body.notes !== undefined || req.method === 'POST') patch.notes = String(body.notes || '').trim() || null

      const currentKind = req.method === 'POST' ? patch.item_kind : kind
      if (body.status !== undefined || req.method === 'POST') {
        const status = body.status || ({
          replenishment: 'open',
          reserve: 'reserved',
          planned_extra: 'open',
          historical_expense: 'recorded',
        }[currentKind])
        if (!allowed[currentKind]?.includes(status)) return res.status(400).json({ error: 'El estado no corresponde al tipo de compromiso.' })
        patch.status = status
        if (['settled', 'released', 'recorded'].includes(status) && body.outstandingAmount === undefined) {
          patch.outstanding_amount = 0
        }
      }
      if (!Object.keys(patch).length) return res.status(400).json({ error: 'No hay cambios para guardar.' })

      const query = req.method === 'POST'
        ? supabase.from('financial_items').insert({ user_id: user.id, ...patch })
        : supabase.from('financial_items').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', body.id).eq('user_id', user.id)
      const { data, error } = await query
        .select('id, item_kind, title, amount, outstanding_amount, status, beneficiary, effective_on, due_on, notes')
        .single()
      if (error) throw error
      return res.status(req.method === 'POST' ? 201 : 200).json(mapItem(data))
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {}
      if (!id) return res.status(400).json({ error: 'Falta el identificador del compromiso.' })
      const { data, error } = await supabase.from('financial_items').delete()
        .eq('id', id).eq('user_id', user.id).select('id').maybeSingle()
      if (error) throw error
      if (!data) return res.status(404).json({ error: 'No se encontró el compromiso.' })
      return res.status(200).json({ success: true, id })
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE')
    return res.status(405).json({ error: 'No se pudieron cargar o actualizar los compromisos.' })
  } catch (error) {
    return sendApiError(res, error, 'No se pudieron cargar o actualizar los compromisos.')
  }
}
