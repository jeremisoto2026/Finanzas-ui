import { createAuthenticatedClient, sendApiError } from '../server/supabase.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Método no permitido.' })
  }

  res.setHeader('Cache-Control', 'no-store')
  try {
    const { supabase } = await createAuthenticatedClient(req)
    const { data, error } = await supabase
      .from('budgets')
      .select('id, period_start, planned_amount, notes, categories(name)')
      .order('period_start', { ascending: false })
      .order('created_at', { ascending: true })

    if (error) throw error
    return res.status(200).json((data || []).map((row) => ({
      id: row.id,
      month: String(row.period_start).slice(0, 7),
      amount: Number(row.planned_amount || 0),
      category: row.categories?.name || 'Otros',
      notes: row.notes || '',
    })))
  } catch (error) {
    return sendApiError(res, error, 'No se pudieron cargar los presupuestos.')
  }
}
