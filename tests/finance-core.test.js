import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateAccountBalance,
  calculateAvailableBalance,
  fromCents,
  sumMoney,
  toCents,
} from "../src/lib/finance-core.js";

test("reproduce el saldo de Revolut: 284 + 740 - 785 - 9,50 = 229,50", () => {
  const transactions = [
    { accountId: "revolut", type: "income", amount: 740 },
    { accountId: "revolut", type: "expense", amount: 785 },
    { accountId: "revolut", type: "expense", amount: 9.5 },
  ];
  assert.equal(calculateAccountBalance({
    accountId: "revolut",
    openingBalance: 284,
    transactions,
  }), 229.5);
});

test("los movimientos pendientes no alteran el saldo", () => {
  const transactions = [
    { accountId: "revolut", type: "income", amount: 50, status: "pending" },
    { accountId: "revolut", type: "expense", amount: 10, status: "posted" },
  ];
  assert.equal(calculateAccountBalance({
    accountId: "revolut",
    openingBalance: 229.5,
    transactions,
  }), 219.5);
});

test("las transferencias emparejadas no crean ingresos ni gastos netos", () => {
  const transactions = [
    { accountId: "revolut", type: "transfer_out", amount: 100 },
    { accountId: "bbva", type: "transfer_in", amount: 100 },
  ];
  const revolut = calculateAccountBalance({ accountId: "revolut", openingBalance: 229.5, transactions });
  const bbva = calculateAccountBalance({ accountId: "bbva", openingBalance: 0, transactions });
  assert.equal(revolut + bbva, 229.5);
});

test("las reservas reducen el dinero libre, no el saldo bancario", () => {
  const reservations = [
    { amount: 38.34, status: "active" },
    { amount: 26.91, status: "active" },
    { amount: 100, status: "released" },
  ];
  assert.equal(calculateAvailableBalance(229.5, reservations), 164.25);
});

test("los importes se suman sin deriva de coma flotante", () => {
  assert.equal(toCents("229,50"), 22950);
  assert.equal(fromCents(22950), 229.5);
  assert.equal(sumMoney([0.1, 0.2, 0.3]), 0.6);
});
