import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { supabase } from '@/lib/supabase'

/**
 * Registers the authenticated Android installation with Firebase Cloud Messaging.
 * The notification permission is requested by the existing first-login flow;
 * this component only registers after Android reports that permission as granted.
 */
export default function FcmPushSync({ userId }) {
  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android' || !userId) return undefined

    let active = true
    let registering = false
    const listeners = []

    const saveToken = async (tokenValue) => {
      if (!active || !tokenValue) return
      const { error } = await supabase.from('fcm_push_tokens').upsert({
        user_id: userId,
        token: tokenValue,
        platform: 'android',
        device_label: 'Finanzas para Android',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'token' })
      if (error) throw error
    }

    const registerIfAllowed = async () => {
      if (!active || registering) return
      registering = true
      try {
        const permission = await PushNotifications.checkPermissions()
        if (!active || permission.receive !== 'granted') return
        await PushNotifications.register()
      } catch (error) {
        console.warn('No se pudo registrar Finanzas en FCM:', error?.message || error)
      } finally {
        registering = false
      }
    }

    const setup = async () => {
      try {
        listeners.push(await PushNotifications.addListener('registration', ({ value }) => {
          void saveToken(value).catch((error) => {
            console.warn('No se pudo guardar el token FCM:', error?.message || error)
          })
        }))
        listeners.push(await PushNotifications.addListener('registrationError', (error) => {
          console.warn('Firebase no pudo registrar este dispositivo:', error?.error || error)
        }))
        listeners.push(await PushNotifications.addListener('pushNotificationReceived', (notification) => {
          window.dispatchEvent(new CustomEvent('finanzas:push-received', { detail: notification }))
        }))
        listeners.push(await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
          window.dispatchEvent(new CustomEvent('finanzas:push-opened', { detail: action }))
        }))
        await registerIfAllowed()
      } catch (error) {
        console.warn('No se pudo preparar el registro FCM:', error?.message || error)
      }
    }

    const onPermissionUpdated = () => { void registerIfAllowed() }
    const onResume = () => {
      if (document.visibilityState === 'visible') void registerIfAllowed()
    }
    window.addEventListener('finanzas:native-permissions-updated', onPermissionUpdated)
    window.addEventListener('focus', onResume)
    document.addEventListener('visibilitychange', onResume)
    void setup()

    return () => {
      active = false
      window.removeEventListener('finanzas:native-permissions-updated', onPermissionUpdated)
      window.removeEventListener('focus', onResume)
      document.removeEventListener('visibilitychange', onResume)
      for (const listener of listeners) {
        void listener.remove()
      }
    }
  }, [userId])

  return null
}
