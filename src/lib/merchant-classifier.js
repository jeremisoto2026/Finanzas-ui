const removeAccents = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')

export function normalizeMerchantName(value) {
  return removeAccents(value)
    .normalize('NFKC')
    .toUpperCase()
    .replace(/\b(?:COMPRA|TARJETA|PAGO|PAGADO|PAYMENT|CONTACTLESS|TPV|POS|REVOLUT|GOOGLE\s+WALLET)\b/g, ' ')
    .replace(/\b\d{2,}\b/g, ' ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export function merchantKeyFromName(value) {
  return normalizeMerchantName(value).replace(/\s/g, '-').slice(0, 120)
}

function findAvailableCategory(name, categories = []) {
  const wanted = removeAccents(name).toLocaleLowerCase('es').trim()
  return categories.find((category) => removeAccents(category).toLocaleLowerCase('es').trim() === wanted) || null
}

const OSM_CATEGORY_RULES = [
  {
    category: 'Alimentación',
    confidence: 0.96,
    reason: 'OpenStreetMap identifica el establecimiento como supermercado o comercio de alimentación.',
    matches: (tags) => ['supermarket', 'convenience', 'grocery', 'greengrocer', 'butcher', 'bakery', 'deli', 'seafood', 'farm'].includes(tags.shop),
  },
  {
    category: 'Salud e higiene',
    confidence: 0.93,
    reason: 'La actividad registrada corresponde a farmacia o comercio sanitario.',
    matches: (tags) => tags.amenity === 'pharmacy' || ['chemist', 'medical_supply', 'hearing_aids', 'optician'].includes(tags.shop),
  },
  {
    category: 'Salud e higiene',
    confidence: 0.86,
    reason: 'El establecimiento aparece registrado como centro o servicio sanitario.',
    matches: (tags) => ['clinic', 'hospital', 'doctors', 'dentist', 'veterinary'].includes(tags.amenity),
  },
  {
    category: 'Telefonía',
    confidence: 0.94,
    reason: 'La ficha identifica una tienda de telefonía o telecomunicaciones.',
    matches: (tags) => ['mobile_phone', 'telecommunication'].includes(tags.shop) || tags.shop === 'mobile_phone',
  },
  {
    category: 'Tecnología',
    confidence: 0.91,
    reason: 'La actividad corresponde a electrónica o informática.',
    matches: (tags) => ['electronics', 'computer', 'hifi', 'computer_parts', 'video_games'].includes(tags.shop),
  },
  {
    category: 'Hogar',
    confidence: 0.86,
    reason: 'La actividad corresponde a muebles, ferretería o artículos para el hogar.',
    matches: (tags) => ['furniture', 'hardware', 'houseware', 'interior_decoration', 'doityourself', 'kitchen'].includes(tags.shop),
  },
  {
    category: 'Perro',
    confidence: 0.92,
    reason: 'La ficha corresponde a una tienda de animales o productos para mascotas.',
    matches: (tags) => tags.shop === 'pet',
  },
  {
    category: 'Servicios legales',
    confidence: 0.94,
    reason: 'La actividad aparece registrada como despacho jurídico.',
    matches: (tags) => tags.office === 'lawyer' || tags['office:lawyer'] === 'yes',
  },
  {
    category: 'Ocio',
    confidence: 0.84,
    reason: 'La actividad corresponde a una instalación cultural, deportiva o de entretenimiento.',
    matches: (tags) => ['cinema', 'theatre', 'arts_centre', 'nightclub', 'fitness_centre', 'sports_centre', 'bowling_alley', 'casino'].includes(tags.amenity) || ['fitness_centre', 'sports_centre', 'stadium'].includes(tags.leisure),
  },
  {
    category: 'Ocio',
    confidence: 0.68,
    reason: 'OpenStreetMap lo identifica como restaurante, cafetería o bar. Confirma si quieres usar Ocio.',
    matches: (tags) => ['restaurant', 'cafe', 'bar', 'pub', 'fast_food', 'food_court'].includes(tags.amenity),
  },
  {
    category: 'Servicios',
    confidence: 0.78,
    reason: 'La ficha corresponde a un servicio financiero, de seguros o de servicios profesionales.',
    matches: (tags) => ['bank', 'bureau_de_change', 'insurance'].includes(tags.amenity) || ['insurance', 'financial'].includes(tags.office),
  },
]

export function classifyOsmTags(tags = {}, categories = []) {
  const normalizedTags = Object.fromEntries(
    Object.entries(tags || {}).map(([key, value]) => [String(key).toLowerCase(), String(value ?? '').toLowerCase()])
  )

  // Nominatim may expose the primary OSM classification as class/type
  // instead of repeating it in extratags.
  const primaryClass = normalizedTags._class || normalizedTags.category
  const primaryType = normalizedTags._type || normalizedTags.type
  if (!normalizedTags.shop && primaryClass === 'shop') normalizedTags.shop = primaryType
  if (!normalizedTags.amenity && primaryClass === 'amenity') normalizedTags.amenity = primaryType
  if (!normalizedTags.office && primaryClass === 'office') normalizedTags.office = primaryType
  if (!normalizedTags.leisure && primaryClass === 'leisure') normalizedTags.leisure = primaryType

  const match = OSM_CATEGORY_RULES.find((rule) => rule.matches(normalizedTags))
  if (!match) {
    return {
      category: findAvailableCategory('Otros', categories) || null,
      confidence: 0.25,
      requiresConfirmation: true,
      reason: 'No se ha podido identificar con suficiente certeza la actividad del establecimiento.',
      matchedBy: 'fallback',
    }
  }

  const available = findAvailableCategory(match.category, categories)
  if (!available) {
    return {
      category: findAvailableCategory('Otros', categories) || null,
      confidence: 0.35,
      requiresConfirmation: true,
      reason: `La actividad sugiere «${match.category}», pero esa categoría no existe en tu lista. No se creará una categoría nueva automáticamente.`,
      matchedBy: 'osm',
    }
  }

  return {
    category: available,
    confidence: match.confidence,
    requiresConfirmation: match.confidence < 0.85,
    reason: match.reason,
    matchedBy: 'osm',
  }
}

const KNOWN_MERCHANTS = [
  { pattern: /\b(MERCADONA|LIDL|ALDI|CONSUM|CARREFOUR|EROSKI|ALCAMPO|DIA|SPAR|MAS Y MAS|MASymas|SUPERCOR|AHORRAMAS)\b/i, category: 'Alimentación' },
  { pattern: /\b(FARMACIA|FARMACIAS|DRUNI|PRIMOR)\b/i, category: 'Salud e higiene' },
  { pattern: /\b(MEDIA MARKT|MEDIAMARKT|FNAC|PC COMPONENTES|PCBOX)\b/i, category: 'Tecnología' },
  { pattern: /\b(ORANGE|VODAFONE|MOVISTAR|DIGI|YOIGO)\b/i, category: 'Telefonía' },
]

export function classifyKnownMerchant(name, categories = []) {
  const match = KNOWN_MERCHANTS.find((entry) => entry.pattern.test(String(name || '')))
  if (!match) return null
  const category = findAvailableCategory(match.category, categories)
  if (!category) return null
  return {
    category,
    confidence: 0.92,
    requiresConfirmation: false,
    reason: 'Coincidencia con una regla de comercio conocida. Comprueba el nombre si no corresponde a esa tienda.',
    matchedBy: 'known-merchant',
  }
}

export function normalizeOsmResult(result = {}, categories = []) {
  const tags = { ...(result.extratags || {}) }
  if (result.class) tags._class = result.class
  if (result.type) tags._type = result.type
  if (result.category) tags.category = result.category

  const classification = classifyOsmTags(tags, categories)
  const displayName = String(
    result.name || result.namedetails?.name || result.display_name?.split(',')?.[0] || 'Establecimiento encontrado'
  ).trim()

  return {
    name: displayName,
    displayName: String(result.display_name || displayName),
    category: classification.category || 'Otros',
    confidence: classification.confidence,
    requiresConfirmation: classification.requiresConfirmation,
    reason: classification.reason,
    matchedBy: classification.matchedBy,
    osmType: result.osm_type || null,
    osmId: result.osm_id || null,
    tags: {
      shop: tags.shop || null,
      amenity: tags.amenity || null,
      office: tags.office || null,
      leisure: tags.leisure || null,
      tourism: tags.tourism || null,
    },
  }
}
