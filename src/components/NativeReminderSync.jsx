import { useEffect } from 'react'
import { LocalNotifications } from '@capacitor/local-notifications'
import { supabase } from '@/lib/supabase'
import { getNativeReminderData, isFinanzasAndroid, syncNativeReminders } from '@/lib/native-reminders'

/** Refreshes pending native reminders when the signed-in app becomes active. */
export default function NativeReminderSync() {
  useEffect(() => {
    if (!isFinanzasAndroid()) return undefined
    let active = true
    let running = false

    const refresh = async () => {
      if (running || !active) return
      running = true
      try {
        const permission = await LocalNotifications.checkPermissions()
        if (!active || permission.display !== 'granted') return
        const { data: { user }, error } = await supabase.auth.getUser()
        if (error) throw error
        if (!user || !active) return
        const data = await getNativeReminderData(supabase, user.id)
        if (active) await syncNativeReminders(data)
      } catch (error) {
        console.warn('No se pudieron actualizar los recordatorios locales:', error?.message || error)
      } finally {
        running = false
      }
    }

    void refresh()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      active = false
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return null
}
