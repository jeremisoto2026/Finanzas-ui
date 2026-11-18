import { useCallback, useEffect, useRef } from 'react'
import {
  getLocalCaptureState,
  isFinanzasAndroid,
  listenForCaptureChanges,
  syncLocalCaptures,
} from '@/lib/native-captures'

/**
 * Synchronizes only normalized captures from the current Android app.
 * It never creates, edits, or deletes ledger transactions.
 */
export default function NotificationCaptureSync() {
  const running = useRef(false)
  const rerun = useRef(false)
  const lastSyncedSignature = useRef('')

  const syncLatest = useCallback(async () => {
    if (!isFinanzasAndroid()) return
    if (running.current) {
      rerun.current = true
      return
    }

    running.current = true
    try {
      do {
        rerun.current = false
        const state = await getLocalCaptureState()
        if (!state?.permissionEnabled || !Array.isArray(state.captures) || state.captures.length === 0) {
          lastSyncedSignature.current = ''
          continue
        }

        const captures = state.captures
        const signature = captures
          .map((item) => [
            item.id,
            item.amountCents,
            item.occurredAtMillis,
            (item.sources || []).slice().sort().join(','),
            item.isPaired ? 'paired' : 'single',
          ].join(':'))
          .sort()
          .join('|')

        if (!signature || signature === lastSyncedSignature.current) continue

        await syncLocalCaptures(captures)
        lastSyncedSignature.current = signature
      } while (rerun.current)
    } catch (error) {
      // Keep the encrypted local queue untouched. The next foreground or
      // notification event retries synchronization with the signed-in session.
      console.warn('Sincronización de capturas pendiente:', error?.message || error)
    } finally {
      running.current = false
    }
  }, [])

  useEffect(() => {
    if (!isFinanzasAndroid()) return undefined

    let active = true
    let listenerHandle = null
    const refresh = () => {
      if (active) void syncLatest()
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh()
    }

    refresh()
    listenForCaptureChanges(refresh)
      .then((handle) => {
        if (active) listenerHandle = handle
        else handle.remove()
      })
      .catch(() => {})

    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      active = false
      listenerHandle?.remove()
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [syncLatest])

  return null
}
