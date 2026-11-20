import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from '../src/lib/category-catalog.js'
import { normalizeCategoryName, uniqueCategoryNames } from '../src/lib/category-utils.js'

test('los catálogos base distinguen categorías de gasto e ingreso y no repiten nombres', () => {
  assert.ok(DEFAULT_EXPENSE_CATEGORIES.includes('Alimentación'))
  assert.ok(DEFAULT_EXPENSE_CATEGORIES.includes('Transporte'))
  assert.ok(DEFAULT_INCOME_CATEGORIES.includes('Nómina'))
  assert.ok(DEFAULT_INCOME_CATEGORIES.includes('Cobros de préstamos'))
  assert.equal(uniqueCategoryNames(DEFAULT_EXPENSE_CATEGORIES).length, DEFAULT_EXPENSE_CATEGORIES.length)
  assert.equal(uniqueCategoryNames(DEFAULT_INCOME_CATEGORIES).length, DEFAULT_INCOME_CATEGORIES.length)
})

test('la normalización de nombres coincide con la unicidad de base de datos', () => {
  assert.equal(normalizeCategoryName('  ALIMENTACIÓN  '), 'alimentación')
  assert.equal(normalizeCategoryName('Alimentación'), normalizeCategoryName('Alimentación'))
  assert.notEqual(normalizeCategoryName('Educación'), normalizeCategoryName('Educacion'))
})

test('la lista combinada conserva etiquetas y elimina duplicados por mayúsculas y espacios', () => {
  assert.deepEqual(
    uniqueCategoryNames(['Alimentación', ' alimentación ', 'ALIMENTACIÓN', 'Hogar', 'Hogar', '', null]),
    ['Alimentación', 'Hogar']
  )
})
