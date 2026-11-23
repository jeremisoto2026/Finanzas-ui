import { createHash } from 'node:crypto'
import {
  classifyKnownMerchant,
  merchantKeyFromName,
  normalizeOsmResult,
} from '../src/lib/merchant-classifier.js'
import { canPairPaymentNotifications, parsePaymentNotification } from '../src/lib/notification-parser.js'

const CACHE_DAYS = 30
let lastNominatimRequestAt = 0

function isMissingTable(error) {
  const code = String(error?.code || '')
  const message = String(error?.message || '').toLowerCase()
  return code === '42P01' || code === 'PGRST205' ||
    message.includes('could not find the table') ||
    message.includes('relation') && message.includes('does not exist')
}

function cleanMerchantSearchTerm(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .replace(/\b(?:COMPRA|TARJETA|PAGO|PAGADO|PAYMENT|CONTACTLESS|TPV|POS|REVOLUT|GOOGLE\s+WALLET)\b/gi, ' ')
    .replace(/\b\d{2,}\b/g, ' ')
    .replace(/[\s-]+/g, ' ')
    .trim()
    .slice(0, 100)
}

async function getExpenseCategories(supabase, userId) {
  const { data, error } = await supabase
    .from('categories')
    .select('name')
    .eq('user_id', userId)
    .eq('is_active', true)
    .in('direction', ['expense', 'both'])
    .order('name', { ascending: true })
  if (error) throw error
  return [...new Set((data || []).map((row) => String(row.name || '').trim()).filter(Boolean))]
}

async function waitForNominatimSlot() {
  const delay = 1100 - (Date.now() - lastNominatimRequestAt)
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
  lastNominatimRequestAt = Date.now()
}

async function searchOpenStreetMap(query) {
  await waitForNominatimSlot()
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.search = new URLSearchParams({
    q: `${query}, España`,
    format: 'jsonv2',
    addressdetails: '1',
    extratags: '1',
    namedetails: '1',
    limit: '5',
    countrycodes: 'es',
  }).toString()

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Finanzas-ui/1.0 (merchant category lookup; https://finanzas-ui-seven.vercel.app)',
      'Accept': 'application/json',
      'Accept-Language': 'es-ES,es;q=0.9',
    },
    signal: AbortSignal.timeout(7000),
  })

  if (!response.ok) {
    const error = new Error(
      response.status === 429
        ? 'OpenStreetMap ha limitado temporalmente las búsquedas. Prueba más tarde.'
        : 'No se pudo consultar OpenStreetMap en este momento.'
    )
    error.statusCode = response.status === 429 ? 429 : 502
    throw error
  }

  const data = await response.json()
  return Array.isArray(data) ? data : []
}

async function readMerchantRule(supabase, userId, merchantKey) {
  const { data, error } = await supabase
    .from('merchant_category_rules')
    .select('id, merchant_name, merchant_key, confidence, source, categories(name)')
    .eq('user_id', userId)
    .eq('merchant_key', merchantKey)
    .maybeSingle()

  if (error) {
    if (isMissingTable(error)) return { available: false, rule: null }
    throw error
  }

  return {
    available: true,
    rule: data ? {
      id: data.id,
      merchantName: data.merchant_name,
      merchantKey: data.merchant_key,
      category: data.categories?.name || '',
      confidence: Number(data.confidence || 1),
      source: data.source,
    } : null,
  }
}

async function readLookupCache(supabase, userId, merchantKey) {
  const { data, error } = await supabase
    .from('merchant_lookup_cache')
    .select('results, expires_at')
    .eq('user_id', userId)
    .eq('merchant_key', merchantKey)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (error) {
    if (isMissingTable(error)) return { available: false, results: null }
    throw error
  }

  return { available: true, results: Array.isArray(data?.results) ? data.results : null }
}

async function saveLookupCache(supabase, userId, merchantKey, queryName, results) {
  const { error } = await supabase
    .from('merchant_lookup_cache')
    .upsert({
      user_id: userId,
      merchant_key: merchantKey,
      query_name: queryName,
      results,
      provider: 'openstreetmap-nominatim',
      cached_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + CACHE_DAYS * 86400000).toISOString(),
    }, { onConflict: 'user_id,merchant_key' })

  if (error && !isMissingTable(error)) throw error
  return !error
}

