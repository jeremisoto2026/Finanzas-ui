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
      .from('account_balances')
      .select('account_id, account_name, currency_code, current_balance')
      .order('account_name', { ascending: true })

    if (error) throw error
    return res.status(200).json((data || []).map((row) => ({
      id: row.account_id,
      name: row.account_name,
      currencyCode: String(row.currency_code || 'EUR').trim(),
      balance: Number(row.current_balance || 0),
    })))
  } catch (error) {
    return sendApiError(res, error, 'No se pudieron cargar los saldos reales de tus cuentas.')
  }
}
