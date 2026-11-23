import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('los endpoints exponen catálogos separados por dirección y categorías activas', () => {
  const expenses = read('api/gastos.js')
  const incomes = read('api/ingresos.js')
  assert.match(expenses, /DEFAULT_EXPENSE_CATEGORIES/)
  assert.match(expenses, /in\('direction', \['expense', 'both'\]\)/)
  assert.match(incomes, /req\.query\?\.resource === 'categories'/)
  assert.match(incomes, /DEFAULT_INCOME_CATEGORIES/)
  assert.match(incomes, /in\('direction', \['income', 'both'\]\)/)
})

test('el formulario de ingresos y sus filtros usan el mismo catálogo dinámico', () => {
  const source = read('src/components/ingresos/TablaIngresos.jsx')
  assert.match(source, /fetch\('\/api\/ingresos\?resource=categories'/)
  assert.match(source, /uniqueCategoryNames\(\[/)
  assert.match(source, /categoriasDisponibles\.map\(\(categoria\)/)
  assert.doesNotMatch(source, /<optgroup label="Ingresos habituales">/)
})

test('al reutilizar una categoría en ingresos y gastos se amplía a ambas direcciones', () => {
  const api = read('server/supabase.js')
  const edge = read('supabase/functions/finance-management-write/index.ts')
  assert.match(api, /update\(\{ direction: 'both' \}\)/)
  assert.match(edge, /update\(\{ direction: "both" \}\)/)
  assert.match(api, /select\('id, name, direction'\)/)
  assert.match(edge, /select\("id, name, direction"\)/)
})
