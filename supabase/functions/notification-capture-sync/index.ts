import { createClient } from "npm:@supabase/supabase-js@2.119.0"

const ALLOWED_ORIGINS = new Set([
  "https://localhost",
  "http://localhost",
  "capacitor://localhost",
  "http://localhost:5173",
  "https://finanzas-ui-seven.vercel.app",
  "https://finanzas-ui-preview.vercel.app",
])

const SOURCE_PACKAGES: Record<string, { packageName: string; label: string }> = {
  revolut: {
    packageName: "com.revolut.revolut",
    label: "Revolut",
  },
  google_wallet: {
    packageName: "com.google.android.apps.walletnfcrel",
    label: "Google Wallet",
  },
}

const SOURCE_ALIASES: Record<string, string> = {
  revolut: "revolut",
  "google wallet": "google_wallet",
  google_wallet: "google_wallet",
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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

async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  )
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

type ValidCapture = {
  id: string
  merchant: string
  amountCents: number
  currencyCode: "EUR"
  occurredAt: string
  accountLabel: "Revolut"
  cardLast4: string | null
  categorySuggestion: string | null
  sources: string[]
  isPaired: boolean
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
  const sources = [...new Set(rawSources.map((source) =>
    SOURCE_ALIASES[String(source || "").trim().toLocaleLowerCase("es")]
  ).filter((source): source is string => Boolean(source)))]

  if (sources.length < 1 || sources.length > 2) {
    throw new Error("Una captura debe proceder de Revolut, Google Wallet o ambas.")
  }

  const rawCardLast4 = String(item.cardLast4 || "").trim()
  const cardLast4 = /^[0-9]{4}$/.test(rawCardLast4) ? rawCardLast4 : null
  const rawCategory = String(item.categorySuggestion || "").trim()
  const categorySuggestion = rawCategory.length >= 2
    ? rawCategory.slice(0, 120)
    : null

  return {
    id,
    merchant,
    amountCents,
    currencyCode: "EUR",
    occurredAt: new Date(occurredAtMillis).toISOString(),
    accountLabel: "Revolut",
    cardLast4,
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

    // The caller's JWT is forwarded to PostgREST. RLS is the ownership boundary.
    // Never use the service-role key for notification capture data.
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

    const categoryIds = new Map(
      (categories || []).map((category) => [normalizeText(category.name), category.id]),
    )

    const rows: Record<string, unknown>[] = []
    for (const capture of captures) {
      const pairKey = await sha256(userId + "|" + capture.id)
      const categoryId = capture.categorySuggestion
        ? categoryIds.get(normalizeText(capture.categorySuggestion)) || null
        : null
      const amount = capture.amountCents / 100
      const amountLabel = amount.toFixed(2).replace(".", ",")

      for (const sourceApp of capture.sources) {
        const source = SOURCE_PACKAGES[sourceApp]
        const fingerprint = await sha256(userId + "|" + capture.id + "|" + sourceApp)
        rows.push({
          user_id: userId,
          source_app: sourceApp,
          package_name: source.packageName,
          fingerprint,
          notification_title: capture.merchant,
          notification_text: `Pago detectado: ${amountLabel} EUR · Cuenta Revolut`,
          occurred_at: capture.occurredAt,
          status: capture.isPaired ? "paired" : "needs_review",
          pair_key: pairKey,
          parsed_merchant: capture.merchant,
          parsed_amount: amount,
          currency_code: capture.currencyCode,
          category_id: categoryId,
          category_suggestion: capture.categorySuggestion,
          account_label: capture.accountLabel,
          payment_channel: capture.sources.includes("google_wallet")
            ? "google_wallet"
            : "revolut",
          card_last4: capture.cardLast4,
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
