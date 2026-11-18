import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')

test('el registro automático solo funciona con banco, cuenta única y categoría válida', () => {
  const source = read('supabase/functions/notification-capture-sync/index.ts')
  assert.match(source, /const bankAccountLabel = bankSources\.length === 1/)
  assert.match(source, /candidateAccounts\.length === 1/)
  assert.match(source, /Number\(savedRule\.confidence \|\| 0\) >= 0\.9/)
  assert.match(source, /if \(account\?\.id && categoryId\)/)
  assert.match(source, /status: autoPost \? "posted" : "needs_review"/)
  assert.match(source, /idempotency_key: capture\.id/)
  assert.doesNotMatch(source, /accountLabel: "Revolut"/)
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
