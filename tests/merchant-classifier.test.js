import test from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyKnownMerchant,
  classifyOsmTags,
  merchantKeyFromName,
  normalizeMerchantName,
  normalizeOsmResult,
} from '../src/lib/merchant-classifier.js'

const categories = [
  'Alimentación',
  'Hogar',
  'Ocio',
  'Otros',
  'Perro',
  'Salud e higiene',
  'Servicios',
  'Servicios legales',
  'Tecnología',
  'Telefonía',
]

test('normaliza sucursales y texto de pago sin alterar el nombre comercial', () => {
  assert.equal(normalizeMerchantName('MERCADONA 0421 TPV'), 'MERCADONA')
  assert.equal(merchantKeyFromName('Mercadona 0421'), 'MERCADONA')
})

test('clasifica supermercados como Alimentación con confianza alta', () => {
  const result = classifyOsmTags({ shop: 'supermarket' }, categories)
  assert.equal(result.category, 'Alimentación')
  assert.equal(result.requiresConfirmation, false)
  assert.ok(result.confidence >= 0.9)
})

test('utiliza la clasificación principal class/type de Nominatim aunque falten extratags', () => {
  const result = normalizeOsmResult({
    name: 'Consum',
    class: 'shop',
    type: 'supermarket',
    osm_type: 'way',
    osm_id: 124,
  }, categories)
  assert.equal(result.category, 'Alimentación')
  assert.equal(result.requiresConfirmation, false)
})

test('clasifica farmacias sin inventar categorías', () => {
  const result = classifyOsmTags({ amenity: 'pharmacy' }, categories)
  assert.equal(result.category, 'Salud e higiene')
})

test('no asigna una categoría que no existe en la cuenta', () => {
  const result = classifyOsmTags({ amenity: 'fuel' }, categories)
  assert.equal(result.category, 'Otros')
  assert.equal(result.requiresConfirmation, true)
})

test('un comercio de restauración requiere revisión', () => {
  const result = classifyOsmTags({ amenity: 'restaurant' }, categories)
  assert.equal(result.category, 'Ocio')
  assert.equal(result.requiresConfirmation, true)
})

test('reconoce cadenas habituales solo cuando existe la categoría correspondiente', () => {
  const result = classifyKnownMerchant('LIDL 1234', categories)
  assert.equal(result.category, 'Alimentación')
  assert.equal(result.matchedBy, 'known-merchant')
  assert.equal(classifyKnownMerchant('LIDL 1234', ['Otros']), null)
})

test('normaliza los datos útiles devueltos por OpenStreetMap', () => {
  const result = normalizeOsmResult({
    name: 'Mercadona',
    display_name: 'Mercadona, Valencia, España',
    class: 'shop',
    type: 'supermarket',
    extratags: { shop: 'supermarket' },
    osm_type: 'way',
    osm_id: 123,
  }, categories)

  assert.equal(result.name, 'Mercadona')
  assert.equal(result.displayName, 'Mercadona, Valencia, España')
  assert.equal(result.category, 'Alimentación')
  assert.equal(result.osmType, 'way')
})
