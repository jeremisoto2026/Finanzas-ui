package com.finanzas.companion

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors

class MainActivity : Activity() {
    private val worker = Executors.newSingleThreadExecutor()

    private lateinit var authRepository: SupabaseAuthRepository
    private lateinit var captureStore: CaptureStore

    private lateinit var authSection: LinearLayout
    private lateinit var emailInput: EditText
    private lateinit var passwordInput: EditText
    private lateinit var authMessage: TextView
    private lateinit var signInButton: Button
    private lateinit var signOutButton: Button
    private lateinit var permissionStatus: TextView
    private lateinit var captureList: LinearLayout
    private lateinit var emptyCaptures: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = Color.rgb(9, 15, 27)
        window.navigationBarColor = Color.rgb(9, 15, 27)

        authRepository = SupabaseAuthRepository(applicationContext)
        captureStore = CaptureStore(applicationContext)

        setContentView(buildScreen())
        renderAuthentication()
        renderPermissionState()
        renderCaptures()
    }

    override fun onResume() {
        super.onResume()
        CaptureEvents.onChanged = {
            runOnUiThread { renderCaptures() }
        }
        if (::permissionStatus.isInitialized) renderPermissionState()
        if (::captureList.isInitialized) renderCaptures()
    }

    override fun onPause() {
        CaptureEvents.onChanged = null
        super.onPause()
    }

    override fun onDestroy() {
        worker.shutdown()
        super.onDestroy()
    }

    private fun buildScreen(): View {
        val scroll = ScrollView(this).apply {
            setBackgroundColor(Color.rgb(9, 15, 27))
            isFillViewport = true
        }
        val page = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(28), dp(20), dp(32))
        }
        scroll.addView(
            page,
            ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            )
        )

        page.addView(
            label("FINANZAS", 13, Color.rgb(56, 189, 248), Typeface.BOLD),
            spacedParams(bottom = 8)
        )
        page.addView(
            label("Conector personal", 28, Color.WHITE, Typeface.BOLD),
            spacedParams(bottom = 8)
        )
        page.addView(
            label(
                "POCO F8 Pro · Captura local de pagos",
                14,
                Color.rgb(148, 163, 184)
            ),
            spacedParams(bottom = 18)
        )

        page.addView(
            pill("PRUEBA PRIVADA · SIN SINCRONIZACIÓN", Color.rgb(15, 65, 62), Color.rgb(110, 231, 183)),
            spacedParams(bottom = 22)
        )

        page.addView(sectionTitle("Cuenta de Finanzas"), spacedParams(bottom = 10))
        authSection = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = panelBackground()
            setPadding(dp(16), dp(16), dp(16), dp(16))
        }
        emailInput = input("Correo de tu cuenta de Finanzas", false).apply {
            inputType = android.text.InputType.TYPE_CLASS_TEXT or
                android.text.InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
            imeOptions = EditorInfo.IME_ACTION_NEXT
        }
        passwordInput = input("Contraseña", true).apply {
            inputType = android.text.InputType.TYPE_CLASS_TEXT or
                android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD
            imeOptions = EditorInfo.IME_ACTION_DONE
        }
        authMessage = label("Inicia sesión con la cuenta que ya utilizas en Finanzas.", 13, MUTED)
        signInButton = actionButton("Iniciar sesión", BLUE) { signIn() }
        signOutButton = actionButton("Cerrar sesión", DARK_BUTTON) { signOut() }

        authSection.addView(emailInput, spacedParams(bottom = 10))
        authSection.addView(passwordInput, spacedParams(bottom = 10))
        authSection.addView(authMessage, spacedParams(bottom = 14))
        authSection.addView(signInButton)
        authSection.addView(signOutButton, spacedParams(top = 8))
        page.addView(authSection, spacedParams(bottom = 24))

        page.addView(sectionTitle("Permiso de notificaciones"), spacedParams(bottom = 10))
        val permissions = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = panelBackground()
            setPadding(dp(16), dp(16), dp(16), dp(16))
        }
        permissionStatus = label("", 14, Color.WHITE)
        permissions.addView(permissionStatus, spacedParams(bottom = 12))
        permissions.addView(
            label(
                "Activa el acceso de Finanzas en Ajustes. El servicio comprueba primero el paquete y solo procesa Revolut y Google Wallet.",
                12,
                MUTED
            ),
            spacedParams(bottom = 14)
        )
        permissions.addView(
            actionButton("Abrir ajustes de acceso a notificaciones", BLUE) {
                try {
                    startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
                } catch (_: Exception) {
                    Toast.makeText(this, "Abre Ajustes y busca Acceso a notificaciones.", Toast.LENGTH_LONG).show()
                }
            }
        )
        page.addView(permissions, spacedParams(bottom = 24))

        page.addView(sectionTitle("Compras detectadas"), spacedParams(bottom = 10))
        val capturesPanel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = panelBackground()
            setPadding(dp(16), dp(16), dp(16), dp(16))
        }
        capturesPanel.addView(
            label(
                "Las notificaciones se procesan en este teléfono. Si llegan los avisos de las dos aplicaciones, se agrupan como una sola compra.",
                12,
                MUTED
            ),
            spacedParams(bottom = 12)
        )
        emptyCaptures = label("Todavía no se han detectado pagos.", 13, MUTED)
        capturesPanel.addView(emptyCaptures, spacedParams(bottom = 8))
        captureList = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
        }
        capturesPanel.addView(captureList)
        capturesPanel.addView(
            actionButton("Borrar capturas locales", DARK_BUTTON) { confirmClearCaptures() },
            spacedParams(top = 12)
        )
        page.addView(capturesPanel, spacedParams(bottom = 24))

        val privacyPanel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = roundedBackground(Color.rgb(18, 28, 43), 14)
            setPadding(dp(16), dp(14), dp(16), dp(14))
        }
        privacyPanel.addView(label("Privacidad y límites", 14, Color.WHITE, Typeface.BOLD), spacedParams(bottom = 8))
        privacyPanel.addView(
            label(
                "• Solo Revolut y Google Wallet.\n" +
                    "• No se leen otras aplicaciones.\n" +
                    "• Capturas cifradas en el dispositivo.\n" +
                    "• No se envían avisos a Finanzas todavía.\n" +
                    "• No se crean gastos ni se cambian saldos.",
                12,
                MUTED
            )
        )
        page.addView(privacyPanel)

        return scroll
    }

    private fun renderAuthentication() {
        val user = authRepository.currentUser()
        if (user == null) {
            emailInput.visibility = View.VISIBLE
            passwordInput.visibility = View.VISIBLE
            signInButton.visibility = View.VISIBLE
            signOutButton.visibility = View.GONE
            authMessage.text = "Inicia sesión con la cuenta que ya utilizas en Finanzas."
            authMessage.setTextColor(MUTED)
        } else {
            emailInput.visibility = View.GONE
            passwordInput.visibility = View.GONE
            signInButton.visibility = View.GONE
            signOutButton.visibility = View.VISIBLE
            authMessage.text = "Sesión local vinculada a ${user.email}. No se sincronizan movimientos."
            authMessage.setTextColor(Color.rgb(110, 231, 183))
        }
    }

    private fun signIn() {
        val email = emailInput.text?.toString().orEmpty().trim()
        val password = passwordInput.text?.toString().orEmpty()

        signInButton.isEnabled = false
        authMessage.text = "Comprobando tu cuenta…"
        authMessage.setTextColor(MUTED)

        worker.execute {
            try {
                val user = authRepository.signIn(email, password)
                runOnUiThread {
                    passwordInput.text?.clear()
                    authMessage.text = "Sesión iniciada para ${user.email}."
                    authMessage.setTextColor(Color.rgb(110, 231, 183))
                    signInButton.isEnabled = true
                    renderAuthentication()
                }
            } catch (error: Exception) {
                runOnUiThread {
                    authMessage.text = error.message ?: "No se pudo iniciar sesión."
                    authMessage.setTextColor(Color.rgb(251, 146, 146))
                    signInButton.isEnabled = true
                }
            }
        }
    }

    private fun signOut() {
        authRepository.signOut()
        renderAuthentication()
        Toast.makeText(this, "Sesión cerrada en el conector.", Toast.LENGTH_SHORT).show()
    }

    private fun renderPermissionState() {
        val enabled = try {
            val listeners = Settings.Secure.getString(
                contentResolver,
                "enabled_notification_listeners"
            ).orEmpty()
            listeners.contains(packageName)
        } catch (_: Exception) {
            false
        }

        if (enabled) {
            permissionStatus.text = "Acceso activado. El conector está preparado para recibir avisos permitidos."
            permissionStatus.setTextColor(Color.rgb(110, 231, 183))
        } else {
            permissionStatus.text = "Acceso todavía desactivado."
            permissionStatus.setTextColor(Color.rgb(251, 191, 36))
        }
    }

    private fun renderCaptures() {
        if (!::captureList.isInitialized) return
        captureList.removeAllViews()
        val captures = captureStore.readAll()

        emptyCaptures.visibility = if (captures.isEmpty()) View.VISIBLE else View.GONE
        captures.take(12).forEachIndexed { index, capture ->
            val card = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                background = roundedBackground(Color.rgb(12, 20, 33), 12)
                setPadding(dp(12), dp(12), dp(12), dp(12))
            }

            val top = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
            }
            val merchant = label(capture.merchant, 14, Color.WHITE, Typeface.BOLD)
            top.addView(merchant, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            val status = if (capture.isPaired) "Avisos unidos" else "Un aviso"
            top.addView(
                pill(
                    status,
                    if (capture.isPaired) Color.rgb(15, 65, 62) else Color.rgb(75, 55, 20),
                    if (capture.isPaired) Color.rgb(110, 231, 183) else Color.rgb(253, 230, 138)
                )
            )
            card.addView(top)

            val amount = capture.amountCents / 100.0
            val amountText = String.format(Locale("es", "ES"), "%.2f €", amount)
            card.addView(
                label(amountText, 20, Color.rgb(110, 231, 183), Typeface.BOLD),
                spacedParams(top = 8, bottom = 5)
            )

            val dateText = SimpleDateFormat("dd/MM/yyyy · HH:mm", Locale("es", "ES"))
                .format(Date(capture.occurredAtMillis))
            val sourceText = capture.sources.joinToString(" + ") { it.label }
            val details = buildString {
                append(capture.accountName)
                if (!capture.cardLast4.isNullOrBlank()) append(" · Visa ••${capture.cardLast4}")
                if (!capture.categorySuggestion.isNullOrBlank()) append(" · ${capture.categorySuggestion}")
            }
            card.addView(label(dateText, 11, MUTED))
            card.addView(label(sourceText, 11, MUTED), spacedParams(top = 3))
            card.addView(label(details, 11, MUTED), spacedParams(top = 3))

            captureList.addView(card, spacedParams(top = if (index == 0) 0 else 8))
        }
    }

    private fun confirmClearCaptures() {
        AlertDialog.Builder(this)
            .setTitle("Borrar capturas locales")
            .setMessage("Se eliminará el historial guardado en este teléfono. No afecta a los gastos de Finanzas.")
            .setNegativeButton("Cancelar", null)
            .setPositiveButton("Borrar") { _, _ ->
                captureStore.clear()
                renderCaptures()
            }
            .show()
    }

    private fun sectionTitle(value: String): TextView =
        label(value, 16, Color.WHITE, Typeface.BOLD)

    private fun label(
        value: String,
        sizeSp: Int,
        color: Int,
        style: Int = Typeface.NORMAL
    ): TextView = TextView(this).apply {
        text = value
        textSize = sizeSp.toFloat()
        setTextColor(color)
        typeface = Typeface.create("sans-serif", style)
        setLineSpacing(dp(2).toFloat(), 1f)
    }

    private fun input(hintText: String, isPassword: Boolean): EditText =
        EditText(this).apply {
            hint = hintText
            textSize = 14f
            setTextColor(Color.WHITE)
            setHintTextColor(Color.rgb(100, 116, 139))
            setPadding(dp(12), dp(11), dp(12), dp(11))
            background = roundedBackground(Color.rgb(9, 15, 27), 10)
            if (isPassword) {
                inputType = android.text.InputType.TYPE_CLASS_TEXT or
                    android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD
            }
        }

    private fun actionButton(
        textValue: String,
        color: Int,
        onClick: () -> Unit
    ): Button = Button(this).apply {
        text = textValue
        textSize = 13f
        isAllCaps = false
        setTextColor(Color.WHITE)
        backgroundTintList = android.content.res.ColorStateList.valueOf(color)
        setOnClickListener { onClick() }
    }

    private fun pill(textValue: String, backgroundColor: Int, textColor: Int): TextView =
        TextView(this).apply {
            text = textValue
            textSize = 10f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(textColor)
            setPadding(dp(10), dp(6), dp(10), dp(6))
            background = roundedBackground(backgroundColor, 30)
        }

    private fun panelBackground() = roundedBackground(Color.rgb(18, 28, 43), 16)

    private fun roundedBackground(color: Int, radius: Int): GradientDrawable =
        GradientDrawable().apply {
            setColor(color)
            cornerRadius = dp(radius).toFloat()
        }

    private fun spacedParams(
        top: Int = 0,
        bottom: Int = 0
    ) = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.WRAP_CONTENT
    ).apply {
        topMargin = dp(top)
        bottomMargin = dp(bottom)
    }

    private fun dp(value: Int): Int =
        (value * resources.displayMetrics.density).toInt()

    companion object {
        private val BLUE = Color.rgb(2, 132, 199)
        private val DARK_BUTTON = Color.rgb(51, 65, 85)
        private val MUTED = Color.rgb(148, 163, 184)
    }
}
