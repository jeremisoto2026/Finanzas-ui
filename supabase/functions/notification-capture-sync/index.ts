import { createClient } from "npm:@supabase/supabase-js@2.119.0"

const ALLOWED_ORIGINS = new Set([
  "https://localhost",
  "http://localhost",
  "capacitor://localhost",
  "http://localhost:5173",
  "https://finanzas-ui-seven.vercel.app",
  "https://finanzas-ui-preview.vercel.app",
])

const KNOWN_SOURCES: Record<string, { packageName: string; label: string; isWallet: boolean }> = {
  revolut: {
    packageName: "com.revolut.revolut",
    label: "Revolut",
    isWallet: false,
  },
  bbva: {
    packageName: "com.bbva.bbvacontigo",
    label: "BBVA",
    isWallet: false,
  },
  google_wallet: {
    packageName: "com.google.android.apps.walletnfcrel",
    label: "Google Wallet",
    isWallet: true,
  },
}

const LEGACY_SOURCE_KEYS: Record<string, string> = {
  REVOLUT: "revolut",
  BBVA: "bbva",
  GOOGLE_WALLET: "google_wallet",
  "google wallet": "google_wallet",
  "Google Wallet": "google_wallet",
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PACKAGE_PATTERN = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/

function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
    "Vary": "Origin",
  }
}

function json(data: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  })
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("es")
}

type AccountRow = {
  id: string
  name: string
  institution?: string | null
  currency_code: string
  is_active: boolean
  account_type?: string
}

type AccountSourceMapping = {
  account_id: string
  source_app: string
  is_active: boolean
}

type CaptureSource = {
  sourceApp: string
  packageName: string
  label: string
  isWallet: boolean
}

type ValidCapture = {
  id: string
  merchant: string
  amountCents: number
  currencyCode: "EUR"
  occurredAt: string
  accountLabel: string | null
  categorySuggestion: string | null
  sources: CaptureSource[]
  isPaired: boolean
}

/**
 * A bank-only notice is routed through its own app-to-account mapping.
 * Wallet-only is automatically routed only when the user has exactly one
 * active bank source linked. Multiple linked banks require manual review.
 */
function isEligibleBankAccount(account: AccountRow, currencyCode: string) {
  const accountType = String(account.account_type || "bank").toLowerCase()
  return account.is_active === true &&
    String(account.currency_code || "EUR").trim().toUpperCase() === currencyCode &&
    ["bank", "debit_card", "credit_card", "digital_wallet", "savings"].includes(accountType)
}

function resolveMappedAccount(
  capture: ValidCapture,
  mappings: AccountSourceMapping[],
  accounts: AccountRow[],
) {
  const bankSources = capture.sources.filter((source) => !source.isWallet)
  const activeMappings = mappings.filter((mapping) => mapping.is_active)

  if (bankSources.length === 1) {
    const bankSource = bankSources[0]
    const savedMapping = mappings.find((mapping) => mapping.source_app === bankSource.sourceApp)

    // Respect an explicit opt-out. An inactive mapping must never be silently re-enabled.
    if (savedMapping && !savedMapping.is_active) return null

    if (savedMapping?.is_active) {
      return accounts.find((item) =>
        item.id === savedMapping.account_id && isEligibleBankAccount(item, capture.currencyCode)
      ) || null
    }

    // First resolve an exact account-name or institution match. This lets a
    // user with several accounts route CaixaBank/Santander/etc. by their own
    // account metadata without a hardcoded list of bank brands.
    const eligibleAccounts = accounts.filter((item) =>
      isEligibleBankAccount(item, capture.currencyCode)
    )
    const sourceLabel = normalizeText(bankSource.label)
    const exactMatches = eligibleAccounts.filter((item) =>
      normalizeText(item.name) === sourceLabel ||
      normalizeText(String(item.institution || "")) === sourceLabel
    )
    if (exactMatches.length === 1) return exactMatches[0]
    if (exactMatches.length > 1) return null

    // A sole eligible account is also an unambiguous first-use destination.
    return eligibleAccounts.length === 1 ? eligibleAccounts[0] : null
  }

  if (bankSources.length > 1) return null

  // Wallet-only notices can use an existing bank link only when exactly one is active.
  if (activeMappings.length !== 1) return null
  return accounts.find((item) =>
    item.id === activeMappings[0].account_id &&
    isEligibleBankAccount(item, capture.currencyCode)
  ) || null
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  )
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

