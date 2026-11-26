import test from "node:test";
import assert from "node:assert/strict";
import { classifyExpenseMerchant, classifyIncomeNotice } from "../../../supabase/functions/notification-capture-sync/finance-intelligence.js";

const categories = [
  { id: "food", name: "Alimentación" },
  { id: "health", name: "Salud" },
  { id: "transport", name: "Transporte" },
  { id: "phone", name: "Telefonía" },
  { id: "subs", name: "Suscripciones" },
  { id: "salary", name: "Nómina" },
  { id: "refund", name: "Reembolsos" },
  { id: "loan-refund", name: "Devolución de préstamo" },
  { id: "loan-collections", name: "Cobros de préstamos" },
  { id: "home", name: "Hogar" },
  { id: "housing", name: "Vivienda" },
  { id: "services", name: "Servicios" },
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


test("recognizes repayments of loans without assigning payroll", () => {
  const result = classifyIncomeNotice("Juan te ha devuelto 85 EUR de un préstamo anterior", categories);
  assert.equal(result.category?.name, "Devolución de préstamo");
  assert.equal(result.requiresReview, false);
});

test("classifies electricity receipts as household supplies", () => {
  const result = classifyExpenseMerchant("Recibo de electricidad", categories);
  assert.equal(result.category?.name, "Hogar");
  assert.ok(result.confidence >= 0.9);
});


test("classifies rent as housing rather than generic services", () => {
  const result = classifyExpenseMerchant("Alquiler de habitación", categories);
  assert.equal(result.category?.name, "Vivienda");
});

test("classifies motorcycle workshop expenses as transport", () => {
  const result = classifyExpenseMerchant("Taller de motos", categories);
  assert.equal(result.category?.name, "Transporte");
});


test("recognizes loan repayment phrased as devolución del préstamo", () => {
  const result = classifyIncomeNotice("Has recibido 85 EUR. Concepto: devolución del préstamo que le hiciste anteriormente.", categories);
  assert.equal(result.category?.name, "Devolución de préstamo");
  assert.equal(result.requiresReview, false);
});


test("recognizes present-tense loan repayment", () => {
  const result = classifyIncomeNotice("Juan devuelve 85 € del préstamo.", categories);
  assert.equal(result.category?.name, "Devolución de préstamo");
  assert.equal(result.requiresReview, false);
});

test("does not force loan repayments into payroll when no suitable income category exists", () => {
  const result = classifyIncomeNotice("Juan devuelve 85 € del préstamo.", [
    { id: "salary", name: "Nómina" },
  ]);
  assert.equal(result.category, null);
  assert.equal(result.categoryName, null);
  assert.equal(result.requiresReview, true);
});

test("maps loan repayment to Cobros de préstamos when that is the available category", () => {
  const result = classifyIncomeNotice("Juan devuelve 85 € del préstamo.", [
    { id: "loan-collections", name: "Cobros de préstamos" },
  ]);
  assert.equal(result.category?.name, "Cobros de préstamos");
  assert.equal(result.requiresReview, false);
});
