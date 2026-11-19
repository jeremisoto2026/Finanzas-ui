import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')

test('Android Gradle project links the native LocalNotifications module', () => {
  const settings = read('android/settings.gradle.kts')
  const appGradle = read('android/app/build.gradle.kts')
  const packageJson = JSON.parse(read('package.json'))

  assert.equal(packageJson.dependencies['@capacitor/local-notifications'], '8.3.0')
  assert.match(settings, /include\(\s*":capacitor-local-notifications"\s*\)/)
  assert.match(settings, /capacitor-local-notifications.*node_modules\/@capacitor\/local-notifications\/android/)
  assert.match(appGradle, /implementation\(project\(":capacitor-local-notifications"\)\)/)
})

test('Android manifest requests the runtime notification permission', () => {
  const manifest = read('android/app/src/main/AndroidManifest.xml')
  assert.match(manifest, /android\.permission\.POST_NOTIFICATIONS/)
})

test('Capacitor injects CSS edge-to-edge insets and viewport fit', () => {
  const config = JSON.parse(read('capacitor.config.json'))
  const mainActivity = read('android/app/src/main/java/com/finanzas/companion/MainActivity.kt')
  const styles = read('src/styles/globals.css')

  assert.equal(config.plugins.SystemBars.insetsHandling, 'css')
  assert.equal(config.plugins.SystemBars.initialViewportFitValueHint, 'cover')
  assert.match(mainActivity, /WindowCompat\.setDecorFitsSystemWindows\(window, false\)/)
  assert.match(styles, /--safe-area-inset-top/)
  assert.match(styles, /--safe-area-inset-bottom/)
  assert.match(styles, /env\(safe-area-inset-top, 0px\)/)
  assert.match(styles, /env\(safe-area-inset-bottom, 0px\)/)
})

test('Manual expense forms require an account and validate ownership through the API', () => {
  const form = read('src/components/gastos/TablaGastos.jsx')
  const api = read('api/gastos.js')

  assert.match(form, /cuentaId:\s*''/)
  assert.match(form, /¿De qué cuenta salió el dinero\?/)
  assert.match(form, /<select required value=\{nuevoGasto\.cuentaId\}/)
  assert.match(form, /!nuevoGasto\.cuentaId \|\| !cuentasUsuario\.some/)
  assert.match(api, /findOwnedAccountId\(supabase, user\.id, body\.cuentaId\)/)
})

test('Manual income forms require the account where the money was received', () => {
  const form = read('src/components/ingresos/TablaIngresos.jsx')
  const api = read('api/ingresos.js')

  assert.match(form, /cuentaId:\s*''/)
  assert.match(form, /¿En qué cuenta recibiste el ingreso\?/)
  assert.match(form, /<select required value=\{nuevoIngreso\.cuentaId\}/)
  assert.match(form, /!nuevoIngreso\.cuentaId \|\| !cuentasUsuario\.some/)
  assert.match(api, /findOwnedAccountId\(supabase, user\.id, body\.cuentaId\)/)
})

test('Android loads account options directly with the authenticated RLS session', () => {
  const api = read('src/lib/supabase.js')

  assert.match(api, /async function getAndroidAccounts\(\)/)
  assert.match(api, /supabase\.from\('accounts'\)/)
  assert.match(api, /\.eq\('user_id', userId\)/)
  assert.match(api, /parsedUrl\.pathname === '\/api\/cuentas'/)
  assert.match(api, /return jsonResponse\(await getAndroidAccounts\(\)\)/)
})
test('Automatic capture only posts to a unique account matching the detected bank', () => {
  const sync = read('supabase/functions/notification-capture-sync/index.ts')

  assert.match(sync, /function accountNameMatchesBank\(accountName: string, bankLabel: string\)/)
  assert.match(sync, /accountTokens\.includes\(bankToken\)/)
  assert.match(sync, /candidateAccounts\.length === 1 \? candidateAccounts\[0\] : null/)
  assert.match(sync, /else pendingReview \+= 1/)
})


test('Quota editor scrolls into view and edit actions use a pencil icon', () => {
  const page = read('src/pages/Configuracion.jsx')

  assert.match(page, /const cuotasFormRef = useRef\(null\)/)
  assert.match(page, /scrollIntoView\(\{ behavior: 'smooth', block: 'start' \}\)/)
  assert.match(page, /ref=\{cuotasFormRef\}/)
  assert.match(page, /title="Editar plan"[^>]*><Pencil/)
  assert.match(page, /title="Editar presupuesto"[^>]*><Pencil/)
})

test('Account balance adjustment updates the opening baseline without inserting a fake movement', () => {
  const page = read('src/components/dashboard/DineroDisponible.jsx')
  const api = read('api/cuentas.js')
  const native = read('src/lib/supabase.js')

  assert.match(page, /method: 'PATCH'/)
  assert.match(page, /accountId: editingAccount\.id, balance/)
  assert.match(api, /req\.method === 'PATCH'/)
  assert.match(api, /\.update\(\{ opening_balance: nextOpeningBalance \}\)/)
  assert.match(native, /async function updateAndroidAccountBalance/)
  assert.match(native, /\.update\(\{ opening_balance: nextOpeningBalance \}\)/)
  assert.doesNotMatch(api, /from\('transactions'\)\.insert/)
})

test('Android expense and income history exposes edit and void actions', () => {
  const expenses = read('src/components/gastos/TablaGastos.jsx')
  const incomes = read('src/components/ingresos/TablaIngresos.jsx')
  const native = read('src/lib/supabase.js')

  assert.doesNotMatch(expenses, /isAndroidApp/)
  assert.doesNotMatch(incomes, /isAndroidApp/)
  assert.match(expenses, /Editar gasto/)
  assert.match(incomes, /Editar ingreso/)
  assert.match(native, /async function updateAndroidTransaction/)
  assert.match(native, /readAndroidJsonBody\(init, sourceRequest\)/)
  assert.doesNotMatch(native, /readAndroidJsonBody\(input, init, sourceRequest\)/)
  assert.match(native, /\.update\(\{ status: 'void' \}\)/)
  assert.match(native, /method === 'PATCH' \|\| method === 'DELETE'/)
})

test('Web Push VAPID key, subscription, storage, and service worker are wired', () => {
  const settings = read('src/components/NotificationSettings.jsx')
  const worker = read('public/sw.js')

  assert.match(settings, /import\.meta\.env\.VITE_WEB_PUSH_PUBLIC_KEY/)
  assert.match(settings, /applicationServerKey: decodeBase64Url\(publicKey\)/)
  assert.match(settings, /push_subscriptions/)
  assert.match(worker, /self\.addEventListener\('push'/)
  assert.match(worker, /showNotification/)
})

test('Preview APK version is incremented for these account and history fixes', () => {
  const gradle = read('android/app/build.gradle.kts')
  assert.match(gradle, /versionCode = 10/)
  assert.match(gradle, /versionName = "1\.0\.9-preview"/)
})
