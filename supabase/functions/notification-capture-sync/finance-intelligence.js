export function normalizeFinanceText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ")
}

const EXPENSE_RULES = [
  { pattern: /\b(mercadona|consum|lidl|aldi|carrefour|eroski|alcampo|dia|spar|supercor|ahorramas|mas y mas|masymas|hipercor)\b/i, category: "Alimentación", confidence: 0.97 },
  { pattern: /\b(farmacia|farmacias|farmacia central|farmacia\s+\w+|druni|primor)\b/i, category: "Salud e higiene", confidence: 0.94 },
  { pattern: /\b(recibo de electricidad|electricidad|recibo de la luz|recibo de luz|suministro electrico)\b/i, category: "Hogar", confidence: 0.93 },
  { pattern: /\b(recibo de agua|suministro de agua|recibo de gas|suministro de gas|gas natural)\b/i, category: "Hogar", confidence: 0.91 },
  { pattern: /\b(alquiler|arrendamiento|rent)\b/i, category: "Vivienda", confidence: 0.95 },
  { pattern: /\b(taller|mecanico|mantenimiento de moto|reparacion de moto|motocicleta)\b/i, category: "Transporte", confidence: 0.92 },
  { pattern: /\b(casco|guantes|chaqueta|accesorios de moto|equipamiento de moto)\b/i, category: "Transporte", confidence: 0.91 },
  { pattern: /\b(repsol|cepsa|bp|shell|galp|petronor|gasolinera|estacion de servicio)\b/i, category: "Transporte", confidence: 0.96 },
  { pattern: /\b(orange|vodafone|movistar|digi|yoigo|masmovil|lowi)\b/i, category: "Telefonía", confidence: 0.96 },
  { pattern: /\b(netflix|spotify|disney\+?|hbo|max|prime video|youtube premium|icloud|google one)\b/i, category: "Suscripciones", confidence: 0.95 },
  { pattern: /\b(renfe|emt|metrovalencia|cabify|uber(?!\s*eats)|bolt|free now|freenow)\b/i, category: "Transporte", confidence: 0.93 },
  { pattern: /\b(mediamarkt|media markt|fnac|pc componentes|pccomponentes|pcbox)\b/i, category: "Tecnología", confidence: 0.93 },
  { pattern: /\b(zara|h&m|primark|pull\s*&?\s*bear|bershka|stradivarius|lefties|mango)\b/i, category: "Ropa", confidence: 0.93 },
];

const CATEGORY_ALIASES = {
  "Alimentación": ["alimentacion", "supermercado", "compra de alimentos"],
  "Salud e higiene": ["salud", "salud e higiene", "farmacia", "higiene"],
  "Transporte": ["transporte", "gasolina", "combustible", "movilidad"],
  "Telefonía": ["telefonia", "telefono", "telecomunicaciones"],
  "Suscripciones": ["suscripciones", "suscripcion", "servicios digitales"],
  "Tecnología": ["tecnologia", "electronica", "informatica"],
  "Ropa": ["ropa", "vestimenta", "calzado"],
  "Restauración": ["restauracion", "restaurantes", "comida fuera"],
  "Ingresos laborales": ["ingresos laborales", "nomina", "salario"],
  "Nómina": ["nomina", "salario", "ingresos laborales"],
  "Devoluciones": ["devoluciones", "reembolsos", "cashback", "devoluciones de compras", "cashback y recompensas"],
  "Ingresos financieros": ["ingresos financieros", "intereses"],
  "Prestaciones": ["prestaciones", "ayudas", "subsidios", "prestaciones y ayudas"],
  "Otros ingresos": ["otros ingresos", "ingresos varios"],
  "Devolución de préstamo": ["cobros de prestamos", "prestamo devuelto", "devoluciones", "reembolsos"],
  "Hogar": ["hogar", "suministros", "electricidad", "agua", "gas", "servicios del hogar", "servicios"],
  "Vivienda": ["vivienda", "alquiler", "arrendamiento", "habitacion", "renta"],
  "Servicios": ["servicios", "suministros", "electricidad", "agua", "gas"],
};

function resolveCategory(wanted, categories = []) {
  const candidates = [wanted, ...(CATEGORY_ALIASES[wanted] || [])].map(normalizeFinanceText);
  for (const candidate of candidates) {
    const match = categories.find((category) => normalizeFinanceText(category.name) === candidate);
    if (match) return match;
  }
  return null;
}

export function classifyExpenseMerchant(merchant, categories = []) {
  const value = String(merchant || "").trim();
  if (value.length < 2) return { category: null, confidence: 0, requiresReview: true, source: "none" };
  const rule = EXPENSE_RULES.find((entry) => entry.pattern.test(value));
  if (!rule) return { category: null, confidence: 0, requiresReview: true, source: "none" };
  const category = resolveCategory(rule.category, categories);
  if (!category) return { category: null, confidence: 0, requiresReview: true, source: "merchant-pattern" };
  return {
    category,
    confidence: rule.confidence,
    requiresReview: rule.confidence < 0.9,
    source: "merchant-pattern",
  };
}

export function classifyIncomeNotice(reason, categories = []) {
  const value = normalizeFinanceText(reason);
  let wanted = null;
  let confidence = 0;
  if (/\b(nomina|salario|salary|payroll)\b/.test(value)) {
    wanted = "Nómina"; confidence = 0.97;
  } else if (/\b(te ha devuelto|ha devuelto|devuelve|devolvio|devolucion (?:del )?prestamo|prestamo anterior|dinero prestado|prestamo que (?:le )?hiciste)\b/.test(value) && /\bprestamo\b/.test(value)) {
    wanted = "Devolución de préstamo"; confidence = 0.94;
  } else if (/\b(cashback|reembolso|devolucion|refund|reintegro|devuelto)\b/.test(value)) {
    wanted = "Devoluciones"; confidence = 0.94;
  } else if (/\b(interes(?:es)?|interest(?:s)?)\b/.test(value)) {
    wanted = "Ingresos financieros"; confidence = 0.94;
  } else if (/\b(pension|prestacion|subsidio|beneficio)\b/.test(value)) {
    wanted = "Prestaciones"; confidence = 0.9;
  } else if (/\b(abono confirmado|ingreso confirmado)\b/.test(value)) {
    wanted = "Otros ingresos"; confidence = 0.72;
  }
  const category = wanted ? resolveCategory(wanted, categories) : null;
  return {
    category,
    categoryName: category?.name || null,
    confidence: category ? confidence : 0,
    requiresReview: !category || confidence < 0.9,
    source: category ? "notification-signal" : "none",
  };
}
