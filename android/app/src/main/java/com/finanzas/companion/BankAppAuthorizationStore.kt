package com.finanzas.companion

import android.content.Context
import org.json.JSONArray

class BankAppAuthorizationStore(context: Context) {
    private val encrypted = EncryptedPreferences(context.applicationContext,
        namespace = "finanzas_bank_app_authorizations",
        keyAlias = "finanzas_bank_app_authorizations_v1")

    @Synchronized fun authorizedPackages(): Set<String> {
        val raw = encrypted.getString(KEY) ?: return emptySet()
        return try {
            val array = JSONArray(raw)
            buildSet { for (i in 0 until array.length()) {
                val value = array.optString(i).trim()
                if (PACKAGE_PATTERN.matches(value)) add(value)
            } }
        } catch (_: Exception) { emptySet() }
    }

    @Synchronized fun setAuthorizedPackages(packages: Set<String>) {
        val array = JSONArray()
        packages.filter(PACKAGE_PATTERN::matches).distinct().sorted().forEach(array::put)
        encrypted.putString(KEY, array.toString())
    }

    companion object {
        private const val KEY = "authorized_packages"
        private val PACKAGE_PATTERN = Regex("^[A-Za-z][A-Za-z0-9_]*(\\.[A-Za-z0-9_]+)+$")
    }
}