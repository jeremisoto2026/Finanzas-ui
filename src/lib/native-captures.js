import { Capacitor, registerPlugin } from '@capacitor/core'
import { supabase } from '@/lib/supabase'

const LocalCaptures = registerPlugin('LocalCaptures')

export const isFinanzasAndroid = () => Capacitor.getPlatform() === 'android'

export async function getLocalCaptureState() {
  if (!isFinanzasAndroid()) {
    return {
      available: false,
      permissionEnabled: false,
      captures: [],
      syncEnabled: false,
    }
  }

  return LocalCaptures.getCaptureState()
}

export async function updateNativeAuthSession(session) {
  if (!isFinanzasAndroid()) return
  if (!session?.access_token || !session?.refresh_token || !session?.user?.id) return
  return LocalCaptures.updateAuthSession({
    userId: session.user.id,
    email: session.user.email || '',
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAtMillis: Number(session.expires_at || 0) * 1000,
  })
}

export async function clearNativeAuthSession() {
  if (!isFinanzasAndroid()) return
  return LocalCaptures.clearAuthSession()
}

export async function openNotificationAccessSettings() {
  if (!isFinanzasAndroid()) {
    throw new Error('Esta función está disponible en la aplicación Android.')
  }
  return LocalCaptures.openNotificationSettings()
}

export async function openAppNotificationSettings() {
  if (!isFinanzasAndroid()) {
    throw new Error('Esta función está disponible en la aplicación Android.')
  }
  return LocalCaptures.openAppNotificationSettings()
}

export async function clearLocalCaptures() {
  if (!isFinanzasAndroid()) {
    throw new Error('Esta función está disponible en la aplicación Android.')
  }
  return LocalCaptures.clearCaptures()
}

export function listenForCaptureChanges(callback) {
  if (!isFinanzasAndroid()) return Promise.resolve({ remove: async () => {} })
  return LocalCaptures.addListener('capturesChanged', callback)
}


/**
 * Uploads parsed local payment captures to the authenticated inbox.
 * The original notification text is never sent; only normalized purchase
 * fields already extracted by the Android listener are synchronized.
 */
export async function syncLocalCaptures(captures = []) {
  if (!isFinanzasAndroid()) {
    throw new Error('La sincronización de capturas está disponible en Finanzas Android.')
  }

  if (!Array.isArray(captures) || captures.length === 0) {
    return { ok: true, syncedCaptures: 0, syncedEvents: 0 }
  }

  const { data, error } = await supabase.functions.invoke('notification-capture-sync', {
    body: { captures },
  })

  if (error) throw error
  if (!data?.ok) {
    throw new Error(data?.error || 'No se pudieron sincronizar las capturas.')
  }
  return data
}
