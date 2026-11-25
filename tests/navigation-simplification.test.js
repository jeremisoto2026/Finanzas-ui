import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')

test('la navegación separa movimientos, planificación, deudas y reservas', () => {
  const sidebar = read('src/components/layout/Sidebar.jsx')
  const layout = read('src/components/layout/Layout.jsx')
  assert.match(sidebar, /label: 'Movimientos'/)
  assert.match(sidebar, /name: 'Deudas y reposiciones'/)
  assert.match(sidebar, /name: 'Reservas'/)
  assert.doesNotMatch(sidebar, /name: 'Compromisos'/)
  assert.match(layout, /activePage === 'Deudas y reposiciones'/)
  assert.match(layout, /activePage === 'Reservas'/)
})

test('presupuestos y reservas tienen efectos diferentes', () => {
  const settings = read('src/pages/Configuracion.jsx')
  const dashboard = read('src/components/dashboard/DineroDisponible.jsx')
  const commitments = read('src/pages/Compromisos.jsx')
  assert.match(settings, /No aparta dinero, no modifica el saldo de una cuenta ni genera un movimiento/)
  assert.match(dashboard, /no aparta dinero ni reduce tu saldo libre/)
  assert.match(commitments, /Reposiciones y dinero adelantado/)
  assert.doesNotMatch(commitments, /ReservasPanel/)
})

test('la configuración de capturas y su revisión tienen un único centro', () => {
  const automation = read('src/pages/Automatizaciones.jsx')
  const captures = read('src/pages/CapturasAutomaticas.jsx')
  assert.match(automation, /reglas de los comercios/i)
  assert.match(automation, /Compras pendientes/)
  assert.doesNotMatch(automation, /Permisos Android/)
  assert.match(captures, /permisos de Android y las cuentas vinculadas/)
})
