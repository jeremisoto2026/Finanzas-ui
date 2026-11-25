import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('crear un préstamo "Me deben" exige cuenta y registra un gasto atómico', async () => {
  const [page, api, migration] = await Promise.all([
    read('../src/pages/Deudas.jsx'),
    read('../api/deudas.js'),
    read('../supabase/migrations/20261125170000_debt_creation_account_ledger.sql'),
  ])
  assert.match(page, /Cuenta desde la que prestaste el dinero/)
  assert.match(page, /accountId: form\.direction === 'receivable' \? form\.accountId/)
  assert.match(api, /register_debt_creation/)
  assert.match(migration, /'expense', 'posted'/)
  assert.match(migration, /external_source, external_reference, idempotency_key/)
  assert.match(migration, /for update/)
})

test('el registro de cobros y pagos parciales sigue usando cuenta e idempotencia', async () => {
  const [page, migration] = await Promise.all([
    read('../src/pages/Deudas.jsx'),
    read('../supabase/migrations/20261116162500_financial_ledger_actions.sql'),
  ])
  assert.match(page, /Cuenta donde recibiste el dinero/)
  assert.match(page, /Cuenta desde la que realizaste el pago/)
  assert.match(page, /idempotencyKey: idempotencyKey\(debt\.id\)/)
  assert.match(migration, /register_debt_settlement/)
  assert.match(migration, /v_debt\.direction = 'receivable' then 'income'/)
  assert.match(migration, /else 'expense'::public\.transaction_kind/)
})
