import { createClient } from "npm:@supabase/supabase-js@2";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });

class HttpError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
const dateIsValid = (value: unknown) => {
  const date = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(date + "T00:00:00.000Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
};
const cents = (value: unknown) => Math.round((Number(value || 0) + Number.EPSILON) * 100);
const normalize = (value: unknown) => String(value || "").normalize("NFKC")
  .trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
const frequencyToDb = (value: unknown) => ({
  mensual: "monthly", mensualidad: "monthly", quincenal: "biweekly", semanal: "weekly",
  trimestral: "quarterly", anual: "yearly", annual: "yearly", monthly: "monthly",
  biweekly: "biweekly", weekly: "weekly", quarterly: "quarterly", yearly: "yearly", custom: "custom",
}[String(value || "").toLowerCase()] || "monthly");
const frequencyFromDb = (value: string) => ({
  monthly: "mensual", biweekly: "quincenal", weekly: "semanal",
  quarterly: "trimestral", yearly: "anual", custom: "personalizado",
}[value] || value || "mensual");
const dateOnly = (value: unknown) => value ? String(value).slice(0, 10) : null;

async function categoryId(db: any, userId: string, label: unknown) {
  const name = String(label || "").normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!name) return null;
  const { data, error } = await db.from("categories").select("id, name, direction")
    .eq("user_id", userId).order("created_at", { ascending: true });
  if (error) throw error;
  const reconcileDirection = async (category: any) => {
    if (!category) return null;
    if (category.direction !== "expense" && category.direction !== "both") {
      const { error: updateError } = await db.from("categories").update({ direction: "both" })
        .eq("id", category.id).eq("user_id", userId);
      if (updateError) throw updateError;
    }
    return category.id;
  };
  const found = (data || []).find((row: any) => normalize(row.name) === normalize(name));
  if (found) return reconcileDirection(found);
  const { data: inserted, error: insertError } = await db.from("categories")
    .insert({ user_id: userId, name, direction: "expense" }).select("id").single();
  if (insertError) {
    if (insertError.code === "23505") {
      const retry = await db.from("categories").select("id, name, direction").eq("user_id", userId);
      if (retry.error) throw retry.error;
      const existing = (retry.data || []).find((row: any) => normalize(row.name) === normalize(name));
      if (existing) return reconcileDirection(existing);
    }
    throw insertError;
  }
  return inserted.id;
}
async function accountId(db: any, userId: string, label: unknown) {
  const name = String(label || "").trim();
  if (!name) return null;
  const { data, error } = await db.from("accounts").select("id")
    .eq("user_id", userId).eq("name", name).maybeSingle();
  if (error) throw error;
  if (data?.id) return data.id;
  const { data: inserted, error: insertError } = await db.from("accounts").insert({
    user_id: userId, name, opening_balance: 0,
    opening_balance_date: new Date().toISOString().slice(0, 10),
  }).select("id").single();
  if (insertError) throw insertError;
  return inserted.id;
}
function mapBudget(row: any) {
  return { id: row.id, month: String(row.period_start).slice(0, 7),
    amount: Number(row.planned_amount || 0), category: row.categories?.name || "Otros", notes: row.notes || "" };
}
function mapFixed(row: any) {
  return { id: row.id, nombre: row.name, monto: Number(row.amount || 0), metodo: row.payment_method || "",
    categoria: row.categories?.name || "", frecuencia: frequencyFromDb(row.frequency),
    fechaInicio: dateOnly(row.next_due_on) || "", activo: row.status === "active",
    notificacion: Boolean(row.notification_enabled), notas: row.notes || "" };
}
function mapPlan(plan: any, items: any[]) {
  const history = items.slice().sort((a, b) => a.installment_number - b.installment_number).map((item) => ({
    installmentId: item.id, numero: item.installment_number, monto: Number(item.amount || 0),
    pagada: item.status === "paid", transactionId: item.transaction_id || null,
    fecha: dateOnly(item.due_on), fechaPago: dateOnly(item.paid_on),
    fechaPrecision: item.due_date_precision || "day", notas: item.notes || "",
  }));
  return { id: plan.id, concepto: plan.name, montoTotal: Number(plan.total_amount || 0),
    cuotasTotales: Number(plan.installments_total || history.length),
    cuotasPagadas: history.filter((item) => item.pagada).length,
    montoPrimeraCuota: history[0]?.monto || 0, montoUltimaCuota: history.at(-1)?.monto || 0,
    tipoCuotas: history.length > 1 && history[0].monto !== history.at(-1).monto ? "decrecientes" : "fijas",
    fechaInicio: dateOnly(plan.start_on) || "", fechaInicioPrecision: plan.start_date_precision || "day",
    notas: plan.notes || "", metodo: plan.payment_method || "", categoria: plan.categories?.name || "",
    frecuenciaPago: frequencyFromDb(plan.frequency), activo: plan.status === "active", historialCuotas: history };
}
async function readOnePlan(db: any, userId: string, planId: string) {
  const { data: plan, error } = await db.from("installment_plans")
    .select("id, name, total_amount, installments_total, start_on, frequency, status, payment_method, notes, start_date_precision, categories(name)")
    .eq("id", planId).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!plan) return null;
  const { data: items, error: itemsError } = await db.from("installments")
    .select("id, installment_number, amount, due_on, paid_on, status, transaction_id, notes, due_date_precision")
    .eq("user_id", userId).eq("plan_id", planId).order("installment_number", { ascending: true });
  if (itemsError) throw itemsError;
  return mapPlan(plan, items || []);
}
function makeInstallment(item: any, userId: string, planId: string, fallback: number) {
  const number = Number(item.numero ?? item.installment_number ?? fallback);
  const amount = Number(item.monto ?? item.amount);
  const dueOn = String(item.fecha ?? item.due_on ?? "").slice(0, 10);
  if (!Number.isInteger(number) || number < 1 || !Number.isFinite(amount) || amount <= 0 || !dateIsValid(dueOn)) {
    throw new HttpError("El calendario contiene una cuota incompleta o inválida.");
  }
  const paid = Boolean(item.pagada ?? item.status === "paid");
  const paidOn = paid ? String(item.fechaPago ?? item.paid_on ?? "").slice(0, 10) : null;
  if (paid && !dateIsValid(paidOn)) throw new HttpError("Cada cuota pagada debe incluir su fecha real de pago.");
  return { user_id: userId, plan_id: planId, installment_number: number, amount,
    due_on: dueOn, paid_on: paidOn, status: paid ? "paid" : "scheduled",
    due_date_precision: item.fechaPrecision || "day", notes: String(item.notas || "").trim() || null };
}

