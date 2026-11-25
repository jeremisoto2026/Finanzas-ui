import test from "node:test";
import assert from "node:assert/strict";
import { classifyExpenseMerchant, classifyIncomeNotice } from "../../../supabase/functions/notification-capture-sync/finance-intelligence.js";

const categories = [
  { id: "food", name: "Alimentación" },
  { id: "health", name: "Salud e higiene" },
  { id: "transport", name: "Transporte" },
  { id: "phone", name: "Telefonía" },
  { id: "subs", name: "Suscripciones" },
  { id: "salary", name: "Nómina" },
  { id: "refund", name: "Devoluciones" },
];

test("classifies known supermarkets with high confidence", () => {
  const result = classifyExpenseMerchant("Compra MERCADONA 1234", categories);
  assert.equal(result.category.id, "food");
  assert.ok(result.confidence >= 0.9);
  assert.equal(result.requiresReview, false);
});

test("classifies pharmacies and fuel stations", () => {
  assert.equal(classifyExpenseMerchant("FARMACIA CENTRAL", categories).category.id, "health");
  assert.equal(classifyExpenseMerchant("REPSOL 24H", categories).category.id, "transport");
});

test("does not invent a category for unknown merchants", () => {
  const result = classifyExpenseMerchant("COMERCIO DESCONOCIDO", categories);
  assert.equal(result.category, null);
  assert.equal(result.requiresReview, true);
});

test("suggests payroll category only when the signal is explicit", () => {
  const result = classifyIncomeNotice("Nómina abonada; requiere confirmación", categories);
  assert.equal(result.category.id, "salary");
  assert.ok(result.confidence >= 0.9);
});

test("does not misclassify generic incoming transfers", () => {
  const result = classifyIncomeNotice("Posible entrada de dinero: confirmar origen", categories);
  assert.equal(result.category, null);
  assert.equal(result.requiresReview, true);
});

test("suggests refund category without changing the movement direction", () => {
  const result = classifyIncomeNotice("Devolución abonada; requiere confirmación", categories);
  assert.equal(result.category.id, "refund");
});
