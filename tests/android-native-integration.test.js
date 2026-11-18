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

test('Capacitor uses native edge-to-edge insets and viewport fit', () => {
  const config = JSON.parse(read('capacitor.config.json'))
  const mainActivity = read('android/app/src/main/java/com/finanzas/companion/MainActivity.kt')

  assert.equal(config.plugins.SystemBars.insetsHandling, 'native')
  assert.equal(config.plugins.SystemBars.initialViewportFitValueHint, 'cover')
  assert.match(mainActivity, /WindowCompat\.setDecorFitsSystemWindows\(window, false\)/)
})