async function budgets(db: any, userId: string, method: string, body: any) {
  if (method === "POST" || method === "PATCH") {
    if (method === "PATCH" && !body.id) throw new HttpError("Falta el identificador del presupuesto.");
    const patch: any = {};
    if (method === "POST" || body.month !== undefined) {
      const match = /^\d{4}-(0[1-9]|1[0-2])$/.exec(String(body.month || "").trim());
      if (!match) throw new HttpError("Selecciona un mes válido.");
      patch.period_start = match[0] + "-01";
    }
    if (method === "POST" || body.amount !== undefined) {
      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount < 0) throw new HttpError("El presupuesto debe ser igual o mayor que cero.");
      patch.planned_amount = amount;
    }
    if (method === "POST" || body.category !== undefined) patch.category_id = await categoryId(db, userId, body.category);
    if (method === "POST" || body.notes !== undefined) patch.notes = String(body.notes || "").trim() || null;
    if (method === "POST") {
      const { data, error } = await db.from("budgets").insert({ user_id: userId, ...patch })
        .select("id, period_start, planned_amount, notes, categories(name)").single();
      if (error?.code === "23505") {
        // A retried or repeated identical POST is idempotent: return the row that
        // the first request already created. A different budget still gets 409.
        const { data: existing, error: existingError } = await db.from("budgets")
          .select("id, period_start, planned_amount, notes, categories(name)")
          .eq("user_id", userId)
          .eq("category_id", patch.category_id)
          .eq("period_start", patch.period_start)
          .maybeSingle();
        if (existingError) throw existingError;
        if (existing &&
          cents(existing.planned_amount) === cents(patch.planned_amount) &&
          (existing.notes || null) === (patch.notes || null)) {
          return { status: 200, body: mapBudget(existing) };
        }
        throw new HttpError("Ya existe un presupuesto para esa categoría y ese mes. Edita el existente.", 409);
      }
      if (error) throw error;
      return { status: 201, body: mapBudget(data) };
    }
    if (!Object.keys(patch).length) throw new HttpError("No hay cambios para guardar.");
    const { data, error } = await db.from("budgets").update(patch).eq("id", body.id).eq("user_id", userId)
      .select("id, period_start, planned_amount, notes, categories(name)").maybeSingle();
    if (error?.code === "23505") throw new HttpError("Ya existe un presupuesto para esa categoría y ese mes.", 409);
    if (error) throw error;
    if (!data) throw new HttpError("No se encontró el presupuesto.", 404);
    return { status: 200, body: mapBudget(data) };
  }
  if (method === "DELETE") {
    if (!body.id) throw new HttpError("Falta el identificador del presupuesto.");
    const { data, error } = await db.from("budgets").delete().eq("id", body.id).eq("user_id", userId)
      .select("id").maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError("No se encontró el presupuesto.", 404);
    return { status: 200, body: { success: true, id: body.id } };
  }
  throw new HttpError("Método no permitido.", 405);
}

