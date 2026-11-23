export function normalizeCategoryName(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('es-ES')
}

export function uniqueCategoryNames(values = []) {
  const categories = []
  const seen = new Set()

  for (const value of values) {
    const label = String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ')
    const key = normalizeCategoryName(label)
    if (!label || seen.has(key)) continue
    seen.add(key)
    categories.push(label)
  }

  return categories.sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
}
