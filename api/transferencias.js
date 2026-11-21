import { handleCors } from '../server/cors.js'
import { createAuthenticatedClient, sendApiError } from '../server/supabase.js'

function validDate(value) {
  const text = String(value || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false
  const date = new Date(text + 'T00:00:00.000Z')
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text
}

export default async function handler(req, res) {
  if (handleCors(req, res)) return
  res.setHeader('Cache-Control', 'no-store')
  try {
    const { supabase, user } = await createAuthenticatedClient(req)
    if (req.method === 'GET') {
      const [{ data: transfers, error }, { data: accounts, error: accountsError }, { data: entries, error: entriesError }] = await Promise.all([
        supabase.from('transfers').select('id, from_account_id, to_account_id, amount, occurred_on, description, created_at')
          .eq('user_id', user.id).order('occurred_on', { ascending: false }).order('created_at', { ascending: false }),
        supabase.from('accounts').select('id, name, currency_code').eq('user_id', user.id),
        supabase.from('transactions').select('transfer_id, status').eq('user_id', user.id).not('transfer_id', 'is', null),
      ])
      if (error) throw error
      if (accountsError) throw accountsError
      if (entriesError) throw entriesError
      const accountMap = new Map((accounts || []).map((account) => [account.id, account]))
      const statusMap = new Map()
      for (const row of entries || []) {
        const list = statusMap.get(row.transfer_id) || []
        list.push(row.status)
        statusMap.set(row.transfer_id, list)
      }
      return res.status(200).json((transfers || []).map((row) => ({
        id: row.id, fromAccountId: row.from_account_id, toAccountId: row.to_account_id,
        fromAccount: accountMap.get(row.from_account_id)?.name || 'Cuenta no disponible',
        toAccount: accountMap.get(row.to_account_id)?.name || 'Cuenta no disponible',
        currencyCode: String(accountMap.get(row.from_account_id)?.currency_code || 'EUR').trim(),
        amount: Number(row.amount), date: row.occurred_on, description: row.description || '',
        status: (statusMap.get(row.id) || []).length === 2 && (statusMap.get(row.id) || []).every((value) => value === 'void') ? 'cancelled' : 'posted',
      })))
    }
    if (req.method === 'POST') {
      const body = req.body || {}
      const fromAccountId = String(body.fromAccountId || '')
      const toAccountId = String(body.toAccountId || '')
      const amount = Number(body.amount)
      const date = String(body.date || '').slice(0, 10)
      const description = String(body.description || '').trim().slice(0, 160) || null
      if (!fromAccountId || !toAccountId || fromAccountId === toAccountId || !Number.isFinite(amount) || amount <= 0 || !validDate(date)) {
        return res.status(400).json({ error: 'Indica dos cuentas distintas, un importe positivo y una fecha válida.' })
      }
      const { data, error } = await supabase.rpc('create_account_transfer', {
        p_from_account_id: fromAccountId, p_to_account_id: toAccountId, p_amount: Math.round((amount + Number.EPSILON) * 100) / 100,
        p_occurred_on: date, p_description: description, p_idempotency_key: String(body.idempotencyKey || ''),
      })
      if (error) throw error
      return res.status(201).json(data)
    }
    if (req.method === 'DELETE') {
      const id = String(req.body?.id || '')
      if (!id) return res.status(400).json({ error: 'Falta el identificador de la transferencia.' })
      const { data, error } = await supabase.rpc('cancel_account_transfer', { p_transfer_id: id })
      if (error) throw error
      return res.status(200).json({ success: true, transfer: data })
    }
    res.setHeader('Allow', 'GET, POST, DELETE')
    return res.status(405).json({ error: 'Método no permitido.' })
  } catch (error) {
    return sendApiError(res, error, 'No se pudo gestionar la transferencia.')
  }
}
