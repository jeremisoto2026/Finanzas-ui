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
    .replace(/\p{Diacritic}/gu, '');

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
  const sourceMonthDays = month >= 1 && month <= 12
    ? new Date(Date.UTC(year, month, 0)).getUTCDate()
    : 0;
  if (day < 1 || day > sourceMonthDays) {
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


/** Groups monetary values by key, accumulating integer cents per group. */
export function sumMoneyBy(items, getKey, getAmount = (item) => item.amount) {
  if (!Array.isArray(items) || typeof getKey !== 'function') {
    throw new TypeError('Se esperaba una lista y una función para agrupar.');
  }

  const groups = new Map();
  for (const item of items) {
    const key = String(getKey(item) ?? 'Otros');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(getAmount(item));
  }

  return Object.fromEntries(
    [...groups.entries()].map(([key, amounts]) => [key, sumMoney(amounts)])
  );
}


/** Adds whole days to a date-only value without local-time or DST drift. */
export function addDaysClamped(dateValue, daysToAdd) {
  const value = String(dateValue || '').slice(0, 10);
  const match = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-').map(Number) : null;
  if (!match || !Number.isInteger(daysToAdd)) {
    throw new TypeError('Se esperaba una fecha YYYY-MM-DD y un desplazamiento entero de días.');
  }
  const [year, month, day] = match;
  const checkMonthDays = month >= 1 && month <= 12 ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 0;
  if (day < 1 || day > checkMonthDays) throw new RangeError('La fecha no es válida.');
  const date = new Date(Date.UTC(year, month - 1, day + daysToAdd));
  return date.toISOString().slice(0, 10);
}

/** Returns the correct due date for a given installment frequency. */
export function addInstallmentDate(dateValue, frequency, occurrence) {
  if (!Number.isInteger(occurrence) || occurrence < 0) {
    throw new RangeError('La cuota debe ser un número entero igual o mayor que cero.');
  }
  const normalized = String(frequency || 'monthly')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
  if (['weekly', 'semanal'].includes(normalized)) return addDaysClamped(dateValue, occurrence * 7);
  if (['biweekly', 'quincenal'].includes(normalized)) return addDaysClamped(dateValue, occurrence * 14);
  if (['quarterly', 'trimestral'].includes(normalized)) return addMonthsClamped(dateValue, occurrence * 3);
  if (['monthly', 'mensual', 'mensualidad'].includes(normalized)) return addMonthsClamped(dateValue, occurrence);
  throw new RangeError('La frecuencia del plan de cuotas no está admitida.');
}

/**
 * Distributes an amount across positive installments using integer cents.
 * Optional first and last installments are fixed; all remaining cents are
 * spread evenly, assigning leftover cents to the earliest flexible installments.
 */
export function distributeInstallmentAmounts(totalAmount, installmentCount, firstAmount = null, lastAmount = null) {
  const totalCents = toCents(totalAmount);
  if (totalCents <= 0 || !Number.isInteger(installmentCount) || installmentCount < 1) {
    throw new RangeError('El importe total y el número de cuotas deben ser válidos.');
  }

  const amounts = Array(installmentCount).fill(null);
  if (installmentCount === 1) {
    const provided = [firstAmount, lastAmount]
      .filter((value) => value !== null && value !== undefined && String(value).trim() !== '')
      .map((value) => toCents(value));
    if (provided.some((value) => value !== totalCents)) {
      throw new RangeError('Una única cuota debe coincidir con el importe total.');
    }
    return [fromCents(totalCents)];
  }

  if (firstAmount !== null && firstAmount !== undefined && String(firstAmount).trim() !== '') {
    amounts[0] = toCents(firstAmount);
  }
  if (lastAmount !== null && lastAmount !== undefined && String(lastAmount).trim() !== '') {
    amounts[installmentCount - 1] = toCents(lastAmount);
  }

  const fixedCents = amounts.reduce((sum, value) => sum + (value ?? 0), 0);
  if (fixedCents > totalCents) throw new RangeError('La primera y última cuota superan el importe total.');
  const flexibleIndexes = amounts.flatMap((value, index) => value === null ? [index] : []);
  const remainingCents = totalCents - fixedCents;

  if (flexibleIndexes.length === 0 && remainingCents !== 0) {
    throw new RangeError('La suma de la primera y última cuota no coincide con el importe total.');
  }
  if (flexibleIndexes.length > 0 && remainingCents < flexibleIndexes.length) {
    throw new RangeError('El importe es demasiado pequeño para repartirlo en todas las cuotas.');
  }

  const baseCents = flexibleIndexes.length ? Math.floor(remainingCents / flexibleIndexes.length) : 0;
  const extraCents = flexibleIndexes.length ? remainingCents % flexibleIndexes.length : 0;
  flexibleIndexes.forEach((index, position) => {
    amounts[index] = baseCents + (position < extraCents ? 1 : 0);
  });

  if (amounts.some((value) => !Number.isSafeInteger(value) || value <= 0)) {
    throw new RangeError('Cada cuota debe tener un importe mayor que cero.');
  }
  if (amounts.reduce((sum, value) => sum + value, 0) !== totalCents) {
    throw new Error('No se pudo cuadrar la suma de las cuotas.');
  }

  return amounts.map(fromCents);
}
