import { createAuthenticatedClient, sendApiError } from '../server/supabase.js'
import { roundMoney } from '../server/finance.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Método no permitido.' })
  }

  res.setHeader('Cache-Control', 'no-store')
  try {
    const { supabase, user } = await createAuthenticatedClient(req)
    const year = Number(req.body?.year)
    const month = Number(req.body?.month)
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 0 || month > 11) {
      return res.status(400).json({ error: 'El periodo solicitado no es válido.' })
    }

    const start = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10)
    const end = new Date(Date.UTC(year, month + 1, 1)).toISOString().slice(0, 10)

    const { data: movements, error: movementError } = await supabase
      .from('transactions')
      .select('kind, amount')
      .eq('status', 'posted')
      .gte('occurred_on', start)
      .lt('occurred_on', end)
    if (movementError) throw movementError

    const income = roundMoney((movements || []).filter(x => x.kind === 'income').reduce((sum, x) => sum + Number(x.amount || 0), 0))
    const expenses = roundMoney((movements || []).filter(x => x.kind === 'expense').reduce((sum, x) => sum + Number(x.amount || 0), 0))

    const { data: balances, error: balanceError } = await supabase
      .from('account_balances').select('current_balance')
    if (balanceError) throw balanceError
    const closing = roundMoney((balances || []).reduce((sum, item) => sum + Number(item.current_balance || 0), 0))
    const opening = roundMoney(closing - income + expenses)

    const { data: saved, error: saveError } = await supabase.from('monthly_closings').upsert({
      user_id: user.id,
      period_start: start,
      opening_balance: opening,
      income_total: income,
      expense_total: expenses,
      closing_balance: closing,
    }, { onConflict: 'user_id,period_start' })
      .select('period_start, opening_balance, income_total, expense_total, closing_balance')
      .single()
    if (saveError) throw saveError

    return res.status(200).json({ ok: true, closing: saved })
  } catch (error) {
    return sendApiError(res, error, 'No se pudo cerrar el mes.')
  }
}
