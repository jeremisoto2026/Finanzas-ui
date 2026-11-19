package com.finanzas.companion

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

object CaptureEvents {
    @Volatile
    var onChanged: (() -> Unit)? = null
}

class NotificationCaptureService : NotificationListenerService() {
    private lateinit var captureStore: CaptureStore

    override fun onCreate() {
        super.onCreate()
        captureStore = CaptureStore(applicationContext)
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        // Derive a stable app key from the package. Unknown apps are accepted
        // as candidate financial sources; the flexible parser filters non-payment alerts.
        val appLabel = try {
            val applicationInfo = packageManager.getApplicationInfo(sbn.packageName, 0)
            packageManager.getApplicationLabel(applicationInfo).toString()
        } catch (_: Exception) {
            sbn.packageName.substringAfterLast('.')
        }
        val source = NotificationSource.fromPackage(sbn.packageName, appLabel) ?: return
        val notification = sbn.notification ?: return
        val extras = notification.extras ?: return

        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()
        val textParts = listOf(
            extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString(),
            extras.getCharSequence(Notification.EXTRA_TEXT)?.toString(),
            extras.getCharSequence(Notification.EXTRA_SUMMARY_TEXT)?.toString()
        ).filterNot { it.isNullOrBlank() }.distinct()

        val combinedText = textParts.joinToString("\n")
        if (combinedText.isBlank()) return

        val parsed = NotificationParser.parse(
            source = source,
            title = title,
            text = combinedText,
            occurredAtMillis = sbn.postTime,
            notificationKey = "\${sbn.packageName}:\${sbn.key}"
        ) ?: return

        val result = captureStore.add(parsed)
        if (!result.wasDuplicate) CaptureSyncScheduler.enqueue(applicationContext)
        CaptureEvents.onChanged?.invoke()
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        CaptureEvents.onChanged?.invoke()
    }
}
