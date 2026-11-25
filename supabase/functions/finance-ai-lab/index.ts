import { createClient } from "npm:@supabase/supabase-js@2.119.0"

const ALLOWED_ORIGINS = new Set([
  "https://localhost",
  "http://localhost:5173",
  "https://finanzas-ui-git-feat-finanzas-9b2dbf-jeremis-projects-53da5f18.vercel.app",
])

function isAllowedOrigin(origin: string) {
  if (ALLOWED_ORIGINS.has(origin)) return true
  return /^https:\/\/finanzas-[a-z0-9-]+-jeremis-projects-53da5f18\.vercel\.app$/.test(origin)
}

function response(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
      "Vary": "Origin",
    },
  })
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || ""

  if (req.method === "OPTIONS") {
    if (!origin || !isAllowedOrigin(origin)) return new Response("Origen no autorizado.", { status: 403 })
    return new Response("ok", {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
        "Vary": "Origin",
      },
    })
  }

  if (req.method !== "POST") return response({ error: "Método no permitido." }, 405, origin || "null")
  if (!origin || !isAllowedOrigin(origin)) return response({ error: "Origen no autorizado." }, 403, origin || "null")

  try {
    const authorization = req.headers.get("Authorization") || ""
    const token = authorization.replace(/^Bearer\s+/i, "").trim()
    if (!token) return response({ error: "Debes iniciar sesión." }, 401, origin)

    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")
    if (!supabaseUrl || !supabaseKey) throw new Error("La función no tiene la configuración de Supabase.")
    const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authData?.user) return response({ error: "Tu sesión no es válida. Vuelve a iniciar sesión." }, 401, origin)

    const apiKey = Deno.env.get("GEMINI_API_KEY")
    if (!apiKey) return response({ error: "Gemini todavía no está conectado. Añade GEMINI_API_KEY a los secretos de Supabase Preview." }, 503, origin)

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return response({ error: "La solicitud no tiene un formato válido." }, 400, origin)
    }

    const description = String(body.description || "").replace(/\s+/g, " ").trim().slice(0, 180)
    const categories = [...new Map((Array.isArray(body.categories) ? body.categories : [])
      .map((item: any) => ({
        name: String(item?.name || "").trim().slice(0, 60),
        direction: ["income", "expense", "both"].includes(item?.direction) ? item.direction : "both",
      }))
      .filter((item: any) => item.name.length >= 2)
      .map((item: any) => [item.name.toLocaleLowerCase("es"), item])).values()].slice(0, 60)

    if (description.length < 3 || categories.length === 0) {
      return response({ error: "Indica una descripción breve y asegúrate de tener categorías disponibles." }, 400, origin)
    }

    const categoryOptions = categories.map((item: any) => item.name + " [" + item.direction + "]")
    const freeModelPreference = ["gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-2.5-flash-lite"]
    let availableModels = new Set<string>()
    const listController = new AbortController()
    const listTimeout = setTimeout(() => listController.abort(), 5000)
    try {
      const listResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/models?key=" + encodeURIComponent(apiKey), { signal: listController.signal })
      if (listResponse.ok) {
        const listPayload = await listResponse.json()
        availableModels = new Set((Array.isArray(listPayload?.models) ? listPayload.models : [])
          .filter((item: any) => Array.isArray(item?.supportedGenerationMethods) && item.supportedGenerationMethods.includes("generateContent"))
          .map((item: any) => String(item?.name || "").replace("models/", ""))
          .filter((name: string) => freeModelPreference.includes(name)))
      } else {
        console.warn("Gemini models.list unavailable", { status: listResponse.status })
      }
    } catch (error) {
      console.warn("Gemini models.list failed; using restricted fallback list", error instanceof Error ? error.message : String(error))
    } finally {
      clearTimeout(listTimeout)
    }

    const candidateModels = freeModelPreference.filter((name) => availableModels.size === 0 || availableModels.has(name))
    if (candidateModels.length === 0) {
      return response({ error: "La clave de Gemini no tiene modelos gratuitos de texto compatibles habilitados." }, 503, origin)
    }

    const requestPayload = {
      contents: [{
        role: "user",
        parts: [{
          text: [
            "Eres un analista de movimientos de una aplicación de finanzas personales. Interpreta el movimiento completo a partir del texto, sin que el usuario te indique si es ingreso o gasto.",
            "Responde en español y devuelve exclusivamente los campos del esquema JSON.",
            "Determina direction como income si entra dinero desde fuera, expense si sale dinero, transfer si es un movimiento entre cuentas propias, o unknown si no hay información suficiente.",
            "No confundas una transferencia entre cuentas propias con un ingreso o un gasto. Un Bizum recibido de otra persona normalmente es income; un Bizum enviado o un pago con tarjeta normalmente es expense.",
            "Extrae amount solo cuando el importe aparezca explícitamente en el texto. Devuelve 0 si no aparece; nunca inventes ni calcules importes.",
            "Elige una categoría exacta de la lista permitida y compatible con el tipo: income solo admite categorías income o both; expense solo admite expense o both. Para transfer o unknown, o si no hay coincidencia, usa __none__.",
            "No inventes comercios, fechas, identidad ni detalles que no aparezcan en el texto.",
            "La explicación debe ser breve y mencionar la pista textual utilizada. La confianza debe ser prudente, entre 0 y 1.",
            "Esto es solo una sugerencia para revisión humana; nunca autoriza un registro automático.",
            "Descripción: " + description,
            "Categorías permitidas (nombre y tipo): " + categoryOptions.join(" | "),
          ].join("\n"),
        }],
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 220,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            direction: { type: "STRING", enum: ["income", "expense", "transfer", "unknown"] },
            category: { type: "STRING", enum: [...categories.map((item: any) => item.name), "__none__"] },
            amount: { type: "NUMBER" },
            confidence: { type: "NUMBER" },
            explanation: { type: "STRING" },
          },
          required: ["direction", "category", "amount", "confidence", "explanation"],
        },
      },
    }

    let providerResponse: Response | null = null
    let model = ""
    let lastProviderStatus = 0
    for (const candidate of candidateModels) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 9000)
      try {
        const attempt = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/" + candidate + ":generateContent?key=" + encodeURIComponent(apiKey),
          { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestPayload) },
        )
        if (attempt.ok) {
          providerResponse = attempt
          model = candidate
          break
        }
        lastProviderStatus = attempt.status
        const providerError = await attempt.text().catch(() => "")
        console.warn("Gemini model attempt failed", { model: candidate, status: attempt.status, body: providerError.slice(0, 700) })
        if (attempt.status === 503 || attempt.status === 404) continue
        if (attempt.status === 429) return response({ error: "Gemini alcanzó temporalmente su límite gratuito. Espera un poco y vuelve a probar." }, 429, origin)
        if (attempt.status === 400 || attempt.status === 403) return response({ error: "Google rechazó la solicitud. Revisa que la clave pertenezca a un proyecto con acceso a Gemini API." }, 502, origin)
        break
      } catch (error) {
        lastProviderStatus = 0
        console.warn("Gemini model attempt exception", { model: candidate, message: error instanceof Error ? error.message : String(error) })
      } finally {
        clearTimeout(timeout)
      }
    }

    if (!providerResponse) {
      const status = lastProviderStatus === 503 || lastProviderStatus === 404 ? 503 : 502
      return response({
        error: status === 503
          ? "Google tiene sus modelos gratuitos temporalmente saturados. Se han probado alternativas compatibles; vuelve a intentarlo más tarde."
          : "No se pudo completar la solicitud con los modelos gratuitos disponibles de Gemini.",
      }, status, origin)
    }

    const payload = await providerResponse.json()
    const text = payload?.candidates?.[0]?.content?.parts?.map((part: any) => part?.text || "").join("")
    if (typeof text !== "string" || !text.trim()) {
      return response({ error: "Gemini no devolvió un análisis utilizable." }, 502, origin)
    }

    let parsed: any
    try { parsed = JSON.parse(text) } catch {
      return response({ error: "Gemini devolvió una respuesta que no se pudo interpretar." }, 502, origin)
    }

    const direction = ["income", "expense", "transfer", "unknown"].includes(parsed.direction) ? parsed.direction : "unknown"
    const selected = categories.find((item: any) => item.name === parsed.category) || null
    const categoryAllowed = selected && (
      direction === "income" ? ["income", "both"].includes(selected.direction)
        : direction === "expense" ? ["expense", "both"].includes(selected.direction)
          : false
    )
    const category = categoryAllowed ? selected.name : null
    const amountValue = Number(parsed.amount)
    const amount = Number.isFinite(amountValue) && amountValue > 0 && amountValue <= 10000000
      ? Math.round(amountValue * 100) / 100
      : null
    const confidenceValue = Number(parsed.confidence)
    const confidence = Number.isFinite(confidenceValue) ? Math.max(0, Math.min(confidenceValue, 0.89)) : 0
    const explanation = String(parsed.explanation || "No se ha podido explicar el análisis.").trim().slice(0, 280)

    return response({
      ok: true,
      result: {
        direction,
        category,
        amount,
        confidence: direction === "unknown" ? Math.min(confidence, 0.49) : confidence,
        explanation,
        provider: "Gemini",
        model,
        requiresReview: true,
      },
    }, 200, origin)
  } catch (error) {
    console.error("finance-ai-lab execution error", error instanceof Error ? error.message : String(error))
    const message = error instanceof Error && error.name === "AbortError"
      ? "Gemini tardó demasiado en responder. Vuelve a intentarlo."
      : "No se pudo completar la prueba de IA."
    return response({ error: message }, 500, origin || "null")
  }
})
