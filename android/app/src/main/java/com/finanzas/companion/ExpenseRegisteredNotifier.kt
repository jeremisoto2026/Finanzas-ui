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
import org.json.JSONObject
import java.text.NumberFormat
import java.util.Locale

/** Notifies only expenses actually inserted by the Preview backend. */
internal object ExpenseRegisteredNotifier {
    private const val CHANNEL_ID = "finanzas-expense-registered"

    fun show(context: Context, expense: JSONObject) {
        val appContext = context.applicationContext
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(appContext, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        val manager = NotificationManagerCompat.from(appContext)
        if (!manager.areNotificationsEnabled()) return
        createChannel(appContext)
        val captureId = expense.optString("captureId").trim()
        val merchant = expense.optString("merchant").trim().ifBlank { "Compra" }
        val amountCents = expense.optLong("amountCents", 0L)
        if (captureId.isBlank() || amountCents <= 0L) return
        val amount = NumberFormat.getCurrencyInstance(Locale.forLanguageTag("es-ES")).format(amountCents / 100.0)
        val category = expense.optString("categoryLabel").trim()
        val account = expense.optString("accountLabel").trim()
        val detail = listOfNotNull(category.takeIf { it.isNotBlank() }, account.takeIf { it.isNotBlank() }?.let { "Cuenta $it" }).joinToString(" · ")
        val expandedText = buildString {
            append(merchant); append("\n"); append(amount)
            if (detail.isNotBlank()) { append("\n"); append(detail) }
            append("\nRegistrado automáticamente por Finanzas.")
        }
        val openAppIntent = Intent(appContext, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra("finanzas_route", "expenses")
            putExtra("finanzas_item_id", captureId)
            putExtra("finanzas_merchant", merchant)
            putExtra("finanzas_amount_cents", amountCents)
        }
        val pendingIntent = PendingIntent.getActivity(
            appContext, captureId.hashCode() and 0x7fffffff, openAppIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val publicVersion = NotificationCompat.Builder(appContext, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_finanzas)
            .setContentTitle("Finanzas")
            .setContentText("Tienes un nuevo gasto registrado.")
            .setAutoCancel(true).build()
        val notification = NotificationCompat.Builder(appContext, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_finanzas)
            .setColor(Color.rgb(24, 184, 135))
            .setSubText("Finanzas")
            .setContentTitle("Gasto registrado")
            .setContentText("$merchant · $amount")
            .setStyle(NotificationCompat.BigTextStyle().bigText(expandedText))
            .setContentIntent(pendingIntent)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setPublicVersion(publicVersion)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setOnlyAlertOnce(true).setAutoCancel(true).setShowWhen(true).build()
        val notificationId = (captureId.hashCode() and 0x7fffffff).coerceAtLeast(1)
        runCatching { manager.notify("expense-$captureId", notificationId, notification) }
    }

    private fun createChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(NotificationChannel(
            CHANNEL_ID, "Gastos registrados", NotificationManager.IMPORTANCE_DEFAULT
        ).apply {
            description = "Confirmaciones de gastos registrados automáticamente por Finanzas"
            enableVibration(true)
            setShowBadge(true)
            lockscreenVisibility = NotificationCompat.VISIBILITY_PRIVATE
        })
    }
}
