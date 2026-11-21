import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')

test('Expense and income history display the linked account clearly on responsive tables', () => {
  const expenses = read('src/components/gastos/TablaGastos.jsx')
  const incomes = read('src/components/ingresos/TablaIngresos.jsx')
  const finance = read('server/finance.js')
  const expenseApi = read('api/gastos.js')
  const incomeApi = read('api/ingresos.js')

  assert.match(expenses, /Cuenta de salida/)
  assert.match(expenses, /gasto\.cuenta/)
  assert.match(expenses, /Sin cuenta registrada/)
  assert.match(expenses, /overflow-x-auto overscroll-x-contain/)
  assert.match(expenses, /min-w-\[1040px\]/)
  assert.match(expenses, /Desliza horizontalmente para consultar todas las columnas/)
  assert.match(expenses, /colSpan=\{8\}/)

  assert.match(incomes, /Cuenta de entrada/)
  assert.match(incomes, /ingreso\.cuenta/)
  assert.match(incomes, /Sin cuenta registrada/)
  assert.match(incomes, /overflow-x-auto overscroll-x-contain/)
  assert.match(incomes, /min-w-\[1040px\]/)
  assert.match(incomes, /sm:hidden/)

  assert.match(finance, /cuenta: row\.accounts\?\.name \|\| ''/)
  assert.match(finance, /cuentaId: row\.account_id \|\| null/)
  assert.match(expenseApi, /accounts\(name\)/)
  assert.match(incomeApi, /accounts\(name\)/)
})
