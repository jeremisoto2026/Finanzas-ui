package com.finanzas.companion

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import java.text.NumberFormat
import java.util.Locale

/**
 * Alerts the user when a bank notification is captured as a possible income.
 * It never posts a transaction; the user must review and confirm it in Finanzas.
 */
internal object PossibleIncomeNotifier {
    private const val CHANNEL_ID = "finanzas-possible-income"

    fun show(
        context: Context,
        candidateId: String,
        sourceLabel: String,
        amountCents: Long?
    ) {
        val appContext = context.applicationContext
        if (candidateId.isBlank()) return
        if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(
                appContext,
                Manifest.permission.POST_NOTIFICATIONS
            ) != PackageManager.PERMISSION_GRANTED
        ) return

        val manager = NotificationManagerCompat.from(appContext)
        if (!manager.areNotificationsEnabled()) return
        createChannel(appContext)

        val amountText = amountCents?.takeIf { it > 0L }?.let {
            NumberFormat.getCurrencyInstance(Locale.forLanguageTag("es-ES"))
                .format(it / 100.0)
        }
        val title = "Posible ingreso detectado"
        val compactText = listOfNotNull(sourceLabel.ifBlank { "Banco" }, amountText).joinToString(" · ")
        val expandedText = buildString {
            append(sourceLabel.ifBlank { "Tu banco" })
            if (amountText != null) append("\nImporte: $amountText")
            append("\nConfirma el origen en Finanzas. No se ha modificado tu saldo.")
        }

        val openAppIntent = Intent(appContext, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra("open_income_review", true)
        }
        val pendingIntent = PendingIntent.getActivity(
            appContext,
            candidateId.hashCode() and 0x7fffffff,
            openAppIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val publicVersion = NotificationCompat.Builder(appContext, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_finanzas)
            .setContentTitle("Finanzas")
            .setContentText("Tienes un posible ingreso pendiente de revisar.")
            .setAutoCancel(true)
            .build()

        val notification = NotificationCompat.Builder(appContext, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_finanzas)
            .setColor(Color.rgb(24, 184, 135))
            .setSubText("Finanzas")
            .setContentTitle(title)
            .setContentText(compactText)
            .setStyle(NotificationCompat.BigTextStyle().bigText(expandedText))
            .setContentIntent(pendingIntent)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setPublicVersion(publicVersion)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setOnlyAlertOnce(true)
            .setAutoCancel(true)
            .setShowWhen(true)
            .build()

        val notificationId = (candidateId.hashCode() and 0x7fffffff).coerceAtLeast(1)
        runCatching {
            manager.notify("possible-income-$candidateId", notificationId, notification)
        }
    }

    private fun createChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Posibles ingresos",
            NotificationManager.IMPORTANCE_DEFAULT
        ).apply {
            description = "Avisos cuando Finanzas detecta posibles ingresos que requieren confirmación"
            enableVibration(true)
            setShowBadge(true)
            lockscreenVisibility = NotificationCompat.VISIBILITY_PRIVATE
        }
        manager.createNotificationChannel(channel)
    }
}
