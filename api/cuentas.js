import { createAuthenticatedClient, sendApiError } from '../server/supabase.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Método no permitido.' })
  }

  res.setHeader('Cache-Control', 'no-store')
  try {
    const { supabase } = await createAuthenticatedClient(req)
    const [balancesResult, accountsResult, transactionsResult] = await Promise.all([
      supabase
        .from('account_balances')
        .select('account_id, account_name, currency_code, current_balance')
        .order('account_name', { ascending: true }),
      supabase
        .from('accounts')
        .select('id, opening_balance_date'),
      supabase
        .from('transactions')
        .select('account_id, occurred_on')
        .eq('status', 'posted')
        .order('occurred_on', { ascending: false }),
    ])

    if (balancesResult.error) throw balancesResult.error
    if (accountsResult.error) throw accountsResult.error
    if (transactionsResult.error) throw transactionsResult.error

    const openingDates = new Map((accountsResult.data || []).map((row) => [row.id, row.opening_balance_date]))
    const lastMovements = new Map()
    for (const row of transactionsResult.data || []) {
      if (!lastMovements.has(row.account_id)) lastMovements.set(row.account_id, row.occurred_on)
    }

    return res.status(200).json((balancesResult.data || []).map((row) => ({
      id: row.account_id,
      name: row.account_name,
      currencyCode: String(row.currency_code || 'EUR').trim(),
      balance: Number(row.current_balance || 0),
      openingBalanceDate: openingDates.get(row.account_id) || null,
      lastMovementOn: lastMovements.get(row.account_id) || null,
    })))
  } catch (error) {
    return sendApiError(res, error, 'No se pudieron cargar los saldos reales de tus cuentas.')
  }
}
