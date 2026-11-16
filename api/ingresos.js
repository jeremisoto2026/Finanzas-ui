import { createAuthenticatedClient, sendApiError } from '../server/supabase.js'
import { transactionForUi } from '../server/finance.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Método no permitido.' })
  }

  res.setHeader('Cache-Control', 'no-store')
  try {
    const { supabase } = await createAuthenticatedClient(req)
    const { data, error } = await supabase
      .from('transactions')
      .select('id, amount, occurred_on, description, payment_method, categories(name), accounts(name)')
      .eq('kind', 'income')
      .eq('status', 'posted')
      .order('occurred_on', { ascending: false })

    if (error) throw error
    return res.status(200).json((data || []).map(transactionForUi))
  } catch (error) {
    return sendApiError(res, error, 'No se pudieron cargar los ingresos.')
  }
}