function normalizeCaptureSource(value: unknown): CaptureSource {
  if (typeof value === "string") {
    const legacyKey = LEGACY_SOURCE_KEYS[value] ||
      LEGACY_SOURCE_KEYS[value.trim()] ||
      value.trim().toLocaleLowerCase("es")
    const known = KNOWN_SOURCES[legacyKey]
    if (!known) {
      throw new Error("La aplicación de origen de una captura no es válida.")
    }
    return {
      sourceApp: legacyKey,
      packageName: known.packageName,
      label: known.label,
      isWallet: known.isWallet,
    }
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Una aplicación de origen tiene un formato incorrecto.")
  }

  const item = value as Record<string, unknown>
  const requestedKey = String(item.sourceApp || item.appId || "").trim()
  const known = KNOWN_SOURCES[requestedKey]
  if (known) {
    return {
      sourceApp: requestedKey,
      packageName: known.packageName,
      label: known.label,
      isWallet: known.isWallet,
    }
  }

  if (!requestedKey.startsWith("android:")) {
    throw new Error("La clave de una aplicación bancaria no es válida.")
  }

  const packageName = String(item.packageName || "").trim()
  const expectedKey = "android:" + packageName
  if (
    !PACKAGE_PATTERN.test(packageName) ||
    requestedKey !== expectedKey ||
    packageName.length > 180
  ) {
    throw new Error("El paquete de la aplicación bancaria no es válido.")
  }

  const label = String(item.label || packageName.substring(packageName.lastIndexOf(".") + 1))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100)
  if (label.length < 2) {
    throw new Error("El nombre de la aplicación de origen no es válido.")
  }

  return {
    sourceApp: requestedKey,
    packageName,
    label,
    isWallet: false,
  }
}

function normalizeMerchantKey(value: string) {
  return normalizeText(value)
    .toLocaleUpperCase("es")
    .replace(/(?<=\p{L})-(?=\p{L})/gu, "")
    .replace(/\b(COMPRA|TARJETA|PAGO|PAGADO|PAYMENT|CONTACTLESS|TPV|POS|REVOLUT|GOOGLE|WALLET)\b/g, " ")
    .replace(/\b\d{2,}\b/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 120)
}

