import { handleCors } from '../server/cors.js'
import { createAuthenticatedClient, findOrCreateAccount, sendApiError } from '../server/supabase.js'

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Método no permitido.' })
  }

  res.setHeader('Cache-Control', 'no-store')
  try {
    const { supabase, user } = await createAuthenticatedClient(req)
    const { saldo, year, month, cuenta } = req.body || {}
    const amount = Number(saldo)
    const y = Number(year)
    const m = Number(month)
    if (!Number.isFinite(amount) || !Number.isInteger(y) || !Number.isInteger(m) || m < 0 || m > 11) {
      return res.status(400).json({ error: 'El saldo o el periodo no son válidos.' })
    }

    const accountId = await findOrCreateAccount(supabase, user.id, cuenta || 'Cuenta Principal')
    const openingDate = `${y}-${String(m + 1).padStart(2, '0')}-01`
    const { data, error } = await supabase.from('accounts')
      .update({ opening_balance: amount, opening_balance_date: openingDate })
      .eq('id', accountId)
      .select('id, name, opening_balance, opening_balance_date')
      .single()
    if (error) throw error

    return res.status(200).json({ ok: true, account: data })
  } catch (error) {
    return sendApiError(res, error, 'No se pudo guardar el saldo inicial.')
  }
}
