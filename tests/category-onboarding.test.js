import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const auth = readFileSync(new URL('../src/contexts/AuthContext.jsx', import.meta.url), 'utf8')

test('el primer acceso prepara categorías de gasto con IDs para las capturas bancarias', () => {
  assert.match(auth, /DEFAULT_EXPENSE_CATEGORIES/)
  assert.match(auth, /from\('categories'\)[\s\S]*?select\('id, name, direction'\)/)
  assert.match(auth, /\.insert\(missing\)/)
  assert.match(auth, /direction: normalizeCategoryName\(name\).*'both'/)
  assert.match(auth, /update\(\{ direction: 'both' \}\)/)
})