async function fixedPayments(db: any, userId: string, method: string, body: any) {
  const validate = (partial: boolean) => {
    const patch: any = {};
    if (!partial || body.nombre !== undefined) {
      const name = String(body.nombre || "").trim();
      if (!name) throw new HttpError("Indica un nombre para el pago fijo.");
      patch.name = name;
    }
    if (!partial || body.monto !== undefined) {
      const amount = Number(body.monto);
      if (!Number.isFinite(amount) || amount <= 0) throw new HttpError("El importe debe ser mayor que cero.");
      patch.amount = amount;
    }
    if (body.frecuencia !== undefined) {
      const frequency = frequencyToDb(body.frecuencia);
      if (!["weekly", "biweekly", "monthly", "quarterly", "yearly", "custom"].includes(frequency)) {
        throw new HttpError("La frecuencia del pago no es válida.");
      }
      patch.frequency = frequency;
    }
    if (body.fechaInicio !== undefined) {
      const date = body.fechaInicio ? String(body.fechaInicio).slice(0, 10) : null;
      if (date && !dateIsValid(date)) throw new HttpError("La fecha del pago no es válida.");
      patch.next_due_on = date;
    }
    if (body.metodo !== undefined) patch.payment_method = String(body.metodo || "").trim() || null;
    if (body.notificacion !== undefined) patch.notification_enabled = Boolean(body.notificacion);
    if (body.notas !== undefined) patch.notes = String(body.notas || "").trim() || null;
    return patch;
  };
  if (method === "POST") {
    const patch = validate(false);
    if (body.categoria) patch.category_id = await categoryId(db, userId, body.categoria);
    if (body.cuenta) patch.account_id = await accountId(db, userId, body.cuenta);
    const { data, error } = await db.from("fixed_payments").insert({ user_id: userId, ...patch, status: "active" })
      .select("id, name, amount, payment_method, frequency, next_due_on, status, notification_enabled, notes, categories(name), accounts(name)").single();
    if (error) throw error;
    return { status: 201, body: mapFixed(data) };
  }
  if (method === "PATCH") {
    if (!body.id) throw new HttpError("Falta el identificador del pago fijo.");
    const patch: any = {};
    if (body.activo !== undefined) {
      if (typeof body.activo !== "boolean") throw new HttpError("El estado activo no es válido.");
      patch.status = body.activo ? "active" : "paused";
    }
    Object.assign(patch, validate(true));
    if (body.categoria !== undefined) patch.category_id = await categoryId(db, userId, body.categoria);
    if (body.cuenta !== undefined) patch.account_id = body.cuenta ? await accountId(db, userId, body.cuenta) : null;
    if (!Object.keys(patch).length) throw new HttpError("No hay cambios para guardar.");
    const { data, error } = await db.from("fixed_payments").update(patch).eq("id", body.id).eq("user_id", userId)
      .select("id, name, amount, payment_method, frequency, next_due_on, status, notification_enabled, notes, categories(name), accounts(name)").maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError("No se encontró el pago fijo.", 404);
    return { status: 200, body: mapFixed(data) };
  }
  if (method === "DELETE") {
    if (!body.id) throw new HttpError("Falta el identificador del pago.");
    const { data, error } = await db.from("fixed_payments").update({ status: "cancelled" })
      .eq("id", body.id).eq("user_id", userId).select("id").maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError("No se encontró el pago fijo.", 404);
    return { status: 200, body: { success: true, id: body.id } };
  }
  throw new HttpError("Método no permitido.", 405);
}

