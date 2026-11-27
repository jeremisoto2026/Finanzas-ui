const OPENAI_URL = "https://api.openai.com/v1/responses"

// Explicitly disabled for the no-cost Preview phase. Change only after approval.
const OPENAI_ENABLED = false

function isEnabled() {
  return OPENAI_ENABLED && Deno.env.get("FINANCE_AI_ENABLED") === "true" &&
    Boolean(Deno.env.get("OPENAI_API_KEY")) &&
    Boolean(Deno.env.get("OPENAI_MODEL"))
}

function extractOutputText(payload) {
  for (const item of payload?.output || []) {
    if (item?.type !== "message") continue
    for (const content of item.content || []) {
      if (content?.type === "output_text" && typeof content.text === "string") {
        return content.text
      }
    }
  }
  return null
}

/**
 * Optional OpenAI fallback for unknown transaction descriptions.
 * Disabled unless an operator explicitly enables it and supplies server-side
 * credentials. Never sends amounts, dates, account identifiers, or raw alerts.
 * AI suggestions are advisory only and must always remain in manual review.
 */
export async function classifyUnknownWithOpenAI({
  direction,
  description,
  categories,
}) {
  if (!isEnabled()) return null
  if (!["expense", "income"].includes(direction)) return null

  const cleanDescription = String(description || "").replace(/\s+/g, " ").trim().slice(0, 160)
  const allowedCategories = [...new Set((categories || [])
    .map((item) => String(item?.name || "").trim())
    .filter(Boolean))]
    .slice(0, 80)
  if (cleanDescription.length < 2 || allowedCategories.length === 0) return null

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    const response = await fetch(OPENAI_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Authorization": "Bearer " + Deno.env.get("OPENAI_API_KEY"),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: Deno.env.get("OPENAI_MODEL"),
        store: false,
        max_output_tokens: 120,
        input: [
          {
            role: "system",
            content: "Clasifica descripciones financieras en español. No inventes datos. Elige exclusivamente una categoría de la lista permitida. Si no hay una coincidencia clara, usa null y confianza 0. Devuelve solo el esquema solicitado. La respuesta es una sugerencia y nunca autoriza registrar el movimiento.",
          },
          {
            role: "user",
            content: JSON.stringify({
              direction,
              description: cleanDescription,
              allowed_categories: allowedCategories,
            }),
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "finance_classification",
            strict: true,
            schema: {
              type: "object",
              properties: {
                category: { type: "string", enum: [...allowedCategories, "__none__"] },
                confidence: { type: "number" },
              },
              required: ["category", "confidence"],
              additionalProperties: false,
            },
          },
        },
      }),
    })

    if (!response.ok) return null
    const payload = await response.json()
    if (payload?.status !== "completed") return null
    const outputText = extractOutputText(payload)
    if (!outputText) return null

    const parsed = JSON.parse(outputText)
    const category = typeof parsed.category === "string" ? parsed.category.trim() : null
    const confidence = Number(parsed.confidence)
    if (!category || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) return null

    const allowed = allowedCategories.find((name) =>
      name.toLocaleLowerCase("es") === category.toLocaleLowerCase("es")
    )
    if (!allowed) return null

    return {
      category: allowed,
      confidence: Math.min(confidence, 0.89),
      source: "openai",
      requiresReview: true,
    }
  } catch {
    // Provider failures must never block or auto-post a bank capture.
    return null
  } finally {
    clearTimeout(timeout)
  }
}


/**
 * Free Preview classification for an unknown merchant.
 * Only the merchant label and the user's allowed expense category names are
 * sent to Cloudflare Workers AI. Never send notification text, amount, date,
 * account identifiers, or card data. The result is advisory and capped below
 * the automatic-post threshold so the user must review it.
 */
export async function classifyUnknownMerchantWithCloudflare({ merchant, categories }) {
  const accountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID")?.trim()
  const apiToken = Deno.env.get("CLOUDFLARE_API_TOKEN")?.trim()
  if (!accountId || !apiToken) return null

  const cleanMerchant = String(merchant || "").replace(/\s+/g, " ").trim().slice(0, 120)
  const allowedCategories = [...new Set((categories || [])
    .map((item) => String(item?.name || "").trim())
    .filter(Boolean))].slice(0, 80)
  if (cleanMerchant.length < 2 || allowedCategories.length === 0) return null

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch(
      "https://api.cloudflare.com/client/v4/accounts/" + encodeURIComponent(accountId) +
        "/ai/run/@cf/meta/llama-3.1-8b-instruct-fast",
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Authorization": "Bearer " + apiToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content: "Clasifica únicamente el nombre de un comercio en una categoría de gasto. No infieras importes, fechas, cuentas ni datos personales. Si no hay coincidencia clara, devuelve category null y confidence 0. Devuelve exclusivamente JSON.",
            },
            {
              role: "user",
              content: JSON.stringify({
                merchant: cleanMerchant,
                allowed_categories: allowedCategories,
              }),
            },
          ],
          max_tokens: 120,
          temperature: 0.1,
          response_format: {
            type: "json_schema",
            json_schema: {
              type: "object",
              properties: {
                category: { type: ["string", "null"] },
                confidence: { type: "number" },
              },
              required: ["category", "confidence"],
              additionalProperties: false,
            },
          },
        }),
      },
    )
    if (!response.ok) return null
    const payload = await response.json()
    let output = payload?.result?.response
      ?? payload?.result?.choices?.[0]?.message?.content
      ?? payload?.response
      ?? payload?.choices?.[0]?.message?.content
    if (typeof output === "string") {
      const cleaned = output.trim().replace(/^\x60{3}(?:json)?\s*/i, "").replace(/\s*\x60{3}$/, "")
      try { output = JSON.parse(cleaned) } catch { return null }
    }
    if (!output || typeof output !== "object" || Array.isArray(output)) return null
    const categoryName = typeof output.category === "string" && output.category !== "__none__" ? output.category.trim() : ""
    const allowed = allowedCategories.find((name) =>
      name.toLocaleLowerCase("es") === categoryName.toLocaleLowerCase("es")
    )
    const confidence = Number(output.confidence)
    if (!allowed || !Number.isFinite(confidence) || confidence < 0.65) return null
    return {
      category: allowed,
      confidence: Math.min(confidence, 0.89),
      source: "cloudflare-workers-ai",
      requiresReview: true,
    }
  } catch {
    // AI/provider failures must never block capture synchronization.
    return null
  } finally {
    clearTimeout(timeout)
  }
}
