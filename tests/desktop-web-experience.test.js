import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('desktop shell exposes all finance areas in a grouped persistent sidebar', () => {
  const sidebar = read('src/components/layout/Sidebar.jsx')
  const layout = read('src/components/layout/Layout.jsx')

  for (const item of [
    'Dashboard',
    'Gastos',
    'Ingresos',
    'Cuentas',
    'Gestión financiera',
    'Deudas y reposiciones',
    'Reservas',
    'Compras pendientes',
    'Recordatorios',
    'Ajustes',
  ]) {
    assert.ok(sidebar.includes("name: '" + item + "'"), 'Desktop navigation is missing ' + item)
  }

  assert.match(sidebar, /lg:sticky/)
  assert.match(sidebar, /lg:flex/)
  assert.match(layout, /app-bottom-nav lg:hidden/)
  assert.match(layout, /app-shell min-h-screen text-slate-100 lg:flex/)
})

test('web first-login onboarding is separate from Android-only permission onboarding', () => {
  const onboarding = read('src/components/FirstLoginWebSetup.jsx')
  const auth = read('src/contexts/AuthContext.jsx')

  assert.match(onboarding, /finanzas:first-login-web-notifications:v1:/)
  assert.match(onboarding, /Configura tus avisos en el ordenador/)
  assert.match(onboarding, /las capturas automáticas[\s\S]*Android/)
  assert.match(onboarding, /Continuar sin activar ahora/)
  assert.match(auth, /<FirstLoginWebSetup userId=\{user.id\} \/>/)
})

test('browser push subscription is initiated by user action and uses the shared subscriptions table', () => {
  const helper = read('src/lib/web-push-setup.js')
  const onboarding = read('src/components/FirstLoginWebSetup.jsx')

  assert.match(helper, /Notification\.requestPermission\(\)/)
  assert.match(helper, /navigator\.serviceWorker\.register\('\/sw\.js'/)
  assert.match(helper, /pushManager\.subscribe/)
  assert.match(helper, /from\('push_subscriptions'\)/)
  assert.match(onboarding, /const activate = async \(\) => \{[\s\S]*enableBrowserPush\(userId\)/)
})

test('desktop responsive styles preserve mobile navigation and prevent global horizontal overflow', () => {
  const css = read('src/index.css')
  const layout = read('src/components/layout/Layout.jsx')

  assert.match(css, /body \{[\s\S]*overflow-x: hidden/)
  assert.match(css, /@media \(min-width: 1024px\)/)
  assert.match(css, /\.app-sidebar[\s\S]*height: 100dvh/)
  assert.match(css, /\.app-bottom-nav[\s\S]*position: fixed/)
  assert.match(layout, /max-w-\[1760px\]/)
})
