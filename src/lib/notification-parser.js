import { classifyKnownMerchant, merchantKeyFromName } from './merchant-classifier.js'

function parseLocalizedAmount(value) {
  const source = String(value || '').replace(/\s/g, '')
  if (!source) return null

  let normalized = source
  if (source.includes(',')) {
    normalized = source.replace(/\./g, '').replace(',', '.')
  } else if ((source.match(/\./g) || []).length > 1) {
    const lastDot = source.lastIndexOf('.')
    normalized = source.slice(0, lastDot).replace(/\./g, '') + source.slice(lastDot)
  }

  const amount = Number(normalized)
  if (!Number.isFinite(amount) || amount <= 0) return null
  return Math.round((amount + Number.EPSILON) * 100) / 100
}

function cleanMerchant(value) {
  return String(value || '')
    .split(/\r?\n|saldo del pocket|saldo disponible|⚠|🔨|⚒|🛒/iu)[0]
    .replace(/[\p{Extended_Pictographic}\uFE0F]/gu, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s:–—-]+|[\s:–—-]+$/g, '')
    .trim()
    .slice(0, 160)
}

function categoryForMerchant(merchant, categories = []) {
  const available = (name) => categories.find(
    (item) => String(item).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() ===
      String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  ) || null

  if (/\b(supermercado|hipermercado|supermarket|grocery)\b/i.test(merchant)) {
    const category = available('Alimentación')
    return category ? {
      category,
      confidence: 0.96,
      reason: 'El nombre de la notificación identifica expresamente un supermercado.',
    } : null
  }

  const known = classifyKnownMerchant(merchant, categories)
  return known ? {
    category: known.category,
    confidence: known.confidence,
    reason: known.reason,
  } : null
}

/**
 * Parses only the payment notification formats supplied by the user.
 * The Pocket balance is intentionally never treated as a transaction amount.
 */
export function parsePaymentNotification({ sourceApp, title = '', text = '', occurredAt = null }, categories = []) {
  const app = String(sourceApp || '').trim().toLowerCase()
  const heading = String(title || '').trim()
  const body = String(text || '').trim()
  const combined = [heading, body].filter(Boolean).join('\n')

  if (!['revolut', 'google_wallet'].includes(app)) {
    return { isPayment: false, reason: 'Aplicación no admitida.' }
  }

  let amount = null
  let merchant = ''
  let cardLast4 = null

  if (app === 'revolut') {
    const match = body.match(/has\s+pagado\s+([\d.,]+)\s*(?:€|EUR)\s+en\s+(.+?)(?=\r?\n|saldo del pocket|saldo disponible|⚠|🔨|⚒|$)/iu)
    if (match) {
      amount = parseLocalizedAmount(match[1])
      merchant = cleanMerchant(match[2])
    }

    if (!merchant && heading) merchant = cleanMerchant(heading)
  }

  if (app === 'google_wallet') {
    const match = combined.match(/([\d.]+(?:,\d{1,2})?|\d+(?:\.\d{1,2})?)\s*(?:€|EUR)\s+con\s+Revolut\b/i)
    if (match) amount = parseLocalizedAmount(match[1])

    const cardMatch = combined.match(/(?:visa|mastercard|maestro|amex)\s*[•·*\s]*([0-9]{4})/i) ||
      combined.match(/[•·*]{2,}\s*([0-9]{4})/)
    if (cardMatch) cardLast4 = cardMatch[1]

    merchant = cleanMerchant(heading)
  }

  const categorySuggestion = merchant ? categoryForMerchant(merchant, categories) : null
  const merchantKey = merchantKeyFromName(merchant)

  if (!amount || !merchant || !merchantKey) {
    return {
      isPayment: false,
      sourceApp: app,
      reason: 'No se pudo extraer un importe y un comercio de forma segura.',
      amount,
      merchant,
      cardLast4,
    }
  }

  return {
    isPayment: true,
    sourceApp: app,
    amount,
    currencyCode: 'EUR',
    merchant,
    merchantKey,
    accountLabel: 'Revolut',
    paymentChannel: app,
    cardLast4: app === 'google_wallet' ? cardLast4 : null,
    occurredAt,
    categorySuggestion: categorySuggestion?.category || null,
    categoryConfidence: categorySuggestion?.confidence || null,
    categoryReason: categorySuggestion?.reason || null,
    status: 'needs_review',
  }
}

/**
 * Two notifications represent one payment only when they come from different
 * apps and match on merchant, amount, currency, and a short time window.
 */
export function canPairPaymentNotifications(left, right, windowMs = 3 * 60 * 1000) {
  if (!left || !right) return false
  if (left.source_app === right.source_app) return false
  if (!['revolut', 'google_wallet'].includes(left.source_app) ||
      !['revolut', 'google_wallet'].includes(right.source_app)) return false
  if (!left.parsed_merchant || !right.parsed_merchant) return false
  if (Number(left.parsed_amount) !== Number(right.parsed_amount)) return false
  if (String(left.currency_code || 'EUR') !== String(right.currency_code || 'EUR')) return false

  const leftKey = merchantKeyFromName(left.parsed_merchant)
  const rightKey = merchantKeyFromName(right.parsed_merchant)
  if (!leftKey || leftKey !== rightKey) return false

  const leftTime = new Date(left.occurred_at).getTime()
  const rightTime = new Date(right.occurred_at).getTime()
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return false

  return Math.abs(leftTime - rightTime) <= windowMs
}
