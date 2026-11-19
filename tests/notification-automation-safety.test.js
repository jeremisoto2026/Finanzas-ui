import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')

test('el registro automático exige pareja Wallet+banco, mapeo único y categoría válida', () => {
  const source = read('supabase/functions/notification-capture-sync/index.ts')
  assert.match(source, /const bankAccountLabel = bankSources\.length === 1/)
  assert.match(source, /function resolveMappedAccount/)
  assert.match(source, /account_notification_sources/)
  assert.match(source, /capture\.isPaired/)
  assert.match(source, /capture\.sources\.includes\("google_wallet"\)/)
  assert.match(source, /candidates\.length !== 1/)
  assert.match(source, /Number\(savedRule\.confidence \|\| 0\) >= 0\.9/)
  assert.match(source, /status: autoPost \? "posted" : "needs_review"/)
  assert.match(source, /account_id: transactionAccountId/)
  assert.match(source, /idempotency_key: pairKey/)
  assert.match(source, /\.eq\("idempotency_key", pairKey\)/)
  assert.match(source, /\.eq\("idempotency_key", capture\.id\)/)
  assert.doesNotMatch(source, /accountNameMatchesBank/)
  assert.doesNotMatch(source, /accountLabel: "Revolut",/)
})

test('la migración vincula fuentes bancarias a cuentas del mismo usuario con RLS', () => {
  const migration = read('supabase/migrations/20261119120000_add_account_notification_bindings.sql')
  assert.match(migration, /create table if not exists public\.account_notification_sources/)
  assert.match(migration, /foreign key \(account_id, user_id\)/)
  assert.match(migration, /unique nulls not distinct/)
  assert.match(migration, /enable row level security/)
  assert.match(migration, /notify pgrst, 'reload schema'/)
})

test('BBVA y Wallet se filtran por paquete y nunca se emparejan dos bancos diferentes', () => {
  const parser = read('android/app/src/main/java/com/finanzas/companion/NotificationParser.kt')
  const store = read('android/app/src/main/java/com/finanzas/companion/CaptureStore.kt')
  const service = read('android/app/src/main/java/com/finanzas/companion/NotificationCaptureService.kt')
  assert.match(parser, /BBVA\("com\.bbva\.bbvacontigo"/)
  assert.match(parser, /GOOGLE_WALLET\("com\.google\.android\.apps\.walletnfcrel"/)
  assert.match(service, /NotificationSource\.fromPackage\(sbn\.packageName\) \?: return/)
  assert.match(store, /crossAppWalletPair/)
  assert.match(store, /conflictingIssuer/)
  assert.match(store, /possiblePairIndexes\.size == 1/)
  assert.match(parser, /cardLast4 = null/)
})

test('Android sincroniza en segundo plano con sesión cifrada y red disponible', () => {
  const gradle = read('android/app/build.gradle.kts')
  const worker = read('android/app/src/main/java/com/finanzas/companion/NotificationCaptureSyncWorker.kt')
  const service = read('android/app/src/main/java/com/finanzas/companion/NotificationCaptureService.kt')
  const auth = read('android/app/src/main/java/com/finanzas/companion/SupabaseAuthRepository.kt')
  const sync = read('src/components/NotificationCaptureSync.jsx')
  assert.match(gradle, /androidx\.work:work-runtime-ktx/)
  assert.match(worker, /NetworkType\.CONNECTED/)
  assert.match(worker, /validAccessTokenForFutureSync/)
  assert.match(worker, /Authorization", "Bearer \$token"/)
  assert.match(service, /CaptureSyncScheduler\.enqueue/)
  assert.match(auth, /secureStore\.putString\(SESSION_KEY/)
  assert.ok(auth.includes('clearCapturesWhenAccountChanges'))
  assert.ok(auth.includes('CaptureStore(appContext).clear()'))
  assert.match(sync, /updateNativeAuthSession/)
  assert.match(sync, /clearNativeAuthSession/)
})

test('el módulo de capturas no figura como apartado principal', () => {
  const settings = read('src/pages/Ajustes.jsx')
  const layout = read('src/components/layout/Layout.jsx')
  const automation = read('src/pages/Automatizaciones.jsx')
  assert.doesNotMatch(settings, /Capturas automáticas/)
  assert.match(layout, /Compras pendientes/)
  assert.match(automation, /Detección en segundo plano/)
  assert.match(automation, /Permisos Android/)
})
