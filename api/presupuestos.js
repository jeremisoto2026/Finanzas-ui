import { createAuthenticatedClient, findOrCreateCategory, sendApiError } from '../server/supabase.js'

function monthStart(value) {
  const match = /^\\d{4}-(0[1-9]|1[0-2])$/.exec(String(value || '').trim())
  return match ? `${match[0]}-01` : null
}

function mapBudget(row) {
  return {
    id: row.id,
    month: String(row.period_start).slice(0, 7),
    amount: Number(row.planned_amount || 0),
    category: row.categories?.name || 'Otros',
    notes: row.notes || '',
  }
}

function validateAmount(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount < 0) throw new Error('El presupuesto debe ser un importe igual o mayor que cero.')
  return amount
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    const { supabase, user } = await createAuthenticatedClient(req)

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('budgets')
        .select('id, period_start, planned_amount, notes, categories(name)')
        .eq('user_id', user.id)
        .order('period_start', { ascending: false })
        .order('created_at', { ascending: true })
      if (error) throw error
      return res.status(200).json((data || []).map(mapBudget))
    }

    if (req.method === 'POST' || req.method === 'PATCH') {
      const body = req.body || {}
      if (req.method === 'PATCH' && !body.id) return res.status(400).json({ error: 'Falta el identificador del presupuesto.' })
      const patch = {}
      if (req.method === 'POST' || body.month !== undefined) {
        const periodStart = monthStart(body.month)
        if (!periodStart) return res.status(400).json({ error: 'Selecciona un mes válido.' })
        patch.period_start = periodStart
      }
      if (req.method === 'POST' || body.amount !== undefined) {
        try { patch.planned_amount = validateAmount(body.amount) } catch (error) {
          return res.status(400).json({ error: error.message })
        }
      }
      if (req.method === 'POST' || body.category !== undefined) {
        const category = String(body.category || '').trim()
        if (!category) return res.status(400).json({ error: 'Indica una categoría para el presupuesto.' })
        patch.category_id = await findOrCreateCategory(supabase, user.id, category, 'expense')
      }
      if (body.notes !== undefined || req.method === 'POST') patch.notes = String(body.notes || '').trim() || null
      if (req.method === 'POST') {
        const { data, error } = await supabase.from('budgets').insert({ user_id: user.id, ...patch })
          .select('id, period_start, planned_amount, notes, categories(name)').single()
        if (error?.code === '23505') return res.status(409).json({ error: 'Ya existe un presupuesto para esa categoría y ese mes. Edita el existente.' })
        if (error) throw error
        return res.status(201).json(mapBudget(data))
      }
      if (!Object.keys(patch).length) return res.status(400).json({ error: 'No hay cambios para guardar.' })
      const { data, error } = await supabase.from('budgets').update(patch)
        .eq('id', body.id).eq('user_id', user.id)
        .select('id, period_start, planned_amount, notes, categories(name)').maybeSingle()
      if (error?.code === '23505') return res.status(409).json({ error: 'Ya existe un presupuesto para esa categoría y ese mes.' })
      if (error) throw error
      if (!data) return res.status(404).json({ error: 'No se encontró el presupuesto.' })
      return res.status(200).json(mapBudget(data))
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {}
      if (!id) return res.status(400).json({ error: 'Falta el identificador del presupuesto.' })
      const { data, error } = await supabase.from('budgets').delete()
        .eq('id', id).eq('user_id', user.id).select('id').maybeSingle()
      if (error) throw error
      if (!data) return res.status(404).json({ error: 'No se encontró el presupuesto.' })
      return res.status(200).json({ success: true, id })
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE')
    return res.status(405).json({ error: 'Método no permitido.' })
  } catch (error) {
    return sendApiError(res, error, 'No se pudo completar la operación de presupuestos.')
  }
}
