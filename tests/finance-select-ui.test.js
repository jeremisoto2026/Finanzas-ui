import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const files = [
  'src/components/NativeReminderSettings.jsx',
  'src/components/NotificationSettings.jsx',
  'src/components/configuracion/FormularioCuotas.jsx',
  'src/components/configuracion/FormularioPagoFijo.jsx',
  'src/components/configuracion/CuotasDetalle.jsx',
  'src/components/configuracion/ListaPagosConfigurados.jsx',
  'src/components/dashboard/DashboardFinancieroUnificado.jsx',
  'src/components/dashboard/GraficoIngresos.jsx',
  'src/components/gastos/TablaGastos.jsx',
  'src/components/ingresos/TablaIngresos.jsx',
  'src/pages/Automatizaciones.jsx',
  'src/pages/CapturasAutomaticas.jsx',
  'src/pages/Compromisos.jsx',
  'src/pages/Configuracion.jsx',
  'src/pages/Cuentas.jsx',
  'src/pages/Deudas.jsx',
]

test('todos los desplegables de la interfaz financiera usan el selector reutilizable', () => {
  for (const path of files) {
    const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
    assert.ok(source.includes('<FinanceSelect'), `${path} debe usar FinanceSelect`)
    assert.equal(source.includes('<select'), false, `${path} todavía contiene un selector nativo sin estilizar`)
  }
})

test('el selector ofrece un menú oscuro con iconos y estado seleccionado', () => {
  const source = readFileSync(new URL('../src/components/ui/FinanceSelect.jsx', import.meta.url), 'utf8')
  assert.ok(source.includes('ICON_RULES'))
  assert.ok(source.includes('role="listbox"'))
  assert.ok(source.includes('aria-selected={selected}'))
  assert.ok(source.includes('finance-select-option-icon'))
  assert.ok(source.includes('finance-select-trigger'))
})
