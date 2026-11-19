import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getAccountMappingSuggestion,
  getAccountOptionLabel,
  getBankSourceLabel,
  isExactAccountNameMatch,
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
    { accountId: 'a', reason: 'matching', matchType: 'name' },
  )
  assert.deepEqual(
    getAccountMappingSuggestion(
      [{ id: 'a', name: 'Cuenta principal', institution: 'BBVA' }, { id: 'b', name: 'Revolut' }],
      [],
      'bbva',
      'BBVA',
    ),
    { accountId: 'a', reason: 'matching', matchType: 'institution' },
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
    { accountId: 'a', reason: 'matching', matchType: 'name' },
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
    { accountId: 'a', reason: 'matching', matchType: 'institution' },
  )
})

test('la coincidencia exacta del nombre ignora mayúsculas y espacios extra', () => {
  assert.equal(isExactAccountNameMatch({ name: '  rEvOlUt   ' }, 'Revolut'), true)
  assert.equal(isExactAccountNameMatch({ name: 'BBVA' }, '  bbva  '), true)
  assert.equal(isExactAccountNameMatch({ name: 'Cuenta Revolut' }, 'Revolut'), false)
  assert.equal(isExactAccountNameMatch({ name: 'Cuenta diaria', institution: 'Revolut' }, 'Revolut'), false)
})

test('prioriza el nombre exacto aunque otra cuenta coincida solo por institución', () => {
  assert.deepEqual(
    getAccountMappingSuggestion(
      [
        { id: 'exact', name: 'Revolut', institution: null },
        { id: 'institution', name: 'Cuenta diaria', institution: 'Revolut' },
      ],
      [],
      'revolut',
      'revolut',
    ),
    { accountId: 'exact', reason: 'matching', matchType: 'name' },
  )
})

test('la coincidencia por nombre funciona también con fuentes bancarias futuras', () => {
  const source = 'banco_nuevo'
  const sourceLabel = getBankSourceLabel(source)
  assert.equal(sourceLabel, 'Banco Nuevo')
  assert.equal(isExactAccountNameMatch({ name: ' BANCO   NUEVO ' }, sourceLabel), true)
  assert.deepEqual(
    getAccountMappingSuggestion(
      [{ id: 'future-bank', name: 'Banco Nuevo' }, { id: 'savings', name: 'Ahorros' }],
      [],
      source,
      sourceLabel,
    ),
    { accountId: 'future-bank', reason: 'matching', matchType: 'name' },
  )
})

test('normaliza etiquetas genéricas de fuentes bancarias', () => {
  assert.equal(getBankSourceLabel('banco_nuevo'), 'Banco Nuevo')
  assert.equal(getBankSourceLabel('banco-nuevo'), 'Banco-Nuevo')
})