async function lookupMerchant(req, res, supabase, user) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ error: 'Utiliza POST para buscar un establecimiento.' })
    return
  }

  const merchantName = String(req.body?.merchant || '').trim()
  const queryName = cleanMerchantSearchTerm(merchantName)
  const merchantKey = merchantKeyFromName(merchantName)
  if (merchantName.length < 2 || !queryName || !merchantKey) {
    res.status(400).json({ error: 'Escribe el nombre del establecimiento.' })
    return
  }

  const categories = await getExpenseCategories(supabase, user.id)
  const ruleState = await readMerchantRule(supabase, user.id, merchantKey)
  if (ruleState.rule) {
    res.status(200).json({
      merchantName,
      source: 'saved-rule',
      suggestion: {
        category: ruleState.rule.category,
        confidence: 1,
        requiresConfirmation: false,
        reason: 'Este comercio ya tiene una categoría que confirmaste anteriormente.',
      },
      results: [],
      cached: true,
      storageAvailable: true,
    })
    return
  }

  const cacheState = await readLookupCache(supabase, user.id, merchantKey)
  let results = cacheState.results
  let cached = Boolean(results)
  let lookupWarning = ''

  if (!results) {
    try {
      const osmResults = await searchOpenStreetMap(queryName)
      results = osmResults.map((item) => normalizeOsmResult(item, categories))
      await saveLookupCache(supabase, user.id, merchantKey, queryName, results)
    } catch (error) {
      if (error?.statusCode) throw error
      lookupWarning = 'La búsqueda web no está disponible ahora. Se ha intentado una clasificación local como alternativa.'
      results = []
    }
  }

  let suggestion = results.find((item) => item.category && item.category !== 'Otros') || results[0] || null

  if ((!suggestion || suggestion.category === 'Otros') && results.length === 0) {
    const known = classifyKnownMerchant(queryName, categories)
    if (known) {
      suggestion = {
        name: queryName,
        displayName: queryName,
        category: known.category,
        confidence: known.confidence,
        requiresConfirmation: known.requiresConfirmation,
        reason: known.reason,
        matchedBy: known.matchedBy,
        osmType: null,
        osmId: null,
        tags: {},
      }
    }
  }

  res.status(200).json({
    merchantName,
    source: suggestion?.matchedBy === 'known-merchant' ? 'known-merchant' : 'openstreetmap',
    suggestion,
    results: results.slice(0, 5),
    cached,
    attribution: '© OpenStreetMap contributors',
    attributionUrl: 'https://www.openstreetmap.org/copyright',
    lookupWarning,
    storageAvailable: ruleState.available && cacheState.available,
    categoryOptions: categories,
  })
}

async function merchantRules(req, res, supabase, user) {
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('merchant_category_rules')
      .select('id, merchant_name, merchant_key, confidence, source, created_at, categories(name)')
      .eq('user_id', user.id)
      .order('merchant_name', { ascending: true })

    if (error) {
      if (isMissingTable(error)) {
        res.status(200).json({ available: false, rules: [] })
        return
      }
      throw error
    }

    res.status(200).json({
      available: true,
      rules: (data || []).map((row) => ({
        id: row.id,
        merchantName: row.merchant_name,
        merchantKey: row.merchant_key,
        category: row.categories?.name || '',
        confidence: Number(row.confidence || 1),
        source: row.source,
        createdAt: row.created_at,
      })),
    })
    return
  }

  if (req.method === 'POST') {
    const merchantName = String(req.body?.merchantName || '').trim()
    const categoryName = String(req.body?.category || '').trim()
    const merchantKey = merchantKeyFromName(merchantName)

    if (merchantName.length < 2 || merchantName.length > 160 || !merchantKey) {
      res.status(400).json({ error: 'El nombre del establecimiento no es válido.' })
      return
    }
    if (!categoryName) {
      res.status(400).json({ error: 'Selecciona una categoría.' })
      return
    }

    const { data: category, error: categoryError } = await supabase
      .from('categories')
      .select('id, name')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .in('direction', ['expense', 'both'])
      .ilike('name', categoryName)
      .maybeSingle()

    if (categoryError) throw categoryError
    if (!category) {
      res.status(400).json({ error: 'La categoría elegida no existe en tu lista.' })
      return
    }

    const { data, error } = await supabase
      .from('merchant_category_rules')
      .upsert({
        user_id: user.id,
        merchant_key: merchantKey,
        merchant_name: merchantName,
        category_id: category.id,
        source: 'user',
        confidence: 1,
      }, { onConflict: 'user_id,merchant_key' })
      .select('id, merchant_name, merchant_key, confidence, source, created_at, categories(name)')
      .single()

    if (error) {
      if (isMissingTable(error)) {
        res.status(503).json({ available: false, error: 'La tabla de reglas estará disponible al activar la migración de Preview.' })
        return
      }
      throw error
    }

    res.status(200).json({
      available: true,
      rule: {
        id: data.id,
        merchantName: data.merchant_name,
        merchantKey: data.merchant_key,
        category: data.categories?.name || category.name,
        confidence: Number(data.confidence || 1),
        source: data.source,
        createdAt: data.created_at,
      },
    })
    return
  }

  if (req.method === 'DELETE') {
    const id = String(req.body?.id || '')
    if (!id) {
      res.status(400).json({ error: 'Falta el identificador de la regla.' })
      return
    }
    const { error } = await supabase.from('merchant_category_rules')
      .delete().eq('id', id).eq('user_id', user.id)
    if (error) {
      if (isMissingTable(error)) {
        res.status(503).json({ available: false, error: 'La tabla de reglas todavía no está activada.' })
        return
      }
      throw error
    }
    res.status(200).json({ available: true, success: true })
    return
  }

  res.setHeader('Allow', 'GET, POST, DELETE')
  res.status(405).json({ error: 'Método no permitido.' })
}

