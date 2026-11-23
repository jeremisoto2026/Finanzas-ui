import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('el servidor local usa un puerto fijo y accesible en la red local', () => {
  const pkg = JSON.parse(read('package.json'))
  const vite = read('vite.config.js')
  assert.match(pkg.scripts.dev, /--host 0\.0\.0\.0/)
  assert.match(pkg.scripts.dev, /--port 5173/)
  assert.match(pkg.scripts.dev, /--strictPort/)
  assert.match(vite, /server: \{ host: '0\.0\.0\.0', port: 5173, strictPort: true \}/)
})

test('OAuth web devuelve al origen desde el que se inició sesión', () => {
  const auth = read('src/contexts/AuthContext.jsx')
  assert.match(auth, /options: \{ redirectTo: window\.location\.origin \}/)
})
