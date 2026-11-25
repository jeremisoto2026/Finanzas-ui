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

test('Android landing page respects status-bar and gesture-navigation safe areas', () => {
  const landing = read('src/components/auth/LandingPage.jsx')
  const styles = read('src/styles/globals.css')

  assert.match(landing, /className="landing-page relative/)
  assert.match(landing, /className="landing-header sticky top-0/)
  assert.match(landing, /className="landing-footer border-t/)
  assert.match(styles, /\.landing-header\s*\{[^}]*padding-top:\s*var\(--finance-safe-area-top\)/s)
  assert.match(styles, /\.landing-footer\s*\{[^}]*padding-bottom:\s*var\(--finance-safe-area-bottom\)/s)
  assert.match(styles, /\.landing-page\s*\{[^}]*overflow-x:\s*clip/s)
})

test('Manual expense forms require an account and validate ownership through the API', () => {
  const form = read('src/components/gastos/TablaGastos.jsx')
  const api = read('api/gastos.js')

  assert.match(form, /cuentaId:\s*''/)
  assert.match(form, /¿De qué cuenta salió el dinero\?/)
  assert.match(form, /<FinanceSelect required value=\{nuevoGasto\.cuentaId\}/)
  assert.match(form, /const cuentaSeleccionada = cuentasUsuario\.find/)
  assert.match(form, /!editingGastoId && cuentaSeleccionada\.isActive === false/)
  assert.match(api, /findOwnedAccountId\(supabase, user\.id, body\.cuentaId\)/)
})

test('Manual income forms require the account where the money was received', () => {
  const form = read('src/components/ingresos/TablaIngresos.jsx')
  const api = read('api/ingresos.js')

  assert.match(form, /cuentaId:\s*''/)
  assert.match(form, /¿En qué cuenta recibiste el ingreso\?/)
  assert.match(form, /<FinanceSelect required value=\{nuevoIngreso\.cuentaId\}/)
  assert.match(form, /const cuentaSeleccionada = cuentasUsuario\.find/)
  assert.match(form, /!editingIngresoId && cuentaSeleccionada\.isActive === false/)
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
test('Automatic capture posts bank-only alerts to the app default and pairs Wallet without card data', () => {
  const sync = read('supabase/functions/notification-capture-sync/index.ts')
  const review = read('src/pages/CapturasAutomaticas.jsx')
  const migration = read('supabase/migrations/20261119120000_add_account_notification_bindings.sql')
  const removal = read('supabase/migrations/20261119143000_remove_card_suffix_notification_mappings.sql')
  const universal = read('supabase/migrations/20261119190000_universal_bank_notification_sources.sql')
  const plugin = read('android/app/src/main/java/com/finanzas/companion/LocalCapturesPlugin.kt')
  const foregroundSync = read('src/lib/native-captures.js')

  assert.match(sync, /function resolveMappedAccount/)
  assert.match(sync, /account_notification_sources/)
  assert.match(sync, /const activeMappings = mappings\.filter/)
  assert.match(sync, /const bankSources = capture\.sources\.filter/)
  assert.match(sync, /source\.sourceApp/)
  assert.match(sync, /android:/)
  assert.match(sync, /else if \(account\?\.id && categoryId && categoryConfidence >= 0\.9\)/)
  assert.match(sync, /bankSources\.length !== 1/)
  assert.match(sync, /source_label: source\.label/)
  assert.match(sync, /exactMatches\.length === 1/)
  assert.match(sync, /normalizeText\(String\(item\.institution \|\| ""\)\) === sourceLabel/)
  assert.match(plugin, /sourceDetails/)
  assert.match(foregroundSync, /capture\.sourceDetails/)
  assert.match(sync, /pendingReview\s*\+=\s*1/)
  assert.match(sync, /else pendingReview \+= 1/)
  assert.doesNotMatch(sync, /capture\.isPaired\s*&&/)
  assert.doesNotMatch(sync, /cardLast4|card_last4/)
  assert.doesNotMatch(sync, /accountNameMatchesBank/)
  assert.match(review, /Vincular bancos con tus cuentas/)
  assert.match(review, /onConflict: 'user_id,source_app'/)
  assert.match(review, /No solicitamos ni guardamos datos de tarjetas bancarias/)
  assert.match(review, /importe exacto, comercio y hora/)
  assert.match(review, /account_id: accountId/)
  assert.match(review, /const idempotencyKey = item\.id \|\| item\.eventIds\?\.\[0\]/)
  assert.match(sync, /idempotency_key: pairKey/)
  assert.match(migration, /notification_capture_events_account_owner_fkey/)
  assert.match(removal, /drop column if exists card_last4/i)
  assert.match(removal, /unique \(user_id, source_app\)/i)
  assert.match(universal, /android:%/)
  assert.match(universal, /source_label/)
})


test('Quota editor scrolls into view and edit actions use a pencil icon', () => {
  const page = read('src/pages/Configuracion.jsx')

  assert.match(page, /useScrollToForm\(mostrarFormCuotas, editingCompraCuotasId\)/)
  assert.match(page, /useScrollToForm\(mostrarFormPresupuesto, editingPresupuestoId\)/)
  assert.match(page, /ref=\{cuotasFormRef\}/)
  assert.match(page, /ref=\{presupuestoFormRef\}/)
  assert.match(read('src/lib/useScrollToForm.js'), /scrollIntoView\(\{/)
  assert.match(page, /title="Editar plan"[^>]*><Pencil/)
  assert.match(page, /title="Editar presupuesto"[^>]*><Pencil/)
})

test('Account balance adjustment updates the opening baseline without inserting a fake movement', () => {
  const page = read('src/components/dashboard/DineroDisponible.jsx')
  const api = read('api/cuentas.js')
  const native = read('src/lib/supabase.js')

  assert.match(page, /method: 'PATCH'/)
  assert.match(page, /accountId: editingAccount\.id, balance/)
  assert.match(api, /includes\(req\.method\)/)
  assert.match(api, /patch\.opening_balance = money\(targetBalance - ledgerNet\)/)
  assert.match(native, /async function updateAndroidAccount/)
  assert.match(native, /patch\.opening_balance = androidMoney\(targetBalance - ledgerNet\)/)
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

test('Google sign-in keeps the encrypted Android bank-notification session in sync', () => {
  const auth = read('src/contexts/AuthContext.jsx')
  const captureSync = read('src/components/NotificationCaptureSync.jsx')
  const helper = read('src/lib/native-captures.js')
  const plugin = read('android/app/src/main/java/com/finanzas/companion/LocalCapturesPlugin.kt')
  const repository = read('android/app/src/main/java/com/finanzas/companion/SupabaseAuthRepository.kt')
  const worker = read('android/app/src/main/java/com/finanzas/companion/NotificationCaptureSyncWorker.kt')
  const service = read('android/app/src/main/java/com/finanzas/companion/NotificationCaptureService.kt')

  assert.ok(auth.includes("signInWithIdToken({ provider: 'google', token: idToken })"))
  assert.ok(captureSync.includes('supabase.auth.onAuthStateChange'))
  assert.ok(captureSync.includes('updateNativeAuthSession(session)'))
  assert.ok(captureSync.includes('clearNativeAuthSession()'))
  assert.ok(helper.includes('LocalCaptures.updateAuthSession'))
  assert.ok(plugin.includes('fun updateAuthSession(call: PluginCall)'))
  assert.ok(plugin.includes('fun clearAuthSession(call: PluginCall)'))
  assert.ok(repository.includes('EncryptedPreferences'))
  assert.ok(worker.includes('validAccessTokenForFutureSync()'))
  assert.ok(service.includes('CaptureSyncScheduler.enqueue(applicationContext)'))
})

test('Preview APK version is incremented and uses a persistent signing identity', () => {
  const gradle = read('android/app/build.gradle.kts')
  const workflow = read('.github/workflows/android-companion.yml')
  assert.match(gradle, /versionCode = 32/)
  assert.match(gradle, /versionName = "1.0.31"/)
  assert.match(gradle, /applicationIdSuffix = "\.preview"/)
  assert.match(gradle, /versionNameSuffix = "-preview"/)
  assert.match(gradle, /create\("preview"\)/)
  assert.match(gradle, /hasPersistentPreviewSigning/)
  assert.match(gradle, /signingConfig = signingConfigs\.getByName\("preview"\)/)
  for (const secret of [
    'FINANZAS_PREVIEW_KEYSTORE_BASE64',
    'FINANZAS_PREVIEW_KEYSTORE_PASSWORD',
    'FINANZAS_PREVIEW_KEY_ALIAS',
    'FINANZAS_PREVIEW_KEY_PASSWORD',
  ]) {
    assert.match(workflow, new RegExp('secrets\\.' + secret))
  }
  assert.match(workflow, /base64 --decode/)
  assert.match(workflow, /FINANZAS_PREVIEW_KEYSTORE_PATH=/)
})


test('All visible edit forms focus the corresponding form after selecting a record', () => {
  const page = read('src/pages/Configuracion.jsx')
  const expense = read('src/components/gastos/TablaGastos.jsx')
  const income = read('src/components/ingresos/TablaIngresos.jsx')

  assert.match(page, /useScrollToForm\(mostrarFormPagoFijo, editingPagoFijoId\)/)
  assert.match(page, /useScrollToForm\(mostrarFormCuotas, editingCompraCuotasId\)/)
  assert.match(page, /useScrollToForm\(mostrarFormPresupuesto, editingPresupuestoId\)/)
  assert.match(expense, /fixed inset-0 z-\[70\]/)
  assert.match(income, /fixed inset-0 z-\[70\]/)
})

test('Dynamic account schema keeps ownership and supports account classifications', () => {
  const migration = read('supabase/migrations/20261119102400_add_dynamic_account_types.sql')
  const api = read('api/cuentas.js')

  assert.match(migration, /add column if not exists account_type text not null default 'bank'/)
  for (const type of ['bank', 'cash', 'debit_card', 'credit_card', 'digital_wallet', 'savings', 'other']) {
    assert.match(migration, new RegExp(`'${type}'`))
  }
  assert.match(api, /const ACCOUNT_TYPES = new Set/)
  assert.match(api, /createAuthenticatedClient\(req\)/)
  assert.match(api, /user_id: user\.id/)
  assert.match(api, /\.eq\('user_id', user\.id\)/)
  assert.match(api, /if \(req\.method === 'POST'\)/)
  assert.match(api, /includes\(req\.method\)/)
  assert.doesNotMatch(api, /req\.method === 'DELETE'/)
})

test('User account management is available from the main navigation and uses authenticated routes', () => {
  const page = read('src/pages/Cuentas.jsx')
  const sidebar = read('src/components/layout/Sidebar.jsx')
  const layout = read('src/components/layout/Layout.jsx')
  const native = read('src/lib/supabase.js')

  assert.match(sidebar, /name: 'Cuentas'/)
  assert.match(layout, /const Cuentas = lazy\(\(\) => import\('@\/pages\/Cuentas'\)\)/)
  assert.match(layout, /activePage === 'Cuentas'/)
  assert.match(page, /fetch\('\/api\/cuentas'/)
  assert.match(page, /method: editingId \? 'PATCH' : 'POST'/)
  assert.match(page, /isActive: nextState/)
  assert.match(page, /Cuentas desactivadas/)
  assert.match(native, /async function createAndroidAccount/)
  assert.match(native, /async function updateAndroidAccount/)
  assert.match(native, /account\.is_active === false/)
  assert.match(native, /\.eq\('user_id', userId\)/)
})

test('Inactive accounts remain in history but cannot receive new movements', () => {
  const expense = read('src/components/gastos/TablaGastos.jsx')
  const income = read('src/components/ingresos/TablaIngresos.jsx')
  const api = read('api/cuentas.js')
  const native = read('src/lib/supabase.js')

  assert.match(expense, /account\.isActive === false \? ' · Desactivada'/)
  assert.match(income, /account\.isActive === false \? ' · Desactivada'/)
  assert.match(api, /patch\.is_active = Boolean\(body\.isActive\)/)
  assert.match(native, /if \(account\.is_active === false\)/)
  assert.match(api, /Las cuentas se desactivan para conservar su historial/)
})


test('Android debug Preview APK uses the isolated Supabase backend, never Production', () => {
  const gradle = read('android/app/build.gradle.kts')
  const workflow = read('.github/workflows/android-companion.yml')

  assert.match(gradle, /getByName\("debug"\)[\s\S]*SUPABASE_URL[\s\S]*brkckgaicoqkqdcwwftm\.supabase\.co/)
  assert.match(gradle, /SUPABASE_PUBLISHABLE_KEY[\s\S]*sb_publishable_4aTVOdrHyro5iyDctv1mjg__yI6jqh-/)
  assert.match(workflow, /VITE_SUPABASE_URL: "https:\/\/brkckgaicoqkqdcwwftm\.supabase\.co"/)
  assert.match(workflow, /VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_4aTVOdrHyro5iyDctv1mjg__yI6jqh-"/)
  assert.doesNotMatch(workflow, /https:\/\/xebgscmovaffrqckzpyz\.supabase\.co/)
})


test('Android forwards budget and payment writes through the authenticated Preview function', () => {
  const native = read('src/lib/supabase.js')
  const writer = read('supabase/functions/finance-management-write/index.ts')
  assert.match(native, /ANDROID_MANAGEMENT_WRITE_PATHS/)
  assert.match(native, /functions\/v1\/finance-management-write/)
  assert.match(native, /Authorization: 'Bearer ' \+ accessToken/)
  assert.match(writer, /auth\.getUser\(\)/)
  assert.match(writer, /\/api\/presupuestos/)
  assert.match(writer, /\/api\/pagos-fijos/)
  assert.match(writer, /\/api\/compras-cuotas/)
  assert.match(writer, /register_installment_payment/)
  assert.match(writer, /user_id: userId/)
  assert.doesNotMatch(writer, /SERVICE_ROLE/)
})

test('Android supports creating, editing, deleting and settling pending replenishments', () => {
  const native = read('src/lib/supabase.js')
  const writer = read('supabase/functions/finance-management-write/index.ts')
  assert.match(native, /'\/api\/compromisos'/)
  assert.match(native, /ANDROID_MANAGEMENT_WRITE_PATHS\.has\(parsedUrl\.pathname\)/)
  assert.match(native, /searchParams\.get\('resource'\) === 'reservations'/)
  assert.match(writer, /async function replenishments\(/)
  assert.match(writer, /from\("financial_items"\)\.insert\(\{ user_id: userId, item_kind: "replenishment"/)
  assert.match(writer, /from\("financial_items"\)\.update/)
  assert.match(writer, /from\("financial_items"\)\.delete\(\)/)
  assert.match(writer, /register_replenishment/)
  assert.match(writer, /p_idempotency_key: body\.idempotencyKey/)
  assert.match(writer, /item_kind", "replenishment/)
  assert.match(writer, /"\/api\/compromisos"/)
})

test('Android supports creating, editing, deleting and settling debts', () => {
  const native = read('src/lib/supabase.js')
  const writer = read('supabase/functions/finance-management-write/index.ts')
  assert.match(native, /'\/api\/deudas'/)
  assert.match(writer, /async function debts\(/)
  assert.match(writer, /from\("debts"\)\.insert/)
  assert.match(writer, /from\("debts"\)\.update/)
  assert.match(writer, /from\("debts"\)\.delete\(\)/)
  assert.match(writer, /register_debt_settlement/)
  assert.match(writer, /p_idempotency_key: body\.idempotencyKey/)
  assert.match(writer, /"\/api\/deudas"/)
})

test('Authenticated Android topbar preserves the status-bar safe area', () => {
  const navbar = read('src/components/layout/Navbar.jsx')
  const styles = read('src/styles/globals.css')

  assert.match(navbar, /className="app-topbar sticky top-0/)
  assert.doesNotMatch(navbar, /className="app-topbar[^"]*\b(?:py|pt|pb)-\d/)
  assert.doesNotMatch(navbar, /className="app-topbar[^"]*\bmin-h-/)
  assert.match(styles, /\.app-topbar\s*\{[^}]*padding-top:\s*calc\(0\.75rem \+ var\(--finance-safe-area-top\)\)/s)
  assert.match(styles, /\.app-topbar\s*\{[^}]*min-height:\s*calc\(4\.25rem \+ var\(--finance-safe-area-top\)\)/s)
})


test('Global quick-add lets users select expenses or income from every screen', () => {
  const navbar = read('src/components/layout/Navbar.jsx')
  const layout = read('src/components/layout/Layout.jsx')
  const expenses = read('src/components/gastos/TablaGastos.jsx')
  const incomes = read('src/components/ingresos/TablaIngresos.jsx')

  assert.ok(navbar.includes('aria-haspopup="menu"'))
  assert.ok(navbar.includes('aria-label="Añadir movimiento"'))
  assert.ok(navbar.includes("seleccionarMovimiento('expense')"))
  assert.ok(navbar.includes("seleccionarMovimiento('income')"))
  assert.ok(layout.includes('onAdd={abrirNuevoMovimiento}'))
  assert.ok(layout.includes("import('@/pages/Gastos')"))
  assert.ok(layout.includes("import('@/pages/Ingresos')"))
  assert.ok(layout.includes('finanzas:open-new-expense'))
  assert.ok(layout.includes('finanzas:open-new-income'))
  assert.ok(expenses.includes("window.addEventListener('finanzas:open-new-expense'"))
  assert.ok(incomes.includes("window.addEventListener('finanzas:open-new-income'"))
})

test('Global quick-add Preview APK version is incremented for in-place installation', () => {
  const gradle = read('android/app/build.gradle.kts')
  assert.match(gradle, /versionCode = 32/)
  assert.match(gradle, /versionName = "1.0.31"/)
})


test('La pantalla de acceso usa el logotipo original de Finanzas', () => {
  const landing = read('src/components/auth/LandingPage.jsx')

  assert.match(landing, /src="\/finanzas-logo-horizontal-dark\.svg"/)
  assert.match(landing, /src="\/finanzas-icon\.svg"/)
  assert.match(landing, /alt="Finanzas"/)
})
test('Android app lock uses biometric authentication with secure device-credential fallback', () => {
  const gradle = read('android/app/build.gradle.kts')
  const activity = read('android/app/src/main/java/com/finanzas/companion/MainActivity.kt')
  const plugin = read('android/app/src/main/java/com/finanzas/companion/AppLockPlugin.kt')
  const store = read('android/app/src/main/java/com/finanzas/companion/AppLockStore.kt')
  const settings = read('src/components/AppLockSettings.jsx')
  const ajustes = read('src/pages/Ajustes.jsx')
  const lockMark = read('android/app/src/main/res/drawable/finanzas_lock_mark.xml')

  assert.match(gradle, /androidx\.biometric:biometric:1\.1\.0/)
  assert.match(activity, /registerPlugin\(AppLockPlugin::class\.java\)/)
  assert.match(activity, /BiometricPrompt/)
  assert.match(activity, /Authenticators\.BIOMETRIC_STRONG/)
  assert.match(activity, /Authenticators\.DEVICE_CREDENTIAL/)
  assert.match(activity, /AppLockStore\.isEnabled/)
  assert.match(activity, /coverProtectedContent\(\)/)
  assert.match(activity, /Color\.rgb\(8, 15, 28\)/)
  assert.match(activity, /Tu información financiera, protegida/)
  assert.match(activity, /finanzas_lock_mark/)
  assert.match(lockMark, /#10B981/)
  assert.match(lockMark, /#FBBF24/)
  assert.match(activity, /revealProtectedContent\(\)/)
  assert.match(activity, /decor\.addView\(/)
  assert.match(plugin, /canAuthenticate\(authenticators\)/)
  assert.match(plugin, /KeyguardManager/)
  assert.match(store, /getSharedPreferences\(PREFS/)
  assert.match(settings, /AppLock\.getStatus\(\)/)
  assert.match(settings, /AppLock\.setEnabled/)
  assert.match(settings, /PIN, patrón o contraseña/)
  assert.match(ajustes, /<AppLockSettings \/>/)
})

