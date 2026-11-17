import { createAuthenticatedClient, sendApiError } from '../server/supabase.js'

function normalizeCategoryName(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  try {
    const { supabase, user } = await createAuthenticatedClient(req)
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      return res.status(405).json({ error: 'Método no permitido.' })
    }

    const direction = req.query?.direction === 'income' ? 'income' : 'expense'
    const { data, error } = await supabase
      .from('categories')
      .select('name')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .in('direction', [direction, 'both'])
      .order('name', { ascending: true })

    if (error) throw error

    const seen = new Set()
    const categories = []
    for (const row of data || []) {
      const name = String(row.name || '').trim().replace(/\s+/g, ' ')
      const key = normalizeCategoryName(name)
      if (!name || seen.has(key)) continue
      seen.add(key)
      categories.push(name)
    }

    return res.status(200).json(categories)
  } catch (error) {
    return sendApiError(res, error, 'No se pudieron cargar las categorías.')
  }
}
