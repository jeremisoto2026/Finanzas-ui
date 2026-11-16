import { createAuthenticatedClient, findOrCreateCategory, findOrCreateAccount, sendApiError } from '../server/supabase.js'
import { transactionForUi } from '../server/finance.js'

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  try {
    const { supabase, user } = await createAuthenticatedClient(req)

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('transactions')
        .select('id, account_id, amount, occurred_on, description, payment_method, categories(name), accounts(name)')
        .eq('kind', 'expense')
        .eq('status', 'posted')
        .order('occurred_on', { ascending: false })

      if (error) throw error
      return res.status(200).json((data || []).map(transactionForUi))
    }

    if (req.method === 'POST') {
      const body = req.body || {}
      const description = String(body.concepto || '').trim()
      const amount = Number(body.monto)
      const occurredOn = String(body.fecha || '').slice(0, 10)
      if (!description || !Number.isFinite(amount) || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) {
        return res.status(400).json({ error: 'Indica concepto, importe positivo y fecha válida.' })
      }

      const categoryId = await findOrCreateCategory(supabase, user.id, body.categoria || 'Otros', 'expense')
      const accountId = await findOrCreateAccount(supabase, user.id, body.cuenta || 'Revolut')
      const { data, error } = await supabase.from('transactions').insert({
        user_id: user.id,
        account_id: accountId,
        category_id: categoryId,
        kind: 'expense',
        status: 'posted',
        amount,
        occurred_on: occurredOn,
        description,
        payment_method: body.metodo || null,
        idempotency_key: body.idempotencyKey || null,
      }).select('id, amount, occurred_on, description, payment_method, categories(name), accounts(name)').single()

      if (error) throw error
      return res.status(201).json(transactionForUi(data))
    }

    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Método no permitido.' })
  } catch (error) {
    return sendApiError(res, error, 'No se pudieron cargar o guardar los gastos.')
  }
}
