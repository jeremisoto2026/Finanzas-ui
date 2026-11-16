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

      let current = null
      if (req.method === 'PATCH') {
        const { data, error } = await supabase.from('financial_items')
          .select('id, item_kind, title, amount, outstanding_amount, status')
          .eq('id', body.id).eq('user_id', user.id).maybeSingle()
        if (error) throw error
        if (!data) return res.status(404).json({ error: 'No se encontró el compromiso.' })
        current = data
      }

      const kind = req.method === 'POST' ? body.kind : current.item_kind
      if (!allowed[kind]) return res.status(400).json({ error: 'Tipo de compromiso no válido.' })
      const patch = {}

      if (req.method === 'POST' || body.title !== undefined) {
        const title = String(body.title || '').trim()
        if (!title) return res.status(400).json({ error: 'Indica un título para el compromiso.' })
        patch.title = title
      }

      const amount = body.amount !== undefined ? Number(body.amount) : Number(current?.amount || 0)
      const outstanding = body.outstandingAmount !== undefined
        ? Number(body.outstandingAmount)
        : req.method === 'POST'
          ? (kind === 'historical_expense' ? 0 : amount)
          : Number(current?.outstanding_amount || 0)
      if (req.method === 'POST' || body.amount !== undefined) {
        if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'El importe debe ser mayor que cero.' })
        patch.amount = amount
      }
      if (req.method === 'POST' || body.outstandingAmount !== undefined || body.amount !== undefined) {
        if (!Number.isFinite(outstanding) || outstanding < 0 || outstanding > amount) {
          return res.status(400).json({ error: 'El importe pendiente debe estar entre cero y el importe total.' })
        }
        patch.outstanding_amount = outstanding
      }

      if (body.beneficiary !== undefined || req.method === 'POST') patch.beneficiary = String(body.beneficiary || '').trim() || null
      if (body.effectiveOn !== undefined || req.method === 'POST') patch.effective_on = body.effectiveOn || null
      if (body.dueOn !== undefined || req.method === 'POST') patch.due_on = body.dueOn || null
      if (body.notes !== undefined || req.method === 'POST') patch.notes = String(body.notes || '').trim() || null

      if (body.status !== undefined || req.method === 'POST') {
        const defaultStatus = {
          replenishment: 'open',
          reserve: 'reserved',
          planned_extra: 'open',
          historical_expense: 'recorded',
        }[kind]
        const status = body.status || defaultStatus
        if (!allowed[kind].includes(status)) return res.status(400).json({ error: 'El estado no corresponde al tipo de compromiso.' })
        patch.status = status
        if (['settled', 'released', 'recorded'].includes(status) && body.outstandingAmount === undefined) {
          patch.outstanding_amount = 0
        }
      } else if (patch.outstanding_amount !== undefined) {
        if (kind === 'reserve') patch.status = patch.outstanding_amount === 0 ? 'released' : 'reserved'
        else if (kind === 'replenishment') patch.status = patch.outstanding_amount === 0 ? 'settled' : patch.outstanding_amount < amount ? 'partially_settled' : 'open'
        else if (kind === 'planned_extra') patch.status = patch.outstanding_amount === 0 ? 'settled' : 'open'
      }

      const query = req.method === 'POST'
        ? supabase.from('financial_items').insert({ user_id: user.id, item_kind: kind, ...patch })
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
