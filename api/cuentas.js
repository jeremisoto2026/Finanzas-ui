import { handleCors } from '../server/cors.js'
import { createAuthenticatedClient, sendApiError } from '../server/supabase.js'

function localTodayKey() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!['GET', 'PATCH'].includes(req.method)) {
    res.setHeader('Allow', 'GET, PATCH')
    return res.status(405).json({ error: 'Método no permitido.' })
  }

  res.setHeader('Cache-Control', 'no-store')
  try {
    const { supabase, user } = await createAuthenticatedClient(req)

    if (req.method === 'PATCH') {
      const body = req.body || {}
      const accountId = String(body.accountId || '').trim()
      const targetBalance = Number(body.balance)
      if (!accountId || body.balance === undefined || !Number.isFinite(targetBalance) || Math.abs(targetBalance) > 999999999999) {
        return res.status(400).json({ error: 'Indica una cuenta válida y un saldo real numérico.' })
      }

      const { data: account, error: accountError } = await supabase.from('accounts')
        .select('id, name, currency_code, opening_balance_date')
        .eq('user_id', user.id)
        .eq('id', accountId)
        .maybeSingle()
      if (accountError) throw accountError
      if (!account) return res.status(404).json({ error: 'No se encontró esa cuenta.' })

      const today = localTodayKey()
      const openingDate = account.opening_balance_date || '0001-01-01'
      const { data: ledger, error: ledgerError } = await supabase.from('transactions')
        .select('occurred_on, kind, amount')
        .eq('user_id', user.id)
        .eq('account_id', account.id)
        .eq('status', 'posted')
        .gte('occurred_on', openingDate)
        .lte('occurred_on', today)
      if (ledgerError) throw ledgerError

      const ledgerNet = (ledger || []).reduce((total, transaction) => {
        const amount = Number(transaction.amount || 0)
        if (transaction.kind === 'income' || transaction.kind === 'transfer_in') return total + amount
        if (transaction.kind === 'expense' || transaction.kind === 'transfer_out') return total - amount
        return total
      }, 0)
      const nextOpeningBalance = Math.round((targetBalance - ledgerNet + Number.EPSILON) * 100) / 100
      const { data: updatedAccount, error: updateError } = await supabase.from('accounts')
        .update({ opening_balance: nextOpeningBalance })
        .eq('user_id', user.id)
        .eq('id', account.id)
        .select('id, name, currency_code, opening_balance_date')
        .single()
      if (updateError) throw updateError

      return res.status(200).json({
        id: updatedAccount.id,
        name: updatedAccount.name,
        currencyCode: String(updatedAccount.currency_code || 'EUR').trim(),
        balance: Math.round((targetBalance + Number.EPSILON) * 100) / 100,
        openingBalanceDate: updatedAccount.opening_balance_date || null,
        lastMovementOn: (ledger || []).reduce((latest, item) => !latest || item.occurred_on > latest ? item.occurred_on : latest, null),
      })
    }

    const today = localTodayKey()
    const [accountsResult, transactionsResult] = await Promise.all([
      supabase
        .from('accounts')
        .select('id, name, currency_code, opening_balance, opening_balance_date')
        .eq('user_id', user.id)
        .order('name', { ascending: true }),
      supabase
        .from('transactions')
        .select('account_id, occurred_on, kind, amount')
        .eq('user_id', user.id)
        .eq('status', 'posted')
        .lte('occurred_on', today)
        .order('occurred_on', { ascending: false }),
    ])

    if (accountsResult.error) throw accountsResult.error
    if (transactionsResult.error) throw transactionsResult.error

    const transactionsByAccount = new Map()
    for (const transaction of transactionsResult.data || []) {
      if (!transactionsByAccount.has(transaction.account_id)) transactionsByAccount.set(transaction.account_id, [])
      transactionsByAccount.get(transaction.account_id).push(transaction)
    }

    return res.status(200).json((accountsResult.data || []).map((account) => {
      const openingDate = account.opening_balance_date || '0001-01-01'
      const ledger = (transactionsByAccount.get(account.id) || [])
        .filter((transaction) => transaction.occurred_on >= openingDate && transaction.occurred_on <= today)
      let balance = Number(account.opening_balance || 0)

      for (const transaction of ledger) {
        const amount = Number(transaction.amount || 0)
        if (transaction.kind === 'income' || transaction.kind === 'transfer_in') balance += amount
        if (transaction.kind === 'expense' || transaction.kind === 'transfer_out') balance -= amount
      }

      return {
        id: account.id,
        name: account.name,
        currencyCode: String(account.currency_code || 'EUR').trim(),
        balance: Math.round((balance + Number.EPSILON) * 100) / 100,
        openingBalanceDate: account.opening_balance_date || null,
        lastMovementOn: ledger[0]?.occurred_on || null,
      }
    }))
  } catch (error) {
    return sendApiError(res, error, 'No se pudieron cargar los saldos reales de tus cuentas.')
  }
}
