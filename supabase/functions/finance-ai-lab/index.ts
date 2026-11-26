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

    const batchMode = Array.isArray(body.batch)
    const batchItems = batchMode
      ? body.batch.slice(0, 10).map((item: any, index: number) => ({
          id: String(item?.id ?? index).slice(0, 20),
          description: String(item?.description || "").replace(/\s+/g, " ").trim().slice(0, 180),
        }))
      : []
    const description = String(body.description || "").replace(/\s+/g, " ").trim().slice(0, 180)
    const categories = [...new Map((Array.isArray(body.categories) ? body.categories : [])
      .map((item: any) => ({
        name: String(item?.name || "").trim().slice(0, 60),
        direction: ["income", "expense", "both"].includes(item?.direction) ? item.direction : "both",
      }))
      .filter((item: any) => item.name.length >= 2)
      .map((item: any) => [item.name.toLocaleLowerCase("es"), item])).values()].slice(0, 60)

    if ((batchMode
      ? batchItems.length !== 10 || batchItems.some((item: any) => item.description.length < 3)
      : description.length < 3) || categories.length === 0) {
      return response({ error: "Indica 10 descripciones válidas y asegúrate de tener categorías disponibles." }, 400, origin)
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

    // TEMPORARY PREVIEW TEST: force Cloudflare so we can verify the fallback without using Gemini.
    const forceCloudflarePreviewTest = true
    const candidateModels = forceCloudflarePreviewTest
      ? []
      : freeModelPreference.filter((name) => availableModels.size === 0 || availableModels.has(name))
    if (!forceCloudflarePreviewTest && candidateModels.length === 0) {
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
            "Si una descripción contiene dos o más movimientos distintos, direction debe ser unknown y amount debe ser 0; no elijas ni sumes uno de los importes.",
            "Elige una categoría exacta de la lista permitida y compatible con el tipo: income solo admite categorías income o both; expense solo admite expense o both. Para transfer o unknown, o si no hay coincidencia, usa __none__.",
            "No inventes comercios, fechas, identidad ni detalles que no aparezcan en el texto.",
            "La explicación debe ser breve y mencionar la pista textual utilizada. La confianza debe ser prudente, entre 0 y 1.",
            "Esto es solo una sugerencia para revisión humana; nunca autoriza un registro automático.",
            batchMode
              ? "Analiza independientemente cada uno de estos casos. Devuelve un elemento por caso, conserva exactamente su id y no mezcles importes ni pistas entre casos:\\n" + batchItems.map((item: any) => JSON.stringify(item)).join("\\n")
              : "Descripción: " + description,
            "Categorías permitidas (nombre y tipo): " + categoryOptions.join(" | "),
          ].join("\n"),
        }],
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: batchMode ? 1800 : 220,
        responseMimeType: "application/json",
        responseSchema: batchMode ? {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              id: { type: "STRING" },
              direction: { type: "STRING", enum: ["income", "expense", "transfer", "unknown"] },
              category: { type: "STRING", enum: [...categories.map((item: any) => item.name), "__none__"] },
              amount: { type: "NUMBER" },
              confidence: { type: "NUMBER" },
              explanation: { type: "STRING" },
            },
            required: ["id", "direction", "category", "amount", "confidence", "explanation"],
          },
        } : {
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
        if (attempt.status === 429) break
        if (attempt.status === 400 || attempt.status === 403) return response({ error: "Google rechazó la solicitud. Revisa que la clave pertenezca a un proyecto con acceso a Gemini API." }, 502, origin)
        break
      } catch (error) {
        lastProviderStatus = 0
        console.warn("Gemini model attempt exception", { model: candidate, message: error instanceof Error ? error.message : String(error) })
        break
      } finally {
        clearTimeout(timeout)
      }
    }

    let provider = "Gemini"
    let text: string | null = null

    if (!providerResponse) {
      const cloudflareAccountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID")?.trim()
      const cloudflareApiToken = Deno.env.get("CLOUDFLARE_API_TOKEN")?.trim()

      if (!cloudflareAccountId || !cloudflareApiToken) {
        const status = lastProviderStatus === 429 || lastProviderStatus === 503 || lastProviderStatus === 404 ? 503 : 502
        return response({
          error: status === 503
            ? "Gemini no está disponible y Cloudflare Workers AI todavía no está configurado con sus dos secretos en Preview."
            : "No se pudo completar la solicitud con Gemini y no hay un proveedor de respaldo disponible.",
        }, status, origin)
      }

      const cloudflareModel = "@cf/meta/llama-3.1-8b-instruct-fast"
      const cloudflareSchemaSource = requestPayload.generationConfig.responseSchema as any

      function toJsonSchema(schema: any): any {
        const result: any = {}
        if (schema?.type) result.type = String(schema.type).toLowerCase()
        if (schema?.enum) result.enum = schema.enum
        if (schema?.required) result.required = schema.required
        if (schema?.properties) {
          result.properties = Object.fromEntries(
            Object.entries(schema.properties).map(([key, value]) => [key, toJsonSchema(value)]),
          )
        }
        if (schema?.items) result.items = toJsonSchema(schema.items)
        return result
      }

      const convertedSchema = toJsonSchema(cloudflareSchemaSource)
      const cloudflareSchema = batchMode
        ? {
            type: "object",
            properties: { results: convertedSchema },
            required: ["results"],
          }
        : convertedSchema

      const originalPrompt = requestPayload.contents[0].parts[0].text
      const cloudflareController = new AbortController()
      const cloudflareTimeout = setTimeout(() => cloudflareController.abort(), 12000)

      try {
        const cloudflareResponse = await fetch(
          "https://api.cloudflare.com/client/v4/accounts/" + encodeURIComponent(cloudflareAccountId) + "/ai/run/" + cloudflareModel,
          {
            method: "POST",
            signal: cloudflareController.signal,
            headers: {
              "Authorization": "Bearer " + cloudflareApiToken,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              messages: [
                {
                  role: "system",
                  content: "Eres un analista de movimientos financieros. Responde exclusivamente con JSON válido y cumple exactamente el esquema JSON recibido. No añadas Markdown ni texto fuera del JSON.",
                },
                {
                  role: "user",
                  content: originalPrompt + (batchMode
                    ? "\nDevuelve un objeto JSON con una sola propiedad llamada results, que contenga la lista completa de resultados."
                    : ""),
                },
              ],
              max_tokens: batchMode ? 1800 : 220,
              temperature: 0.1,
              response_format: {
                type: "json_schema",
                json_schema: cloudflareSchema,
              },
            }),
          },
        )

        if (!cloudflareResponse.ok) {
          const cloudflareError = await cloudflareResponse.text().catch(() => "")
          console.warn("Cloudflare Workers AI request failed", {
            status: cloudflareResponse.status,
            body: cloudflareError.slice(0, 700),
          })
          return response({
            error: cloudflareResponse.status === 401 || cloudflareResponse.status === 403
              ? "Cloudflare rechazó la conexión. Comprueba el permiso Workers AI del token y que la cuenta siga en el plan gratuito."
              : cloudflareResponse.status === 429 || cloudflareResponse.status >= 500
                ? "Gemini alcanzó su límite y Cloudflare Workers AI también está temporalmente limitado o no disponible. Prueba más tarde."
                : "Cloudflare Workers AI no pudo analizar esta solicitud. Revisa la configuración del proveedor.",
          }, cloudflareResponse.status === 429 || cloudflareResponse.status >= 500 ? 503 : 502, origin)
        }

        const cloudflarePayload = await cloudflareResponse.json()
        let cloudflareOutput = cloudflarePayload?.result?.response
          ?? cloudflarePayload?.result?.choices?.[0]?.message?.content
          ?? cloudflarePayload?.response
          ?? cloudflarePayload?.choices?.[0]?.message?.content

        if (typeof cloudflareOutput === "string") {
          const cleaned = cloudflareOutput.trim()
            .replace(/^\x60{3}(?:json)?\s*/i, "")
            .replace(/\s*\x60{3}$/, "")
          try {
            cloudflareOutput = JSON.parse(cleaned)
          } catch {
            return response({ error: "Cloudflare respondió, pero el resultado no tenía un JSON válido." }, 502, origin)
          }
        }

        if (!cloudflareOutput || typeof cloudflareOutput !== "object") {
          return response({ error: "Cloudflare no devolvió un análisis utilizable." }, 502, origin)
        }

        if ((cloudflareOutput as any).response && typeof (cloudflareOutput as any).response === "object") {
          cloudflareOutput = (cloudflareOutput as any).response
        }
        if (batchMode && Array.isArray((cloudflareOutput as any).results)) {
          cloudflareOutput = (cloudflareOutput as any).results
        }

        text = JSON.stringify(cloudflareOutput)
        provider = "Cloudflare Workers AI"
        model = cloudflareModel
      } catch (error) {
        console.error("Cloudflare Workers AI fallback exception", error instanceof Error ? error.message : String(error))
        return response({
          error: error instanceof Error && error.name === "AbortError"
            ? "Cloudflare Workers AI tardó demasiado en responder. Vuelve a intentarlo."
            : "No se pudo conectar con Cloudflare Workers AI. Comprueba sus secretos en Supabase Preview.",
        }, 503, origin)
      } finally {
        clearTimeout(cloudflareTimeout)
      }
    }

    if (providerResponse) {
      const payload = await providerResponse.json()
      text = payload?.candidates?.[0]?.content?.parts?.map((part: any) => part?.text || "").join("") || null
    }

    if (typeof text !== "string" || !text.trim()) {
      return response({ error: provider === "Gemini" ? "Gemini no devolvió un análisis utilizable." : "Cloudflare no devolvió un análisis utilizable." }, 502, origin)
    }

    let parsed: any
    try { parsed = JSON.parse(text) } catch {
      return response({ error: "Gemini devolvió una respuesta que no se pudo interpretar." }, 502, origin)
    }

    function normalizeResult(item: any) {
      const direction = ["income", "expense", "transfer", "unknown"].includes(item.direction) ? item.direction : "unknown"
      const selected = categories.find((categoryItem: any) => categoryItem.name === item.category) || null
      const categoryAllowed = selected && (
        direction === "income" ? ["income", "both"].includes(selected.direction)
          : direction === "expense" ? ["expense", "both"].includes(selected.direction)
            : false
      )
      const category = categoryAllowed ? selected.name : null
      const amountValue = Number(item.amount)
      const amount = Number.isFinite(amountValue) && amountValue > 0 && amountValue <= 10000000
        ? Math.round(amountValue * 100) / 100
        : null
      const confidenceValue = Number(item.confidence)
      const confidence = Number.isFinite(confidenceValue) ? Math.max(0, Math.min(confidenceValue, 0.89)) : 0
      const explanation = String(item.explanation || "No se ha podido explicar el análisis.").trim().slice(0, 280)
      return {
        direction,
        category,
        amount,
        confidence: direction === "unknown" ? Math.min(confidence, 0.49) : confidence,
        explanation,
        provider,
        model,
        requiresReview: true,
      }
    }

    if (batchMode) {
      if (!Array.isArray(parsed)) return response({ error: "Gemini devolvió un lote que no se pudo interpretar." }, 502, origin)
      const byId = new Map(parsed.map((item: any) => [String(item?.id), item]))
      const results = batchItems.map((item: any) => {
        const candidate: any = byId.get(item.id)
        return candidate ? { id: item.id, ...normalizeResult(candidate) } : { id: item.id, error: "Gemini no devolvió este caso." }
      })
      return response({ ok: true, results }, 200, origin)
    }

    return response({
      ok: true,
      result: normalizeResult(parsed),
    }, 200, origin)
  } catch (error) {
    console.error("finance-ai-lab execution error", error instanceof Error ? error.message : String(error))
    const message = error instanceof Error && error.name === "AbortError"
      ? "Gemini tardó demasiado en responder. Vuelve a intentarlo."
      : "No se pudo completar la prueba de IA."
    return response({ error: message }, 500, origin || "null")
  }
})
