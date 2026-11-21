import { supabase } from '@/lib/supabase'

export function supportsWebPush() {
  return typeof window !== 'undefined'
    && 'Notification' in window
    && 'serviceWorker' in navigator
    && 'PushManager' in window
}

export function readWebPushPermission() {
  return typeof window !== 'undefined' && 'Notification' in window
    ? Notification.permission
    : 'unsupported'
}

function decodeVapidKey(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), '=')
  const raw = window.atob(padded)
  return Uint8Array.from(raw, (character) => character.charCodeAt(0))
}

/** Must be called directly from a user click because browsers restrict permission prompts. */
export async function enableBrowserPush(userId) {
  if (!userId) throw new Error('Inicia sesión para activar las notificaciones.')
  if (!supportsWebPush()) throw new Error('Este navegador no admite notificaciones push. Prueba con Chrome o Edge actualizado.')

  const publicKey = import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY
  if (!publicKey) throw new Error('La clave pública de notificaciones no está configurada en este entorno.')

  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission()
  if (permission !== 'granted') return { permission, subscription: null }

  const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  await navigator.serviceWorker.ready

  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeVapidKey(publicKey),
    })
  }

  const keys = subscription.toJSON().keys || {}
  if (!keys.p256dh || !keys.auth) throw new Error('El navegador no devolvió las claves necesarias para activar los avisos.')

  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: userId,
    endpoint: subscription.endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    device_label: 'Navegador web',
    expiration_time: subscription.expirationTime
      ? new Date(subscription.expirationTime).toISOString()
      : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'endpoint' })

  if (error) throw error
  return { permission, subscription }
}

export async function getBrowserPushSubscription() {
  if (!supportsWebPush()) return null
  const registration = await navigator.serviceWorker.getRegistration('/')
  return registration?.pushManager.getSubscription() || null
}