async function notificationCaptures(req, res, supabase, user) {
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('notification_capture_events')
      .select('id, source_app, notification_title, notification_text, occurred_at, status, created_at, parsed_merchant, parsed_amount, currency_code, account_label, payment_channel, pair_key, categories(name)')
      .eq('user_id', user.id)
      .order('occurred_at', { ascending: false })
      .limit(20)

    if (error) {
      if (isMissingTable(error)) {
        res.status(200).json({ available: false, events: [] })
        return
      }
      throw error
    }

    res.status(200).json({
      available: true,
      events: (data || []).map((row) => ({
        id: row.id,
        sourceApp: row.source_app,
        title: row.notification_title,
        text: row.notification_text,
        occurredAt: row.occurred_at,
        status: row.status,
        merchant: row.parsed_merchant || '',
        amount: row.parsed_amount == null ? null : Number(row.parsed_amount),
        currencyCode: row.currency_code || 'EUR',
        account: row.account_label || '',
        paymentChannel: row.payment_channel || '',
        category: row.categories?.name || '',
        pairKey: row.pair_key || null,
      })),
    })
    return
  }

  if (req.method === 'POST') {
    const sourceApp = String(req.body?.sourceApp || '').trim().toLowerCase()
    const packageName = String(req.body?.packageName || '').trim()
    const title = String(req.body?.title || '').trim().slice(0, 500)
    const text = String(req.body?.text || '').trim().slice(0, 2000)
    const occurredDate = new Date(req.body?.occurredAt || '')

    if (!['revolut', 'bbva', 'google_wallet'].includes(sourceApp)) {
      res.status(400).json({ error: 'Solo se admiten notificaciones de Revolut, BBVA y Google Wallet.' })
      return
    }
    if (packageName.length < 3 || packageName.length > 180 || !title || !text || !Number.isFinite(occurredDate.getTime())) {
      res.status(400).json({ error: 'La notificación no contiene los datos mínimos necesarios.' })
      return
    }
    const occurredAt = occurredDate.toISOString()

    const categories = await getExpenseCategories(supabase, user.id)
    const parsed = parsePaymentNotification({ sourceApp, title, text, occurredAt }, categories)
    let categoryId = null

    if (parsed.categorySuggestion) {
      const { data: category, error: categoryError } = await supabase
        .from('categories')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .in('direction', ['expense', 'both'])
        .ilike('name', parsed.categorySuggestion)
        .maybeSingle()
      if (categoryError) throw categoryError
      categoryId = category?.id || null
    }

    const fingerprint = createHash('sha256')
      .update([sourceApp, packageName, title, text, occurredAt].join('|'))
      .digest('hex')

    const { data, error } = await supabase
      .from('notification_capture_events')
      .insert({
        user_id: user.id,
        source_app: sourceApp,
        package_name: packageName,
        fingerprint,
        notification_title: parsed.isPayment ? parsed.merchant : sourceApp,
        notification_text: parsed.isPayment
          ? `Pago detectado: ${parsed.amount.toFixed(2)} ${parsed.currencyCode}`
          : `Aviso recibido de ${sourceApp}`,
        occurred_at: occurredAt,
        status: parsed.isPayment ? 'needs_review' : 'received',
        parsed_merchant: parsed.isPayment ? parsed.merchant : null,
        parsed_amount: parsed.isPayment ? parsed.amount : null,
        currency_code: parsed.isPayment ? parsed.currencyCode : 'EUR',
        category_id: categoryId,
        account_label: parsed.isPayment ? parsed.accountLabel : null,
        payment_channel: parsed.isPayment ? parsed.paymentChannel : null,
      })
      .select('id, source_app, parsed_merchant, parsed_amount, currency_code, occurred_at, status, account_label, payment_channel')
      .single()

    if (error) {
      if (isMissingTable(error)) {
        res.status(503).json({ available: false, error: 'El buzón de notificaciones estará disponible al activar la migración de Preview.' })
        return
      }
      if (error.code === '23505') {
        res.status(200).json({ available: true, duplicate: true })
        return
      }
      throw error
    }

    let event = data
    let paired = false

    if (parsed.isPayment) {
      const windowMs = 3 * 60 * 1000
      const { data: candidates, error: candidateError } = await supabase
        .from('notification_capture_events')
        .select('id, source_app, parsed_merchant, parsed_amount, currency_code, occurred_at, status')
        .eq('user_id', user.id)
        .neq('id', data.id)
        .neq('source_app', sourceApp)
        .eq('parsed_amount', parsed.amount)
        .eq('currency_code', parsed.currencyCode)
        .eq('status', 'needs_review')
        .gte('occurred_at', new Date(occurredDate.getTime() - windowMs).toISOString())
        .lte('occurred_at', new Date(occurredDate.getTime() + windowMs).toISOString())
        .order('occurred_at', { ascending: false })
        .limit(30)

      if (candidateError) throw candidateError

      const match = (candidates || []).find((candidate) => canPairPaymentNotifications(
        {
          source_app: data.source_app,
          parsed_merchant: data.parsed_merchant,
          parsed_amount: data.parsed_amount,
          currency_code: data.currency_code,
          occurred_at: data.occurred_at,
        },
        candidate,
        windowMs
      ))

      if (match) {
        const pairKey = createHash('sha256')
          .update([user.id, ...[data.id, match.id].sort()].join('|'))
          .digest('hex')

        const { error: pairError } = await supabase
          .from('notification_capture_events')
          .update({ status: 'paired', pair_key: pairKey })
          .eq('user_id', user.id)
          .in('id', [data.id, match.id])

        if (pairError) throw pairError
        event = { ...data, status: 'paired' }
        paired = true
      }
    }

    res.status(201).json({
      available: true,
      duplicate: false,
      paired,
      ledgerPosted: false,
      event: {
        id: event.id,
        status: event.status,
        merchant: event.parsed_merchant || '',
        amount: event.parsed_amount == null ? null : Number(event.parsed_amount),
        currencyCode: event.currency_code || 'EUR',
        account: event.account_label || '',
        paymentChannel: event.payment_channel || '',
        categorySuggestion: parsed.categorySuggestion || null,
      },
      message: paired
        ? 'Las notificaciones de Revolut y Google Wallet se han unido como una sola compra pendiente de revisión. No se ha creado ningún gasto.'
        : parsed.isPayment
          ? 'Notificación de pago reconocida. Está pendiente de revisión y no ha modificado tus saldos.'
          : 'Notificación recibida, pero no se ha podido reconocer un pago con seguridad.',
    })
    return
  }

  res.setHeader('Allow', 'GET, POST')
  res.status(405).json({ error: 'Método no permitido.' })
}
export async function handleMerchantResource(req, res, supabase, user) {
  const resource = String(req.query?.resource || '')
  if (resource === 'merchant-lookup') {
    await lookupMerchant(req, res, supabase, user)
    return true
  }
  if (resource === 'merchant-rules') {
    await merchantRules(req, res, supabase, user)
    return true
  }
  if (resource === 'notification-captures') {
    await notificationCaptures(req, res, supabase, user)
    return true
  }
  return false
}
