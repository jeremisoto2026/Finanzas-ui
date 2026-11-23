import test from 'node:test'
import assert from 'node:assert/strict'
import { handleCors } from '../server/cors.js'

function createResponse() {
  return {
    headers: {},
    statusCode: 200,
    ended: false,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value },
    status(code) { this.statusCode = code; return this },
    end() { this.ended = true },
  }
}

test('allows Capacitor Android origin and handles preflight', () => {
  const res = createResponse()
  const handled = handleCors({
    method: 'OPTIONS',
    headers: { origin: 'https://localhost' },
  }, res)

  assert.equal(handled, true)
  assert.equal(res.statusCode, 204)
  assert.equal(res.ended, true)
  assert.equal(res.headers['access-control-allow-origin'], 'https://localhost')
  assert.match(res.headers['access-control-allow-headers'], /Authorization/i)
})

test('does not reflect an unknown origin', () => {
  const res = createResponse()
  const handled = handleCors({
    method: 'GET',
    headers: { origin: 'https://untrusted.example' },
  }, res)

  assert.equal(handled, false)
  assert.equal(res.headers['access-control-allow-origin'], undefined)
})

test('allows the branch Preview web origin', () => {
  const res = createResponse()
  handleCors({
    method: 'GET',
    headers: { origin: 'https://finanzas-ui-preview.vercel.app' },
  }, res)

  assert.equal(res.headers['access-control-allow-origin'], 'https://finanzas-ui-preview.vercel.app')
})
