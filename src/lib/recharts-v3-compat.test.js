import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const packageJson = JSON.parse(readFileSync(resolve(here, '../../package.json'), 'utf8'))
const chartFiles = [
  '../components/dashboard/GraficoGastos.jsx',
  '../components/dashboard/GraficoIngresos.jsx',
]

test('Recharts dependency uses major version 3', () => {
  assert.match(packageJson.dependencies.recharts, /^3\./)
})

test('dashboard charts do not use the removed activeIndex prop', () => {
  for (const file of chartFiles) {
    const source = readFileSync(resolve(here, file), 'utf8')
    assert.doesNotMatch(source, /\bactiveIndex\s*=\s*\{/, `${file} must not pass the removed activeIndex prop`)
  }
})
