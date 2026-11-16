/**
 * Money helpers for the personal-finance ledger.
 * Values are kept in integer cents internally to avoid floating-point drift.
 */
export function toCents(value) {
  const normalized = typeof value === "string" ? value.trim().replace(",", ".") : value;
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) throw new TypeError("El importe debe ser un número válido.");
  return Math.round((amount + Number.EPSILON) * 100);
}

export function fromCents(cents) {
  if (!Number.isSafeInteger(cents)) throw new TypeError("El importe en céntimos debe ser un entero seguro.");
  return Number((cents / 100).toFixed(2));
}

export function sumMoney(items, getAmount = (item) => item) {
  if (!Array.isArray(items)) throw new TypeError("Se esperaba una lista de importes.");
  return fromCents(items.reduce((sum, item) => sum + toCents(getAmount(item)), 0));
}

/** Only posted movements affect the account balance. */
export function transactionDeltaCents(transaction) {
  if (!transaction || typeof transaction !== "object") throw new TypeError("Movimiento no válido.");
  if ((transaction.status || "posted") !== "posted") return 0;

  const amountCents = toCents(transaction.amount);
  if (amountCents <= 0) throw new RangeError("Los movimientos deben tener un importe mayor que cero.");

  switch (transaction.type) {
    case "income":
    case "transfer_in":
      return amountCents;
    case "expense":
    case "transfer_out":
      return -amountCents;
    default:
      throw new TypeError("Tipo de movimiento no reconocido.");
  }
}

export function calculateAccountBalance({ accountId, openingBalance = 0, transactions = [] }) {
  if (!Array.isArray(transactions)) throw new TypeError("Se esperaba una lista de movimientos.");
  const movementCents = transactions
    .filter((transaction) => transaction.accountId === accountId)
    .reduce((sum, transaction) => sum + transactionDeltaCents(transaction), 0);
  return fromCents(toCents(openingBalance) + movementCents);
}

export function calculateAvailableBalance(balance, reservations = []) {
  if (!Array.isArray(reservations)) throw new TypeError("Se esperaba una lista de reservas.");
  const reservedCents = reservations
    .filter((reservation) => reservation.status === "active")
    .reduce((sum, reservation) => sum + toCents(reservation.amount), 0);
  return fromCents(toCents(balance) - reservedCents);
}


/**
 * Converts a recurring amount into its average monthly equivalent.
 * Returns null for custom/unknown frequencies rather than guessing.
 */
export function monthlyEquivalentAmount(amount, frequency) {
  const normalizedFrequency = String(frequency || 'monthly')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\\u0300-\\u036f]/g, '');

  const factors = {
    monthly: 1,
    mensual: 1,
    mensualidad: 1,
    biweekly: 26 / 12,
    quincenal: 26 / 12,
    weekly: 52 / 12,
    semanal: 52 / 12,
    quarterly: 1 / 3,
    trimestral: 1 / 3,
    yearly: 1 / 12,
    annual: 1 / 12,
    anual: 1 / 12,
  };

  const factor = factors[normalizedFrequency];
  if (factor === undefined) return null;
  return fromCents(Math.round(toCents(amount) * factor));
}

export function sumMonthlyEquivalent(items, getAmount = (item) => item.amount, getFrequency = (item) => item.frequency) {
  if (!Array.isArray(items)) throw new TypeError("Se esperaba una lista de pagos recurrentes.");

  const monthlyAmounts = [];
  for (const item of items) {
    const monthlyAmount = monthlyEquivalentAmount(getAmount(item), getFrequency(item));
    if (monthlyAmount !== null) monthlyAmounts.push(monthlyAmount);
  }

  return sumMoney(monthlyAmounts);
}


/** Adds calendar months while keeping end-of-month dates inside the target month. */
export function addMonthsClamped(dateValue, monthsToAdd) {
  const value = String(dateValue || '').slice(0, 10);
  const match = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-').map(Number) : null;
  if (!match || !Number.isInteger(monthsToAdd)) {
    throw new TypeError('Se esperaba una fecha YYYY-MM-DD y un desplazamiento entero.');
  }

  const [year, month, day] = match;
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new RangeError('La fecha no es válida.');
  }

  const targetMonthIndex = year * 12 + (month - 1) + monthsToAdd;
  const targetYear = Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const targetDay = Math.min(day, lastDay);

  return [
    String(targetYear).padStart(4, '0'),
    String(targetMonth + 1).padStart(2, '0'),
    String(targetDay).padStart(2, '0'),
  ].join('-');
}
