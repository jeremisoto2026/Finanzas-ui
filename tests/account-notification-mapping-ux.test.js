import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getAccountMappingSuggestion,
  getAccountOptionLabel,
} from '../src/lib/account-notification-mapping.js'

test('el selector evita repetir la institución si coincide con la cuenta o la app', () => {
  assert.equal(
    getAccountOptionLabel({ name: 'Revolut', institution: 'Revolut' }, 'Revolut'),
    'Revolut',
  )
  assert.equal(
    getAccountOptionLabel({ name: 'Cuenta diaria', institution: 'Revolut' }, 'Revolut'),
    'Cuenta diaria',
  )
  assert.equal(
    getAccountOptionLabel({ name: 'Revolut', institution: 'Revolut Bank UAB' }, 'Revolut'),
    'Revolut',
  )
  assert.equal(
    getAccountOptionLabel({ name: 'BBVA', institution: 'BBVA' }, 'BBVA'),
    'BBVA',
  )
  assert.equal(
    getAccountOptionLabel({ name: 'Cuenta de ahorros', institution: 'BBVA' }, 'Revolut'),
    'Cuenta de ahorros · BBVA',
  )
})

test('conserva la cuenta ya vinculada cuando sigue activa', () => {
  assert.deepEqual(
    getAccountMappingSuggestion(
      [{ id: 'a', name: 'Cuenta diaria' }, { id: 'b', name: 'Revolut' }],
      [{ source_app: 'revolut', account_id: 'a', is_active: true }],
      'revolut',
      'Revolut',
    ),
    { accountId: 'a', reason: 'existing' },
  )
})

test('preselecciona una cuenta cuyo nombre o institución coincide con la app', () => {
  assert.deepEqual(
    getAccountMappingSuggestion(
      [{ id: 'a', name: 'Revolut', institution: 'Revolut' }, { id: 'b', name: 'BBVA' }],
      [],
      'revolut',
      'Revolut',
    ),
    { accountId: 'a', reason: 'matching' },
  )
  assert.deepEqual(
    getAccountMappingSuggestion(
      [{ id: 'a', name: 'Cuenta principal', institution: 'BBVA' }, { id: 'b', name: 'Revolut' }],
      [],
      'bbva',
      'BBVA',
    ),
    { accountId: 'a', reason: 'matching' },
  )
})

test('preselecciona la única cuenta activa disponible', () => {
  assert.deepEqual(
    getAccountMappingSuggestion([{ id: 'only', name: 'Mi cuenta' }], [], 'revolut', 'Revolut'),
    { accountId: 'only', reason: 'single' },
  )
})

test('no adivina entre varias cuentas si no hay una coincidencia única', () => {
  assert.deepEqual(
    getAccountMappingSuggestion(
      [{ id: 'a', name: 'Cuenta diaria' }, { id: 'b', name: 'Ahorros' }],
      [],
      'revolut',
      'Revolut',
    ),
    { accountId: '', reason: 'choose' },
  )
  assert.deepEqual(
    getAccountMappingSuggestion(
      [{ id: 'a', name: 'Revolut' }, { id: 'b', name: 'Revolut ahorro', institution: 'Revolut' }],
      [],
      'revolut',
      'Revolut',
    ),
    { accountId: '', reason: 'ambiguous' },
  )
})

test('la comparación de instituciones tolera espacios y diferencias de mayúsculas', () => {
  assert.equal(
    getAccountOptionLabel({ name: 'Mi cuenta', institution: '  REVOLUT   ' }, 'Revolut'),
    'Mi cuenta',
  )
  assert.deepEqual(
    getAccountMappingSuggestion(
      [{ id: 'a', name: 'Cuenta diaria', institution: '  REVOLUT   ' }],
      [],
      'revolut',
      'Revolut',
    ),
    { accountId: 'a', reason: 'matching' },
  )
})
