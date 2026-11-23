import { handleCors } from '../server/cors.js'
import { createAuthenticatedClient, sendApiError } from '../server/supabase.js'

const ACCOUNT_TYPES = new Set([
  'bank',
  'cash',
  'debit_card',
  'credit_card',
  'digital_wallet',
  'savings',
  'other',
])

function localTodayKey() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function isDateOnly(value) {
  const text = String(value || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false
  const parsed = new Date(`${text}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text
}

function money(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
}

function accountBalance(account, transactions, today) {
  const openingDate = account.opening_balance_date || '0001-01-01'
  const ledger = (transactions || []).filter((transaction) =>
    transaction.account_id === account.id &&
    transaction.occurred_on >= openingDate &&
    transaction.occurred_on <= today
  )

  let balance = Number(account.opening_balance || 0)
  for (const transaction of ledger) {
    const amount = Number(transaction.amount || 0)
    if (transaction.kind === 'income' || transaction.kind === 'transfer_in') balance += amount
    if (transaction.kind === 'expense' || transaction.kind === 'transfer_out') balance -= amount
  }

  return {
    id: account.id,
    name: account.name,
    institution: account.institution || '',
    accountType: account.account_type || 'bank',
    currencyCode: String(account.currency_code || 'EUR').trim(),
    balance: money(balance),
    openingBalance: money(account.opening_balance),
    openingBalanceDate: account.opening_balance_date || null,
    lastMovementOn: ledger.reduce((latest, item) =>
      !latest || item.occurred_on > latest ? item.occurred_on : latest, null
    ),
    isActive: account.is_active !== false,
  }
}

async function getOwnedAccount(supabase, userId, accountId) {
  const { data, error } = await supabase.from('accounts')
    .select('id, name, institution, account_type, currency_code, opening_balance, opening_balance_date, is_active')
    .eq('user_id', userId)
    .eq('id', accountId)
    .maybeSingle()
  if (error) throw error
  return data
}

async function getAccountLedger(supabase, userId, accountId, openingDate, today) {
  const { data, error } = await supabase.from('transactions')
    .select('account_id, occurred_on, kind, amount')
    .eq('user_id', userId)
    .eq('account_id', accountId)
    .eq('status', 'posted')
    .gte('occurred_on', openingDate || '0001-01-01')
    .lte('occurred_on', today)
  if (error) throw error
  return data || []
}

export default async function handler(req, res) {
  if (handleCors(req, res)) return
  const method = req.method
  const isTransfersResource = req.query?.resource === 'transfers'
  if (!['GET', 'POST', 'PATCH'].includes(req.method) && !(isTransfersResource && ['GET', 'POST', 'DELETE'].includes(req.method))) {
    res.setHeader('Allow', 'GET, POST, PATCH')
    return res.status(405).json({ error: 'Método no permitido. Las cuentas se desactivan para conservar su historial.' })
  }

  res.setHeader('Cache-Control', 'no-store')
  try {
    const { supabase, user } = await createAuthenticatedClient(req)
    const today = localTodayKey()

    if (isTransfersResource) {
      if (req.method === 'GET') {
        const [{ data: rows, error }, { data: accounts, error: accountsError }, { data: entries, error: entriesError }] = await Promise.all([
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
        for (const entry of entries || []) {
          const list = statusMap.get(entry.transfer_id) || []
          list.push(entry.status)
          statusMap.set(entry.transfer_id, list)
        }
        return res.status(200).json((rows || []).map((row) => ({
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
        if (!fromAccountId || !toAccountId || fromAccountId === toAccountId || !Number.isFinite(amount) || amount <= 0 || !isDateOnly(date) || date > today) {
          return res.status(400).json({ error: 'Indica dos cuentas distintas, un importe positivo y una fecha válida.' })
        }
        const { data, error } = await supabase.rpc('create_account_transfer', {
          p_from_account_id: fromAccountId, p_to_account_id: toAccountId,
          p_amount: money(amount), p_occurred_on: date,
          p_description: String(body.description || '').trim() || null,
          p_idempotency_key: String(body.idempotencyKey || ''),
        })
        if (error) throw error
        return res.status(201).json(data)
      }
      if (method === 'DELETE') {
        const id = String(req.body?.id || '')
        if (!id) return res.status(400).json({ error: 'Falta el identificador de la transferencia.' })
        const { data, error } = await supabase.rpc('cancel_account_transfer', { p_transfer_id: id })
        if (error) throw error
        return res.status(200).json({ success: true, transfer: data })
      }
    }

    if (req.method === 'GET') {
      const [accountsResult, transactionsResult] = await Promise.all([
        supabase.from('accounts')
          .select('id, name, institution, account_type, currency_code, opening_balance, opening_balance_date, is_active')
          .eq('user_id', user.id)
          .order('name', { ascending: true }),
        supabase.from('transactions')
          .select('account_id, occurred_on, kind, amount')
          .eq('user_id', user.id)
          .eq('status', 'posted')
          .lte('occurred_on', today)
          .order('occurred_on', { ascending: false }),
      ])

      if (accountsResult.error) throw accountsResult.error
      if (transactionsResult.error) throw transactionsResult.error
      return res.status(200).json((accountsResult.data || []).map((account) =>
        accountBalance(account, transactionsResult.data || [], today)
      ))
    }

    if (req.method === 'POST') {
      const body = req.body || {}
      const name = String(body.name || '').trim()
      const institution = String(body.institution || '').trim() || null
      const accountType = String(body.accountType || 'bank')
      const currencyCode = String(body.currencyCode || 'EUR').trim().toUpperCase()
      const openingBalance = Number(body.openingBalance ?? 0)
      const openingBalanceDate = String(body.openingBalanceDate || today).slice(0, 10)

      if (!name) return res.status(400).json({ error: 'Escribe un nombre para la cuenta.' })
      if (!ACCOUNT_TYPES.has(accountType)) return res.status(400).json({ error: 'Selecciona un tipo de cuenta válido.' })
      if (!/^[A-Z]{3}$/.test(currencyCode)) return res.status(400).json({ error: 'La moneda debe ser un código de tres letras, por ejemplo EUR.' })
      if (!Number.isFinite(openingBalance) || Math.abs(openingBalance) > 999999999999) {
        return res.status(400).json({ error: 'El saldo inicial no es válido.' })
      }
      if (!isDateOnly(openingBalanceDate)) return res.status(400).json({ error: 'La fecha del saldo inicial no es válida.' })

      const { data, error } = await supabase.from('accounts').insert({
        user_id: user.id,
        name,
        institution,
        account_type: accountType,
        currency_code: currencyCode,
        opening_balance: money(openingBalance),
        opening_balance_date: openingBalanceDate,
        is_active: true,
      }).select('id, name, institution, account_type, currency_code, opening_balance, opening_balance_date, is_active').single()

      if (error?.code === '23505') return res.status(409).json({ error: 'Ya tienes una cuenta con ese nombre. Usa otro nombre para distinguirla.' })
      if (error) throw error
      return res.status(201).json(accountBalance(data, [], today))
    }

    const body = req.body || {}
    const accountId = String(body.accountId || body.id || '').trim()
    if (!accountId) return res.status(400).json({ error: 'Falta seleccionar la cuenta que quieres actualizar.' })

    const account = await getOwnedAccount(supabase, user.id, accountId)
    if (!account) return res.status(404).json({ error: 'No se encontró esa cuenta en tu espacio financiero.' })

    const patch = {}
    if (body.name !== undefined) {
      const name = String(body.name || '').trim()
      if (!name) return res.status(400).json({ error: 'El nombre de la cuenta no puede quedar vacío.' })
      patch.name = name
    }
    if (body.institution !== undefined) patch.institution = String(body.institution || '').trim() || null
    if (body.accountType !== undefined) {
      const accountType = String(body.accountType)
      if (!ACCOUNT_TYPES.has(accountType)) return res.status(400).json({ error: 'Selecciona un tipo de cuenta válido.' })
      patch.account_type = accountType
    }
    if (body.currencyCode !== undefined) {
      const currencyCode = String(body.currencyCode || '').trim().toUpperCase()
      if (!/^[A-Z]{3}$/.test(currencyCode)) return res.status(400).json({ error: 'La moneda debe ser un código de tres letras, por ejemplo EUR.' })
      if (currencyCode !== String(account.currency_code || 'EUR').trim().toUpperCase()) {
        const { count, error: movementCountError } = await supabase.from('transactions')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('account_id', account.id)
        if (movementCountError) throw movementCountError
        if ((count || 0) > 0) {
          return res.status(409).json({ error: 'No puedes cambiar la moneda de una cuenta con movimientos. Crea otra cuenta con la moneda correcta y conserva esta como histórica.' })
        }
        patch.currency_code = currencyCode
      }
    }
    if (body.isActive !== undefined) patch.is_active = Boolean(body.isActive)

    let ledger = []
    if (body.balance !== undefined) {
      const targetBalance = Number(body.balance)
      if (!Number.isFinite(targetBalance) || Math.abs(targetBalance) > 999999999999) {
        return res.status(400).json({ error: 'Introduce un saldo real numérico válido.' })
      }

      ledger = await getAccountLedger(supabase, user.id, account.id, account.opening_balance_date, today)
      const ledgerNet = ledger.reduce((total, transaction) => {
        const amount = Number(transaction.amount || 0)
        if (transaction.kind === 'income' || transaction.kind === 'transfer_in') return total + amount
        if (transaction.kind === 'expense' || transaction.kind === 'transfer_out') return total - amount
        return total
      }, 0)
      patch.opening_balance = money(targetBalance - ledgerNet)
    }

    if (!Object.keys(patch).length) return res.status(400).json({ error: 'No se han indicado cambios para guardar.' })
    patch.updated_at = new Date().toISOString()

    const { data, error } = await supabase.from('accounts')
      .update(patch)
      .eq('user_id', user.id)
      .eq('id', account.id)
      .select('id, name, institution, account_type, currency_code, opening_balance, opening_balance_date, is_active')
      .single()

    if (error?.code === '23505') return res.status(409).json({ error: 'Ya existe una cuenta con ese nombre.' })
    if (error) throw error

    if (!ledger.length) ledger = await getAccountLedger(supabase, user.id, account.id, data.opening_balance_date, today)
    return res.status(200).json(accountBalance(data, ledger, today))
  } catch (error) {
    return sendApiError(res, error, 'No se pudieron cargar o guardar las cuentas.')
  }
}
