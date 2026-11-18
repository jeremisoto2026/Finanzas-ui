import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')

test('el formulario de gastos exige una cuenta real elegida por id', () => {
  const source = read('src/components/gastos/TablaGastos.jsx')
  assert.match(source, /fetch\('\/api\/cuentas'/)
  assert.match(source, /required value=\{nuevoGasto\.cuentaId\}/)
  assert.match(source, /account\.id/)
  assert.match(source, /Selecciona una cuenta válida/)
  assert.doesNotMatch(source, /cuenta: 'Revolut'/)
})

test('el formulario de ingresos exige la cuenta receptora', () => {
  const source = read('src/components/ingresos/TablaIngresos.jsx')
  assert.match(source, /fetch\('\/api\/cuentas'/)
  assert.match(source, /required value=\{nuevoIngreso\.cuentaId\}/)
  assert.match(source, /Selecciona una cuenta válida/)
  assert.doesNotMatch(source, /cuenta: 'Revolut'/)
})

test('las API de gasto e ingreso validan la pertenencia de la cuenta', () => {
  for (const path of ['api/gastos.js', 'api/ingresos.js']) {
    const source = read(path)
    assert.match(source, /findOwnedAccountId\(supabase, user\.id, body\.cuentaId\)/)
  }
  const helper = read('server/supabase.js')
  assert.match(helper, /\.eq\('user_id', userId\)/)
  assert.match(helper, /\.eq\('id', id\)/)
})
