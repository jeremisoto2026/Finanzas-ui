import { createAuthenticatedClient, sendApiError } from '../server/supabase.js'

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
  res.setHeader('Cache-Control', 'no-store')
  try {
    const { supabase, user } = await createAuthenticatedClient(req)

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('debts')
        .select('id, direction, person_name, description, original_amount, outstanding_amount, due_on, status')
        .order('created_at', { ascending: false })
      if (error) throw error
      return res.status(200).json((data || []).map(debtForUi))
    }

    if (req.method === 'POST') {
      const body = req.body || {}
      const personName = String(body.personName || '').trim()
      const description = String(body.description || '').trim()
      const direction = body.direction === 'payable' ? 'payable' : 'receivable'
      const amount = Number(body.amount)
      if (!personName || !Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: 'Indica una persona y un importe válido mayor que cero.' })
      }

      const { data, error } = await supabase.from('debts').insert({
        user_id: user.id,
        direction,
        person_name: personName,
        description: description || null,
        original_amount: amount,
        outstanding_amount: amount,
        status: 'open',
      }).select('id, direction, person_name, description, original_amount, outstanding_amount, due_on, status').single()

      if (error) throw error
      return res.status(201).json(debtForUi(data))
    }

    if (req.method === 'PATCH') {
      const body = req.body || {}
      if (!body.id) return res.status(400).json({ error: 'Falta el identificador de la deuda.' })

      const patch = {}
      if (body.outstandingAmount !== undefined) {
        const outstanding = Number(body.outstandingAmount)
        if (!Number.isFinite(outstanding) || outstanding < 0) {
          return res.status(400).json({ error: 'El saldo pendiente no puede ser negativo.' })
        }
        patch.outstanding_amount = outstanding
        patch.status = outstanding === 0 ? 'settled' : 'partially_settled'
      }
      if (body.status !== undefined) {
        if (!['open', 'partially_settled', 'settled', 'written_off'].includes(body.status)) {
          return res.status(400).json({ error: 'Estado de deuda no válido.' })
        }
        patch.status = body.status
      }
      if (!Object.keys(patch).length) {
        return res.status(400).json({ error: 'No hay cambios para guardar.' })
      }

      const { data, error } = await supabase.from('debts')
        .update(patch).eq('id', body.id)
        .select('id, direction, person_name, description, original_amount, outstanding_amount, due_on, status')
        .maybeSingle()
      if (error) throw error
      if (!data) return res.status(404).json({ error: 'No se encontró la deuda.' })
      return res.status(200).json(debtForUi(data))
    }

    res.setHeader('Allow', 'GET, POST, PATCH')
    return res.status(405).json({ error: 'Método no permitido.' })
  } catch (error) {
    return sendApiError(res, error, 'No se pudo completar la operación de deudas.')
  }
}