async function installmentPlans(db: any, userId: string, method: string, body: any) {
  if (method === "POST" && body.action === "pay_installment") {
    if (!body.installmentId || !body.planId) throw new HttpError("Falta el identificador del plan o de la cuota.");
    if (!body.existingTransactionId && (!body.accountId || !dateIsValid(body.paidOn))) {
      throw new HttpError("Selecciona la cuenta y la fecha real del pago.");
    }
    const { data, error } = await db.rpc("register_installment_payment", {
      p_installment_id: body.installmentId,
      p_account_id: body.accountId || null,
      p_paid_on: body.paidOn || null,
      p_existing_transaction_id: body.existingTransactionId || null,
    });
    if (error) throw error;
    const plan = await readOnePlan(db, userId, body.planId);
    if (!plan) throw new HttpError("No se encontró la compra a cuotas después de registrar el movimiento.", 404);
    return { status: 200, body: { success: true, plan, transactionId: data?.transactionId || null,
      alreadyRecorded: Boolean(data?.alreadyRecorded) } };
  }

  if (method === "POST") {
    const name = String(body.concepto || "").trim();
    const total = Number(body.montoTotal);
    const count = Number(body.cuotasTotales);
    const start = body.fechaInicio;
    if (!name || !Number.isFinite(total) || total <= 0 || !Number.isInteger(count) || count < 1 || !dateIsValid(start)) {
      throw new HttpError("Revisa concepto, importe, número de cuotas y fecha de inicio.");
    }
    const history = Array.isArray(body.historialCuotas) ? body.historialCuotas : [];
    if (history.length !== count) throw new HttpError("El calendario debe contener exactamente el número de cuotas indicado.");
    const previewRows = history.map((item: any, index: number) => makeInstallment(item, userId, "pending", index + 1));
    if (previewRows.some((row: any, index: number) => row.installment_number !== index + 1)) throw new HttpError("El calendario debe numerar las cuotas consecutivamente.");
    if (previewRows.reduce((sum: number, row: any) => sum + cents(row.amount), 0) !== cents(total)) {
      throw new HttpError("La suma de las cuotas no coincide con el importe total.");
    }
    const frequency = frequencyToDb(body.frecuenciaPago);
    if (!["weekly", "biweekly", "monthly", "quarterly"].includes(frequency)) throw new HttpError("La frecuencia indicada no está admitida para planes de cuotas.");
    const { data: candidates, error: candidatesError } = await db.from("installment_plans")
      .select("id, name, status").eq("user_id", userId).eq("total_amount", total)
      .eq("installments_total", count).eq("start_on", String(start).slice(0, 10))
      .eq("frequency", frequency).limit(25);
    if (candidatesError) throw candidatesError;
    const duplicate = (candidates || []).find((item: any) => normalize(item.name) === normalize(name));
    if (duplicate) throw new HttpError(duplicate.status === "cancelled"
      ? "Ya existe un registro anterior de esta misma compra, aunque esté cancelado. Revisa el historial antes de crear otro."
      : "Ya existe una compra con el mismo concepto, importe, cuotas y fecha de inicio.", 409);

    const category = await categoryId(db, userId, body.categoria);
    const { data: plan, error: planError } = await db.from("installment_plans").insert({
      user_id: userId, name, total_amount: total, installments_total: count,
      start_on: String(start).slice(0, 10), frequency, status: "active", category_id: category,
      payment_method: body.metodo || null, notes: String(body.notas || "").trim() || null,
      start_date_precision: body.fechaInicioPrecision || "day",
    }).select("id").single();
    if (planError) throw planError;
    try {
      const rows = history.map((item: any, index: number) => makeInstallment(item, userId, plan.id, index + 1));
      const { error } = await db.from("installments").insert(rows);
      if (error) throw error;
    } catch (error) {
      await db.from("installment_plans").delete().eq("id", plan.id).eq("user_id", userId);
      throw error;
    }
    const created = await readOnePlan(db, userId, plan.id);
    return { status: 201, body: created };
  }

  if (method === "PATCH") {
    if (!body.id) throw new HttpError("Falta el identificador del plan.");
    const { data: current, error: currentError } = await db.from("installment_plans")
      .select("id, name, total_amount, installments_total, start_on, frequency, status, payment_method, notes, category_id, start_date_precision")
      .eq("id", body.id).eq("user_id", userId).maybeSingle();
    if (currentError) throw currentError;
    if (!current) throw new HttpError("No se encontró la compra a cuotas.", 404);
    const patch: any = {};
    if (body.activo !== undefined) patch.status = body.activo ? "active" : "paused";
    if (body.concepto !== undefined) {
      const name = String(body.concepto || "").trim();
      if (!name) throw new HttpError("El concepto no puede estar vacío.");
      patch.name = name;
    }
    if (body.montoTotal !== undefined) {
      const amount = Number(body.montoTotal);
      if (!Number.isFinite(amount) || amount <= 0) throw new HttpError("El importe total debe ser mayor que cero.");
      patch.total_amount = amount;
    }
    if (body.cuotasTotales !== undefined) {
      const n = Number(body.cuotasTotales);
      if (!Number.isInteger(n) || n < 1) throw new HttpError("El número de cuotas no es válido.");
      patch.installments_total = n;
    }
    if (body.fechaInicio !== undefined) {
      if (!dateIsValid(body.fechaInicio)) throw new HttpError("La fecha de inicio no es válida.");
      patch.start_on = body.fechaInicio;
    }
    if (body.frecuenciaPago !== undefined) {
      const frequency = frequencyToDb(body.frecuenciaPago);
      if (!["weekly", "biweekly", "monthly", "quarterly"].includes(frequency)) throw new HttpError("La frecuencia de cuotas no es válida.");
      patch.frequency = frequency;
    }
    if (body.categoria !== undefined) patch.category_id = await categoryId(db, userId, body.categoria);
    if (body.metodo !== undefined) patch.payment_method = String(body.metodo || "").trim() || null;
    if (body.notas !== undefined) patch.notes = String(body.notas || "").trim() || null;
    if (body.fechaInicioPrecision !== undefined) patch.start_date_precision = body.fechaInicioPrecision || "day";

    if (Array.isArray(body.historialCuotas)) {
      const { data: existing, error } = await db.from("installments").select("id, installment_number, amount, due_on, paid_on, status, transaction_id")
        .eq("user_id", userId).eq("plan_id", body.id).order("installment_number", { ascending: true });
      if (error) throw error;
      const rows = body.historialCuotas.map((item: any, index: number) => makeInstallment(item, userId, body.id, index + 1));
      const nextCount = Number(patch.installments_total ?? current.installments_total);
      const nextTotal = Number(patch.total_amount ?? current.total_amount);
      if (rows.length !== nextCount) throw new HttpError("El calendario debe contener exactamente el número de cuotas indicado.");
      if (rows.some((row: any, index: number) => row.installment_number !== index + 1)) throw new HttpError("El calendario debe numerar las cuotas consecutivamente.");
      if (rows.reduce((sum: number, row: any) => sum + cents(row.amount), 0) !== cents(nextTotal)) throw new HttpError("La suma de las cuotas no coincide con el importe total.");
      const oldRows = existing || [];
      const byNumber = new Map(oldRows.map((item: any) => [item.installment_number, item]));
      for (const row of rows) {
        const previous: any = byNumber.get(row.installment_number);
        if (previous && (previous.transaction_id || previous.status === "paid") && (
          cents(previous.amount) !== cents(row.amount) || dateOnly(previous.due_on) !== row.due_on ||
          previous.status !== row.status || dateOnly(previous.paid_on) !== row.paid_on
        )) throw new HttpError("La cuota " + row.installment_number + " ya está pagada o vinculada y no se puede alterar.", 409);
      }
      const requested = new Set(rows.map((row: any) => row.installment_number));
      const protectedRemoved = oldRows.find((item: any) => !requested.has(item.installment_number) && (item.status === "paid" || item.transaction_id));
      if (protectedRemoved) throw new HttpError("No puedes eliminar la cuota " + protectedRemoved.installment_number + " porque ya está pagada o vinculada.", 409);
      for (const row of rows) {
        const previous: any = byNumber.get(row.installment_number);
        const result = previous
          ? await db.from("installments").update(row).eq("id", previous.id).eq("user_id", userId).eq("plan_id", body.id)
          : await db.from("installments").insert(row);
        if (result.error) throw result.error;
      }
      const removeIds = oldRows.filter((item: any) => !requested.has(item.installment_number)).map((item: any) => item.id);
      if (removeIds.length) {
        const { error: removeError } = await db.from("installments").delete().eq("user_id", userId).eq("plan_id", body.id).in("id", removeIds);
        if (removeError) throw removeError;
      }
    }
    if (Object.keys(patch).length) {
      const { error } = await db.from("installment_plans").update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", body.id).eq("user_id", userId);
      if (error) throw error;
    }
    return { status: 200, body: await readOnePlan(db, userId, body.id) };
  }

  if (method === "DELETE") {
    if (!body.id) throw new HttpError("Falta el identificador del plan.");
    const { data, error } = await db.from("installment_plans").update({ status: "cancelled" })
      .eq("id", body.id).eq("user_id", userId).select("id").maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError("No se encontró la compra a cuotas.", 404);
    return { status: 200, body: { success: true, id: body.id } };
  }
  throw new HttpError("Método no permitido.", 405);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply({ error: "Método no permitido." }, 405);
  const authorization = req.headers.get("Authorization");
  if (!authorization) return reply({ error: "Falta la sesión del usuario." }, 401);
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !key) return reply({ error: "Falta la configuración de Supabase." }, 500);
  const db = createClient(url, key, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: authError } = await db.auth.getUser();
  if (authError || !userData.user) return reply({ error: "La sesión no es válida." }, 401);

  try {
    const request = await req.json();
    const path = String(request?.path || "");
    const method = String(request?.method || "").toUpperCase();
    const body = request?.body && typeof request.body === "object" ? request.body : {};
    if (!["/api/presupuestos", "/api/pagos-fijos", "/api/compras-cuotas"].includes(path)) {
      throw new HttpError("Operación no disponible en Finanzas Mobile.", 404);
    }
    if (!["POST", "PATCH", "DELETE"].includes(method)) throw new HttpError("Método no permitido.", 405);
    const userId = userData.user.id;
    const result = path === "/api/presupuestos"
      ? await budgets(db, userId, method, body)
      : path === "/api/pagos-fijos"
        ? await fixedPayments(db, userId, method, body)
        : await installmentPlans(db, userId, method, body);
    return reply(result.body, result.status);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    if (status >= 500) console.error("finance-management-write failed", error);
    return reply({ error: error instanceof Error ? error.message : "No se pudo completar la operación financiera." }, status);
  }
});
