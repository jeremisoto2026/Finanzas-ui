import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

const dateOnly = (value: unknown) => value ? String(value).slice(0, 10) : null;

const frequencyFromDb = (value: string) => ({
  monthly: "mensual", biweekly: "quincenal", weekly: "semanal",
  quarterly: "trimestral", yearly: "anual", custom: "personalizado",
}[value] || value || "mensual");

function transactionForUi(row: any) {
  return {
    id: row.id,
    concepto: row.description || "",
    monto: Number(row.amount || 0),
    fecha: dateOnly(row.occurred_on) || "",
    categoria: row.categories?.name || "Otros",
    metodo: row.payment_method || "",
    cuenta: row.accounts?.name || "",
    cuentaId: row.account_id || null,
    origen: "normal",
  };
}

function installmentPlanForUi(plan: any, installments: any[]) {
  const history = installments.slice().sort((a, b) => a.installment_number - b.installment_number).map((item) => ({
    installmentId: item.id,
    numero: item.installment_number,
    monto: Number(item.amount || 0),
    pagada: item.status === "paid",
    transactionId: item.transaction_id || null,
    fecha: dateOnly(item.due_on),
    fechaPago: dateOnly(item.paid_on),
    fechaPrecision: item.due_date_precision || "day",
    notas: item.notes || "",
  }));
  return {
    id: plan.id,
    concepto: plan.name,
    montoTotal: Number(plan.total_amount || 0),
    cuotasTotales: Number(plan.installments_total || history.length),
    cuotasPagadas: history.filter((item) => item.pagada).length,
    montoPrimeraCuota: history[0]?.monto || 0,
    montoUltimaCuota: history.at(-1)?.monto || 0,
    tipoCuotas: history.length > 1 && history[0].monto !== history.at(-1).monto ? "decrecientes" : "fijas",
    fechaInicio: dateOnly(plan.start_on) || "",
    fechaInicioPrecision: plan.start_date_precision || "day",
    notas: plan.notes || "",
    metodo: plan.payment_method || "",
    categoria: plan.categories?.name || "",
    frecuenciaPago: frequencyFromDb(plan.frequency),
    activo: plan.status === "active",
    historialCuotas: history,
  };
}

function fixedPaymentForUi(row: any) {
  return {
    id: row.id,
    nombre: row.name,
    monto: Number(row.amount || 0),
    metodo: row.payment_method || "",
    categoria: row.categories?.name || "",
    frecuencia: frequencyFromDb(row.frequency),
    fechaInicio: dateOnly(row.next_due_on) || "",
    activo: row.status === "active",
    notificacion: Boolean(row.notification_enabled),
    notas: row.notes || "",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const authorization = req.headers.get("Authorization");
  if (!authorization) return json({ error: "Falta la sesión del usuario." }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  if (!url || !anonKey) return json({ error: "Falta la configuración de Supabase." }, 500);

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return json({ error: "La sesión no es válida." }, 401);
  const userId = userData.user.id;

  try {
    const [plansResult, fixedResult, budgetsResult, debtsResult, replenishmentsResult, incomesResult, expensesResult] = await Promise.all([
      supabase.from("installment_plans")
        .select("id, name, total_amount, installments_total, start_on, frequency, status, payment_method, notes, start_date_precision, categories(name)")
        .eq("user_id", userId).neq("status", "cancelled").order("start_on", { ascending: true }),
      supabase.from("fixed_payments")
        .select("id, name, amount, payment_method, frequency, next_due_on, status, notification_enabled, notes, categories(name), accounts(name)")
        .eq("user_id", userId).neq("status", "cancelled").order("next_due_on", { ascending: true }),
      supabase.from("budgets")
        .select("id, period_start, planned_amount, notes, categories(name)")
        .eq("user_id", userId).order("period_start", { ascending: false }),
      supabase.from("debts")
        .select("id, direction, person_name, description, original_amount, outstanding_amount, due_on, status")
        .eq("user_id", userId).order("created_at", { ascending: false }),
      supabase.from("financial_items")
        .select("id, item_kind, title, amount, outstanding_amount, status, beneficiary, effective_on, due_on, notes")
        .eq("user_id", userId).eq("item_kind", "replenishment").order("title", { ascending: true }),
      supabase.from("transactions")
        .select("id, account_id, amount, occurred_on, description, payment_method, categories(name), accounts(name)")
        .eq("user_id", userId).eq("kind", "income").eq("status", "posted")
        .order("occurred_on", { ascending: false }),
      supabase.from("transactions")
        .select("id, account_id, amount, occurred_on, description, payment_method, categories(name), accounts(name)")
        .eq("user_id", userId).eq("kind", "expense").eq("status", "posted")
        .order("occurred_on", { ascending: false }),
    ]);

    for (const result of [plansResult, fixedResult, budgetsResult, debtsResult, replenishmentsResult, incomesResult, expensesResult]) {
      if (result.error) throw result.error;
    }

    const plans = plansResult.data || [];
    const planIds = plans.map((plan) => plan.id);
    let installments: any[] = [];
    if (planIds.length) {
      const result = await supabase.from("installments")
        .select("id, user_id, plan_id, installment_number, amount, due_on, paid_on, status, transaction_id, notes, due_date_precision")
        .eq("user_id", userId).in("plan_id", planIds).order("installment_number", { ascending: true });
      if (result.error) throw result.error;
      installments = result.data || [];
    }

    const grouped = new Map<string, any[]>();
    for (const item of installments) {
      if (!grouped.has(item.plan_id)) grouped.set(item.plan_id, []);
      grouped.get(item.plan_id)!.push(item);
    }

    return json({
      budgets: (budgetsResult.data || []).map((row) => ({
        id: row.id,
        month: String(row.period_start).slice(0, 7),
        amount: Number(row.planned_amount || 0),
        category: row.categories?.name || "Otros",
        notes: row.notes || "",
      })),
      incomes: (incomesResult.data || []).map(transactionForUi),
      expenses: (expensesResult.data || []).map(transactionForUi),
      installmentPlans: plans.map((plan) => installmentPlanForUi(plan, grouped.get(plan.id) || [])),
      fixedPayments: (fixedResult.data || []).map(fixedPaymentForUi),
      debts: (debtsResult.data || []).map((row) => ({
        id: row.id,
        direction: row.direction,
        personName: row.person_name,
        description: row.description || "",
        originalAmount: Number(row.original_amount || 0),
        outstandingAmount: Number(row.outstanding_amount || 0),
        dueOn: row.due_on || null,
        status: row.status,
      })),
      replenishments: (replenishmentsResult.data || []).map((row) => ({
        id: row.id,
        kind: row.item_kind,
        title: row.title,
        amount: Number(row.amount || 0),
        outstandingAmount: Number(row.outstanding_amount || 0),
        status: row.status,
        beneficiary: row.beneficiary || "",
        effectiveOn: row.effective_on || null,
        dueOn: row.due_on || null,
        notes: row.notes || "",
      })),
    });
  } catch (error) {
    console.error("finance-dashboard-read failed", error);
    return json({ error: error instanceof Error ? error.message : "No se pudo leer el resumen financiero." }, 500);
  }
});
