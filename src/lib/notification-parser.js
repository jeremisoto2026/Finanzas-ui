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

  if (!['revolut', 'bbva', 'google_wallet'].includes(app)) {
    return { isPayment: false, reason: 'Aplicación no admitida.' }
  }

  let amount = null
  let merchant = ''
  let accountLabel = null

  if (app === 'revolut') {
    accountLabel = 'Revolut'
    const match = body.match(/has\s+pagado\s+([\d.,]+)\s*(?:€|EUR)\s+en\s+(.+?)(?=\r?\n|saldo del pocket|saldo disponible|⚠|🔨|⚒|$)/iu)
    if (match) {
      amount = parseLocalizedAmount(match[1])
      merchant = cleanMerchant(match[2])
    }

    if (!merchant && heading) merchant = cleanMerchant(heading)
  }

  if (app === 'bbva') {
    const signal = /\b(compra|compraste|pago con tarjeta|pago realizado|compra realizada|operaci[oó]n de tarjeta)\b/i.test(combined)
    const match = body.match(/([\d.,]+)\s*(?:€|EUR)/i)
    if (signal && match) amount = parseLocalizedAmount(match[1])
    const merchantMatch = body.match(/\b(?:en|a)\s+(.+?)(?=\r?\n|saldo|\s+tarjeta|$)/i)
    merchant = cleanMerchant(merchantMatch?.[1] || (heading && !/^(bbva|notificación|compra|pago)$/i.test(heading) ? heading : ''))
    accountLabel = 'BBVA'
  }

  if (app === 'google_wallet') {
    const match = combined.match(/([\d.,]+)\s*(?:€|EUR)\s+(?:con\s+.+|en\s+.+)/i)
    if (match) amount = parseLocalizedAmount(match[1])

    const issuer = combined.match(/\bcon\s+(Revolut|BBVA)\b/i)
    accountLabel = issuer ? (issuer[1].toLowerCase() === 'bbva' ? 'BBVA' : 'Revolut') : null
    const walletMerchant = combined.match(/\b(?:en|at)\s+(.+?)(?=\r?\n|$)/i)?.[1]
    merchant = cleanMerchant(heading || walletMerchant || '')
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
    }
  }

  return {
    isPayment: true,
    sourceApp: app,
    amount,
    currencyCode: 'EUR',
    merchant,
    merchantKey,
    accountLabel,
    paymentChannel: app,
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
  const bankApps = ['revolut', 'bbva']
  const walletBankPair = left.source_app === 'google_wallet' && bankApps.includes(right.source_app) ||
    right.source_app === 'google_wallet' && bankApps.includes(left.source_app)
  if (!walletBankPair) return false
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
