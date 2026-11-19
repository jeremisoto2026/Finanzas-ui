import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveSupabaseClientConfig } from '../src/lib/supabase-config.js'

const valid = {
  VITE_SUPABASE_URL: ' https://example.supabase.co/ ',
  VITE_SUPABASE_PUBLISHABLE_KEY: ' sb_publishable_example ',
}

test('normalizes Supabase client values supplied by Vite', () => {
  assert.deepEqual(resolveSupabaseClientConfig(valid), {
    url: 'https://example.supabase.co',
    publishableKey: 'sb_publishable_example',
  })
})

test('reports the missing Preview variables without printing their values', () => {
  assert.throws(
    () => resolveSupabaseClientConfig({}),
    /VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY/
  )
})

test('rejects malformed Supabase URLs', () => {
  assert.throws(
    () => resolveSupabaseClientConfig({ ...valid, VITE_SUPABASE_URL: 'not-a-url' }),
    /formato de URL válido/
  )
})

test('allows local Supabase development over localhost HTTP', () => {
  assert.equal(
    resolveSupabaseClientConfig({
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'eyJ.local.anon',
    }).url,
    'http://127.0.0.1:54321'
  )
})

test('rejects non-publishable keys instead of creating a broken client', () => {
  assert.throws(
    () => resolveSupabaseClientConfig({ ...valid, VITE_SUPABASE_PUBLISHABLE_KEY: 'secret-role-key' }),
    /no parece una clave publishable/
  )
})