function validateCapture(value: unknown): ValidCapture {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Una captura tiene un formato incorrecto.")
  }

  const item = value as Record<string, unknown>
  const id = String(item.id || "")
  if (!UUID_PATTERN.test(id)) {
    throw new Error("Una captura no tiene un identificador válido.")
  }

  const merchant = String(item.merchant || "").trim().slice(0, 160)
  if (merchant.length < 2) {
    throw new Error("Una captura no contiene un comercio válido.")
  }

  const amountCents = Number(item.amountCents)
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > 100_000_000) {
    throw new Error("Una captura no contiene un importe válido.")
  }

  const currencyCode = String(item.currencyCode || "EUR").trim().toUpperCase()
  if (currencyCode !== "EUR") {
    throw new Error("Por ahora solo se admiten pagos en EUR.")
  }

  const occurredAtMillis = Number(item.occurredAtMillis)
  if (!Number.isFinite(occurredAtMillis) || occurredAtMillis < 1_500_000_000_000 ||
    occurredAtMillis > Date.now() + 10 * 60 * 1000) {
    throw new Error("Una captura contiene una fecha no válida.")
  }

  const rawSources = Array.isArray(item.sources) ? item.sources : []
  if (rawSources.length < 1 || rawSources.length > 2) {
    throw new Error("Una captura debe proceder de una app bancaria o de Google Wallet.")
  }

  const sourceMap = new Map<string, CaptureSource>()
  for (const rawSource of rawSources) {
    const source = normalizeCaptureSource(rawSource)
    sourceMap.set(source.sourceApp, source)
  }
  const sources = [...sourceMap.values()]
  if (sources.length < 1 || sources.length > 2) {
    throw new Error("Una captura contiene demasiadas aplicaciones de origen.")
  }

  const walletSources = sources.filter((source) => source.isWallet)
  const bankSources = sources.filter((source) => !source.isWallet)
  if (
    walletSources.length > 1 ||
    bankSources.length > 1 ||
    (sources.length === 2 && (walletSources.length !== 1 || bankSources.length !== 1))
  ) {
    throw new Error("Solo se permite cruzar una app bancaria con Google Wallet.")
  }

  const rawCategory = String(item.categorySuggestion || "").trim()
  const categorySuggestion = rawCategory.length >= 2
    ? rawCategory.slice(0, 120)
    : null

  const accountLabel = bankSources[0]?.label ||
    String(item.accountName || item.accountLabel || "").trim().slice(0, 100) ||
    null

  return {
    id,
    merchant,
    amountCents,
    currencyCode: "EUR",
    occurredAt: new Date(occurredAtMillis).toISOString(),
    accountLabel,
    categorySuggestion,
    sources,
    isPaired: sources.length > 1 && item.isPaired === true,
  }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || ""

  if (req.method === "OPTIONS") {
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return new Response("Origen no autorizado.", { status: 403 })
    }
    return new Response("ok", { status: 200, headers: corsHeaders(origin) })
  }

  if (req.method !== "POST") {
    return json({ error: "Método no permitido." }, 405, origin)
  }

  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return json({ error: "Origen no autorizado." }, 403, origin)
  }

  try {
    const authorization = req.headers.get("Authorization") || ""
    const token = authorization.replace(/^Bearer\s+/i, "").trim()
    if (!token) {
      return json({ error: "Debes iniciar sesión para sincronizar capturas." }, 401, origin)
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const publishableKey = Deno.env.get("SUPABASE_ANON_KEY") ||
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY")

    if (!supabaseUrl || !publishableKey) {
      throw new Error("Falta la configuración del cliente Supabase.")
    }

    // User JWT is forwarded to PostgREST; every query remains protected by RLS.
    // The function does not use the service-role key.
    const supabase = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: authorization } },
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    })

    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authData?.user) {
      return json({ error: "La sesión no es válida o ha caducado." }, 401, origin)
    }

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object" || !Array.isArray(body.captures)) {
      return json({ error: "El contenido de sincronización no es válido." }, 400, origin)
    }

    if (body.captures.length > 100) {
      return json({ error: "Se pueden sincronizar como máximo 100 capturas por envío." }, 413, origin)
    }

    if (body.captures.length === 0) {
      return json({ ok: true, syncedCaptures: 0, syncedEvents: 0 }, 200, origin)
    }

    const captures = body.captures.map(validateCapture)
    const userId = authData.user.id

    const { data: categories, error: categoryError } = await supabase
      .from("categories")
      .select("id, name")
      .eq("user_id", userId)
      .eq("is_active", true)
      .in("direction", ["expense", "both"])
    if (categoryError) throw categoryError

    const { data: accounts, error: accountError } = await supabase
      .from("accounts")
      .select("id, name, institution, currency_code, is_active, account_type")
      .eq("user_id", userId)
    if (accountError) throw accountError

    const { data: accountMappings, error: mappingError } = await supabase
      .from("account_notification_sources")
      .select("account_id, source_app, is_active")
      .eq("user_id", userId)
    if (mappingError) throw mappingError

    const { data: merchantRules, error: ruleError } = await supabase
      .from("merchant_category_rules")
      .select("merchant_key, category_id, confidence, source")
      .eq("user_id", userId)
    if (ruleError) throw ruleError

    const categoryIds = new Map(
      (categories || []).map((category) => [normalizeText(category.name), category.id]),
    )
    const expenseCategoryIds = new Set((categories || []).map((category) => category.id))
    const rulesByKey = new Map((merchantRules || []).map((rule) => [
      String(rule.merchant_key || ""),
      rule,
    ]))

    const rows: Record<string, unknown>[] = []
    let autoPosted = 0
    let pendingReview = 0

    for (const capture of captures) {
      const pairKey = await sha256(userId + "|" + capture.id)
      const merchantKey = normalizeMerchantKey(capture.merchant)
      const savedRule = rulesByKey.get(merchantKey)
      const ruleCategoryId = savedRule &&
        Number(savedRule.confidence || 0) >= 0.9 &&
        expenseCategoryIds.has(savedRule.category_id)
        ? savedRule.category_id
        : null
      const suggestedCategoryId = capture.categorySuggestion
        ? categoryIds.get(normalizeText(capture.categorySuggestion)) || null
        : null
      const fallbackCategoryId = categoryIds.get(normalizeText("Otros")) ||
        (categories || [])[0]?.id || null
      const categoryId = ruleCategoryId || suggestedCategoryId || fallbackCategoryId

      const account = resolveMappedAccount(
        capture,
        (accountMappings || []) as AccountSourceMapping[],
        (accounts || []) as AccountRow[],
      )

      // Persist the unambiguous single-account fallback as the user's default
      // for this newly discovered bank package. Existing inactive links stay disabled.
      const detectedBankSource = capture.sources.find((source) => !source.isWallet)
      const savedSourceMapping = detectedBankSource
        ? (accountMappings || []).find((mapping) =>
            mapping.source_app === detectedBankSource.sourceApp
          )
        : null
      if (account && detectedBankSource && !savedSourceMapping) {
        const { error: autoLinkError } = await supabase
          .from("account_notification_sources")
          .upsert({
            user_id: userId,
            source_app: detectedBankSource.sourceApp,
            source_label: detectedBankSource.label,
            account_id: account.id,
            is_active: true,
            updated_at: new Date().toISOString(),
          }, { onConflict: "user_id,source_app" })
        if (autoLinkError) throw autoLinkError
        accountMappings?.push({
          account_id: account.id,
          source_app: detectedBankSource.sourceApp,
          is_active: true,
        })
      }

      // Keep manual review idempotent when the bank alert arrives after Wallet
      // or when an older Preview APK has already created this expense.
      let transactionId: string | null = null
      let transactionAccountId: string | null = null
      let transactionCategoryId: string | null = null

      const { data: existingByPair, error: existingPairError } = await supabase
        .from("transactions")
        .select("id, account_id, category_id")
        .eq("user_id", userId)
        .eq("idempotency_key", pairKey)
        .eq("kind", "expense")
        .maybeSingle()
      if (existingPairError) throw existingPairError

      let existing = existingByPair
      if (!existing) {
        const { data: legacy, error: legacyError } = await supabase
          .from("transactions")
          .select("id, account_id, category_id")
          .eq("user_id", userId)
          .eq("idempotency_key", capture.id)
          .eq("kind", "expense")
          .maybeSingle()
        if (legacyError) throw legacyError
        existing = legacy
      }

      if (existing?.id) {
        transactionId = existing.id
        transactionAccountId = existing.account_id
        transactionCategoryId = existing.category_id
      } else if (account?.id && categoryId) {
        const occurredOn = new Intl.DateTimeFormat("sv-SE", {
          timeZone: "Europe/Madrid",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(capture.occurredAt))
        const { data: inserted, error: insertError } = await supabase
          .from("transactions")
          .insert({
            user_id: userId,
            account_id: account.id,
            category_id: categoryId,
            kind: "expense",
            status: "posted",
            amount: Math.round((capture.amountCents / 100 + Number.EPSILON) * 100) / 100,
            occurred_on: occurredOn,
            description: capture.merchant,
            payment_method: "Tarjeta",
            idempotency_key: pairKey,
          })
          .select("id")
          .single()

        if (insertError && insertError.code === "23505") {
          const { data: replay, error: replayError } = await supabase
            .from("transactions")
            .select("id, account_id, category_id")
            .eq("user_id", userId)
            .eq("idempotency_key", pairKey)
            .eq("kind", "expense")
            .single()
          if (replayError) throw replayError
          transactionId = replay.id
          transactionAccountId = replay.account_id
          transactionCategoryId = replay.category_id
        } else if (insertError) {
          throw insertError
        } else {
          transactionId = inserted.id
          transactionAccountId = account.id
          transactionCategoryId = categoryId
        }
      }

      const resolvedCategoryId = transactionCategoryId || categoryId
      const autoPost = Boolean(transactionId && transactionAccountId && resolvedCategoryId)
      if (autoPost) autoPosted += 1
      else pendingReview += 1

      const accountLabel = (accounts || []).find((item) => item.id === transactionAccountId)?.name ||
        account?.name || capture.accountLabel || null
      const amountLabel = (capture.amountCents / 100).toFixed(2).replace(".", ",")
      for (const source of capture.sources) {
        const fingerprint = await sha256(userId + "|" + capture.id + "|" + source.sourceApp)
        rows.push({
          user_id: userId,
          source_app: source.sourceApp,
          source_label: source.label,
          package_name: source.packageName,
          fingerprint,
          notification_title: capture.merchant,
          // Store a normalized summary, never the original notification body.
          notification_text: "Pago detectado: " + amountLabel + " EUR · " +
            source.label + " · Cuenta " + (accountLabel || "sin identificar"),
          occurred_at: capture.occurredAt,
          status: autoPost ? "posted" : "needs_review",
          pair_key: pairKey,
          parsed_merchant: capture.merchant,
          parsed_amount: capture.amountCents / 100,
          currency_code: capture.currencyCode,
          category_id: resolvedCategoryId,
          category_suggestion: capture.categorySuggestion,
          account_label: accountLabel,
          account_id: transactionAccountId,
          payment_channel: capture.sources.some((item) => item.isWallet)
            ? "google_wallet"
            : source.sourceApp,
          matched_transaction_id: transactionId,
        })
      }
    }

    const { data: savedRows, error: saveError } = await supabase
      .from("notification_capture_events")
      .upsert(rows, {
        onConflict: "user_id,source_app,fingerprint",
        ignoreDuplicates: false,
      })
      .select("id")
    if (saveError) throw saveError

    return json({
      ok: true,
      syncedCaptures: captures.length,
      syncedEvents: savedRows?.length || rows.length,
      autoPosted,
      pendingReview,
    }, 200, origin)
  } catch (error) {
    console.error("notification-capture-sync error:", error)
    return json({
      error: error instanceof Error
        ? error.message
        : "No se pudieron sincronizar las capturas.",
    }, 500, origin)
  }
})
