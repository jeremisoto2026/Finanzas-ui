import { handleCors } from '../server/cors.js'
import { createAuthenticatedClient, findOrCreateCategory, sendApiError } from '../server/supabase.js'

const allowed = {
  replenishment: ['open', 'partially_settled', 'settled'],
  planned_extra: ['open', 'settled', 'released'],
  historical_expense: ['recorded'],
}

function mapItem(row) {
  return {
    id: row.id,
    kind: row.item_kind,
    title: row.title,
    amount: Number(row.amount || 0),
    outstandingAmount: Number(row.outstanding_amount || 0),
    status: row.status,
    beneficiary: row.beneficiary || '',
    effectiveOn: row.effective_on || null,
    dueOn: row.due_on || null,
    notes: row.notes || '',
  }
}

function validateAmounts(amountValue, outstandingValue = 0) {
  const amount = Number(amountValue)
  const outstanding = Number(outstandingValue)
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('El importe debe ser mayor que cero.')
  if (!Number.isFinite(outstanding) || outstanding < 0 || outstanding > amount) throw new Error('El importe pendiente debe estar entre cero y el importe total.')
  return { amount, outstanding }
}

function reservationTodayKey() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

function reservationMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
}

function validReservationDate(value) {
  const text = String(value || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false
  const date = new Date(text + 'T00:00:00.000Z')
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text
}

async function getReservationAccount(supabase, userId, accountId) {
  if (!accountId) return null
  const { data, error } = await supabase.from('accounts')
    .select('id, name, currency_code, opening_balance, opening_balance_date, is_active')
    .eq('user_id', userId).eq('id', accountId).maybeSingle()
  if (error) throw error
  return data
}

async function getReservationAvailability(supabase, userId, account, excludingId = null) {
  const today = reservationTodayKey()
  const { data: movements, error: movementError } = await supabase.from('transactions')
    .select('kind, amount')
    .eq('user_id', userId).eq('account_id', account.id).eq('status', 'posted')
    .gte('occurred_on', account.opening_balance_date || '0001-01-01')
    .lte('occurred_on', today)
  if (movementError) throw movementError

  const balanceCents = Math.round(Number(account.opening_balance || 0) * 100) +
    (movements || []).reduce((sum, movement) => {
      const cents = Math.round(Number(movement.amount || 0) * 100)
      if (movement.kind === 'income' || movement.kind === 'transfer_in') return sum + cents
      if (movement.kind === 'expense' || movement.kind === 'transfer_out') return sum - cents
      return sum
    }, 0)

  let query = supabase.from('reservations')
    .select('id, amount').eq('user_id', userId).eq('account_id', account.id).eq('status', 'active')
  if (excludingId) query = query.neq('id', excludingId)
  const { data: activeRows, error } = await query
  if (error) throw error
  const reservedCents = (activeRows || []).reduce((sum, item) => sum + Math.round(Number(item.amount || 0) * 100), 0)
  return reservationMoney((balanceCents - reservedCents) / 100)
}

function mapReservationRow(row, accounts) {
  const account = accounts.get(row.account_id)
  return {
    id: row.id,
    accountId: row.account_id,
    accountName: account?.name || 'Cuenta no disponible',
    currencyCode: String(account?.currency_code || 'EUR').trim(),
    accountIsActive: account?.is_active !== false,
    name: row.name,
    amount: Number(row.amount || 0),
    status: row.status,
    reservedOn: row.reserved_on,
    notes: row.notes || '',
  }
}

async function handleReservations(req, res, supabase, user) {
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, PATCH, DELETE')
    return res.status(405).json({ error: 'Método no permitido.' })
  }

  if (req.method === 'GET') {
    const [{ data: rows, error }, { data: accounts, error: accountsError }] = await Promise.all([
      supabase.from('reservations')
        .select('id, account_id, name, amount, status, reserved_on, notes')
        .eq('user_id', user.id)
        .order('reserved_on', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase.from('accounts')
        .select('id, name, currency_code, is_active')
        .eq('user_id', user.id),
    ])
    if (error) throw error
    if (accountsError) throw accountsError
    const accountMap = new Map((accounts || []).map((account) => [account.id, account]))
    return res.status(200).json((rows || []).map((row) => mapReservationRow(row, accountMap)))
  }

  if (req.method === 'POST' || req.method === 'PATCH') {
    const body = req.body || {}
    const isUpdate = req.method === 'PATCH'
    if (isUpdate && !body.id) return res.status(400).json({ error: 'Falta el identificador de la reserva.' })

    let current = null
    if (isUpdate) {
      const { data, error } = await supabase.from('reservations')
        .select('id, account_id, name, amount, status, reserved_on, notes')
        .eq('user_id', user.id).eq('id', body.id).maybeSingle()
      if (error) throw error
      if (!data) return res.status(404).json({ error: 'No se encontró esa reserva.' })
      current = data
    }

    const name = body.name !== undefined ? String(body.name || '').trim() : current?.name
    const amount = body.amount !== undefined ? Number(body.amount) : Number(current?.amount || 0)
    const accountId = body.accountId !== undefined ? String(body.accountId || '').trim() : current?.account_id
    const reservedOn = body.reservedOn !== undefined ? String(body.reservedOn || '').slice(0, 10) : (current?.reserved_on || reservationTodayKey())
    const notes = body.notes !== undefined ? String(body.notes || '').trim() || null : (current?.notes || null)
    const status = body.status !== undefined ? body.status : (current?.status || 'active')

    if (!name) return res.status(400).json({ error: 'Escribe el concepto de la reserva.' })
    if (!Number.isFinite(amount) || amount <= 0 || amount > 999999999999) {
      return res.status(400).json({ error: 'El importe debe ser mayor que cero y válido.' })
    }
    if (!validReservationDate(reservedOn)) return res.status(400).json({ error: 'La fecha de la reserva no es válida.' })
    if (!['active', 'released'].includes(status)) return res.status(400).json({ error: 'El estado de la reserva no es válido.' })

    const account = await getReservationAccount(supabase, user.id, accountId)
    if (!account) return res.status(400).json({ error: 'Selecciona una cuenta válida de tu espacio financiero.' })
    if (status === 'active' && account.is_active === false) {
      return res.status(409).json({ error: 'No puedes reservar dinero en una cuenta desactivada.' })
    }

    if (status === 'active') {
      const available = await getReservationAvailability(supabase, user.id, account, current?.id || null)
      if (Math.round(amount * 100) > Math.round(available * 100)) {
        return res.status(409).json({
          error: `Solo tienes ${available.toFixed(2)} ${String(account.currency_code || 'EUR').trim()} libres en ${account.name}, después de las reservas activas.`,
        })
      }
    }

    const values = {
      user_id: user.id,
      account_id: account.id,
      name,
      amount: reservationMoney(amount),
      status,
      reserved_on: reservedOn,
      notes,
      updated_at: new Date().toISOString(),
    }
    const query = isUpdate
      ? supabase.from('reservations').update(values).eq('user_id', user.id).eq('id', current.id)
      : supabase.from('reservations').insert(values)
    const { data, error } = await query
      .select('id, account_id, name, amount, status, reserved_on, notes')
      .single()
    if (error) throw error

    const { data: accounts, error: accountsError } = await supabase.from('accounts')
      .select('id, name, currency_code, is_active').eq('user_id', user.id)
    if (accountsError) throw accountsError
    const accountMap = new Map((accounts || []).map((item) => [item.id, item]))
    return res.status(isUpdate ? 200 : 201).json(mapReservationRow(data, accountMap))
  }

  const { id } = req.body || {}
  if (!id) return res.status(400).json({ error: 'Falta el identificador de la reserva.' })
  const { data, error } = await supabase.from('reservations').delete()
    .eq('user_id', user.id).eq('id', id).select('id').maybeSingle()
  if (error) throw error
  if (!data) return res.status(404).json({ error: 'No se encontró esa reserva.' })
  return res.status(200).json({ success: true, id })
}

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  res.setHeader('Cache-Control', 'no-store')
  try {
    const { supabase, user } = await createAuthenticatedClient(req)
    if (req.query?.resource === 'reservations') return await handleReservations(req, res, supabase, user)

    if (req.method === 'GET') {
      const { data, error } = await supabase.from('financial_items')
        .select('id, item_kind, title, amount, outstanding_amount, status, beneficiary, effective_on, due_on, notes')
        .eq('user_id', user.id)
        .eq('item_kind', 'replenishment')
        .order('title', { ascending: true })
      if (error) throw error
      return res.status(200).json((data || []).map(mapItem))
    }

    if (req.method === 'POST' && req.body?.action === 'settle') {
      const body = req.body
      if (!body.id || !body.accountId || !body.idempotencyKey) {
        return res.status(400).json({ error: 'Selecciona la reposición, la cuenta y confirma la operación.' })
      }
      const amount = Number(body.amount)
      const occurredOn = String(body.occurredOn || '').slice(0, 10)
      if (!Number.isFinite(amount) || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) {
        return res.status(400).json({ error: 'Indica un importe válido y la fecha en que recibiste el dinero.' })
      }
      const categoryId = await findOrCreateCategory(supabase, user.id, 'Reposiciones', 'income')
      const { data: settlement, error: settlementError } = await supabase.rpc('register_replenishment', {
        p_item_id: body.id,
        p_account_id: body.accountId,
        p_amount: amount,
        p_occurred_on: occurredOn,
        p_idempotency_key: body.idempotencyKey,
        p_category_id: categoryId,
      })
      if (settlementError) throw settlementError
      const { data: updatedItem, error: updateError } = await supabase.from('financial_items')
        .select('id, item_kind, title, amount, outstanding_amount, status, beneficiary, effective_on, due_on, notes')
        .eq('id', body.id).eq('user_id', user.id).single()
      if (updateError) throw updateError
      return res.status(200).json({
        success: true,
        item: mapItem(updatedItem),
        transactionId: settlement?.transactionId || null,
        alreadyRecorded: Boolean(settlement?.alreadyRecorded),
      })
    }

    if (req.method === 'POST' || req.method === 'PATCH') {
      const body = req.body || {}
      if (req.method === 'PATCH' && !body.id) return res.status(400).json({ error: 'Falta el identificador del compromiso.' })

      let current = null
      if (req.method === 'PATCH') {
        const { data, error } = await supabase.from('financial_items')
          .select('id, item_kind, title, amount, outstanding_amount, status')
          .eq('id', body.id).eq('user_id', user.id).maybeSingle()
        if (error) throw error
        if (!data) return res.status(404).json({ error: 'No se encontró el compromiso.' })
        current = data
      }

      const kind = req.method === 'POST' ? body.kind : current.item_kind
      if (!allowed[kind]) return res.status(400).json({ error: 'Tipo de compromiso no válido.' })
      const patch = {}

      if (req.method === 'POST' || body.title !== undefined) {
        const title = String(body.title || '').trim()
        if (!title) return res.status(400).json({ error: 'Indica un título para el compromiso.' })
        patch.title = title
      }

      const amount = body.amount !== undefined ? Number(body.amount) : Number(current?.amount || 0)
      const outstanding = body.outstandingAmount !== undefined
        ? Number(body.outstandingAmount)
        : req.method === 'POST'
          ? (kind === 'historical_expense' ? 0 : amount)
          : Number(current?.outstanding_amount || 0)
      if (req.method === 'POST' || body.amount !== undefined) {
        if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'El importe debe ser mayor que cero.' })
        patch.amount = amount
      }
      if (req.method === 'POST' || body.outstandingAmount !== undefined || body.amount !== undefined) {
        if (!Number.isFinite(outstanding) || outstanding < 0 || outstanding > amount) {
          return res.status(400).json({ error: 'El importe pendiente debe estar entre cero y el importe total.' })
        }
        patch.outstanding_amount = outstanding
      }

      if (body.beneficiary !== undefined || req.method === 'POST') patch.beneficiary = String(body.beneficiary || '').trim() || null
      if (body.effectiveOn !== undefined || req.method === 'POST') patch.effective_on = body.effectiveOn || null
      if (body.dueOn !== undefined || req.method === 'POST') patch.due_on = body.dueOn || null
      if (body.notes !== undefined || req.method === 'POST') patch.notes = String(body.notes || '').trim() || null

      if (body.status !== undefined || req.method === 'POST') {
        const defaultStatus = {
          replenishment: 'open',
          planned_extra: 'open',
          historical_expense: 'recorded',
        }[kind]
        const status = body.status || defaultStatus
        if (!allowed[kind].includes(status)) return res.status(400).json({ error: 'El estado no corresponde al tipo de compromiso.' })
        patch.status = status
        if (['settled', 'released', 'recorded'].includes(status) && body.outstandingAmount === undefined) {
          patch.outstanding_amount = 0
        }
      } else if (patch.outstanding_amount !== undefined) {
        if (kind === 'reserve') patch.status = patch.outstanding_amount === 0 ? 'released' : 'reserved'
        else if (kind === 'replenishment') patch.status = patch.outstanding_amount === 0 ? 'settled' : patch.outstanding_amount < amount ? 'partially_settled' : 'open'
        else if (kind === 'planned_extra') patch.status = patch.outstanding_amount === 0 ? 'settled' : 'open'
      }

      const query = req.method === 'POST'
        ? supabase.from('financial_items').insert({ user_id: user.id, item_kind: kind, ...patch })
        : supabase.from('financial_items').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', body.id).eq('user_id', user.id)
      const { data, error } = await query
        .select('id, item_kind, title, amount, outstanding_amount, status, beneficiary, effective_on, due_on, notes')
        .single()
      if (error) throw error
      return res.status(req.method === 'POST' ? 201 : 200).json(mapItem(data))
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {}
      if (!id) return res.status(400).json({ error: 'Falta el identificador del compromiso.' })
      const { data, error } = await supabase.from('financial_items').delete()
        .eq('id', id).eq('user_id', user.id).select('id').maybeSingle()
      if (error) throw error
      if (!data) return res.status(404).json({ error: 'No se encontró el compromiso.' })
      return res.status(200).json({ success: true, id })
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE')
    return res.status(405).json({ error: 'No se pudieron cargar o actualizar los compromisos.' })
  } catch (error) {
    return sendApiError(res, error, 'No se pudieron cargar o actualizar los compromisos.')
  }
}
