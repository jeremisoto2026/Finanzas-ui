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
