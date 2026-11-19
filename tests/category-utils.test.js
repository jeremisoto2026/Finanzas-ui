import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeCategoryName, uniqueCategoryNames } from '../src/lib/category-utils.js'

test('normaliza mayúsculas, espacios y formato Unicode de una categoría', () => {
  assert.equal(normalizeCategoryName('  ALIMENTACIÓN  '), 'alimentación')
  assert.equal(normalizeCategoryName('Alimentación'), normalizeCategoryName('Alimentación'))
})

test('elimina categorías repetidas y conserva una etiqueta legible', () => {
  assert.deepEqual(
    uniqueCategoryNames(['Alimentación', ' alimentación ', 'ALIMENTACIÓN', 'Hogar', 'Hogar', '', null]),
    ['Alimentación', 'Hogar']
  )
})
