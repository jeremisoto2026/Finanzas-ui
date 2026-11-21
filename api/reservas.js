import { handleCors } from '../server/cors.js'
import { createAuthenticatedClient, sendApiError } from '../server/supabase.js'

function todayKey() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

function money(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
}

function validDate(value) {
  const text = String(value || '').slice(0, 10)
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(text)) return false
  const date = new Date(text + 'T00:00:00.000Z')
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text
}

async function getOwnedAccount(supabase, userId, accountId) {
  if (!accountId) return null
  const { data, error } = await supabase.from('accounts')
    .select('id, name, currency_code, opening_balance, opening_balance_date, is_active')
    .eq('user_id', userId).eq('id', accountId).maybeSingle()
  if (error) throw error
  return data
}

async function getAccountAvailability(supabase, userId, account, excludingId = null) {
  const today = todayKey()
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

  let reservationsQuery = supabase.from('reservations')
    .select('id, amount').eq('user_id', userId).eq('account_id', account.id).eq('status', 'active')
  if (excludingId) reservationsQuery = reservationsQuery.neq('id', excludingId)
  const { data: reservations, error: reservationError } = await reservationsQuery
  if (reservationError) throw reservationError

  const alreadyReservedCents = (reservations || []).reduce((sum, item) => sum + Math.round(Number(item.amount || 0) * 100), 0)
  return { balance: money(balanceCents / 100), available: money((balanceCents - alreadyReservedCents) / 100) }
}

function mapReservation(row, accounts) {
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

export default async function handler(req, res) {
  if (handleCors(req, res)) return
  res.setHeader('Cache-Control', 'no-store')
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, PATCH, DELETE')
    return res.status(405).json({ error: 'Método no permitido.' })
  }

  try {
    const { supabase, user } = await createAuthenticatedClient(req)

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
      return res.status(200).json((rows || []).map((row) => mapReservation(row, accountMap)))
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
      const reservedOn = body.reservedOn !== undefined ? String(body.reservedOn || '').slice(0, 10) : (current?.reserved_on || todayKey())
      const notes = body.notes !== undefined ? String(body.notes || '').trim() || null : (current?.notes || null)
      const status = body.status !== undefined ? body.status : (current?.status || 'active')

      if (!name) return res.status(400).json({ error: 'Escribe el concepto de la reserva.' })
      if (!Number.isFinite(amount) || amount <= 0 || amount > 999999999999) {
        return res.status(400).json({ error: 'El importe debe ser mayor que cero y válido.' })
      }
      if (!validDate(reservedOn)) return res.status(400).json({ error: 'La fecha de la reserva no es válida.' })
      if (!['active', 'released'].includes(status)) return res.status(400).json({ error: 'El estado de la reserva no es válido.' })

      const account = await getOwnedAccount(supabase, user.id, accountId)
      if (!account) return res.status(400).json({ error: 'Selecciona una cuenta válida de tu espacio financiero.' })
      if (status === 'active' && account.is_active === false) {
        return res.status(409).json({ error: 'No puedes reservar dinero en una cuenta desactivada.' })
      }

      if (status === 'active') {
        const availability = await getAccountAvailability(supabase, user.id, account, current?.id || null)
        if (Math.round(amount * 100) > Math.round(availability.available * 100)) {
          return res.status(409).json({
            error: `Solo tienes ${availability.available.toFixed(2)} ${String(account.currency_code || 'EUR').trim()} libres en ${account.name}, después de las reservas activas.`,
          })
        }
      }

      const values = {
        user_id: user.id,
        account_id: account.id,
        name,
        amount: money(amount),
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
      return res.status(isUpdate ? 200 : 201).json(mapReservation(data, accountMap))
    }

    const { id } = req.body || {}
    if (!id) return res.status(400).json({ error: 'Falta el identificador de la reserva.' })
    const { data, error } = await supabase.from('reservations').delete()
      .eq('user_id', user.id).eq('id', id).select('id').maybeSingle()
    if (error) throw error
    if (!data) return res.status(404).json({ error: 'No se encontró esa reserva.' })
    return res.status(200).json({ success: true, id })
  } catch (error) {
    return sendApiError(res, error, 'No se pudieron cargar o guardar las reservas.')
  }
}
