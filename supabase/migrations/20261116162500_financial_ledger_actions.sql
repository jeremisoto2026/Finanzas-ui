-- Atomic, account-aware ledger actions for installments, debts and replenishments.
-- All functions execute as the authenticated caller and rely on table RLS.
create or replace function public.register_installment_payment(
  p_installment_id uuid,
  p_account_id uuid,
  p_paid_on date,
  p_existing_transaction_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_installment public.installments%rowtype;
  v_plan public.installment_plans%rowtype;
  v_account public.accounts%rowtype;
  v_transaction public.transactions%rowtype;
  v_transaction_id uuid;
  v_paid_on date;
begin
  if v_user_id is null then raise exception 'Debes iniciar sesión para registrar el pago.'; end if;

  select * into v_installment from public.installments
  where id = p_installment_id and user_id = v_user_id for update;
  if not found then raise exception 'No se encontró la cuota seleccionada.'; end if;

  select * into v_plan from public.installment_plans
  where id = v_installment.plan_id and user_id = v_user_id;
  if not found or v_plan.status = 'cancelled' then raise exception 'La compra a cuotas no está disponible.'; end if;

  if v_installment.transaction_id is not null then
    return jsonb_build_object('success', true, 'alreadyRecorded', true, 'transactionId', v_installment.transaction_id, 'installmentId', v_installment.id);
  end if;
  if v_installment.status not in ('scheduled', 'paid') then
    raise exception 'Solo se pueden registrar cuotas pendientes o pagadas sin movimiento.';
  end if;

  if p_existing_transaction_id is not null then
    select * into v_transaction from public.transactions
    where id = p_existing_transaction_id and user_id = v_user_id
      and kind = 'expense' and status = 'posted' and amount = v_installment.amount;
    if not found then
      raise exception 'El gasto seleccionado no existe, no está contabilizado o no coincide con el importe de la cuota.';
    end if;
    if exists (select 1 from public.installments where user_id = v_user_id and transaction_id = p_existing_transaction_id and id <> v_installment.id) then
      raise exception 'Ese movimiento ya está vinculado a otra cuota.';
    end if;
    v_transaction_id := v_transaction.id;
    v_paid_on := v_transaction.occurred_on;
  else
    if p_account_id is null then raise exception 'Selecciona la cuenta desde la que se pagó la cuota.'; end if;
    select * into v_account from public.accounts
    where id = p_account_id and user_id = v_user_id and is_active = true;
    if not found then raise exception 'La cuenta seleccionada no está disponible.'; end if;
    if v_account.currency_code <> 'EUR' then raise exception 'La cuenta debe estar en euros para registrar esta cuota.'; end if;
    if p_paid_on is null then raise exception 'Indica la fecha real del pago.'; end if;

    insert into public.transactions (
      user_id, account_id, category_id, kind, status, amount,
      occurred_on, description, payment_method, external_source,
      external_reference, idempotency_key
    ) values (
      v_user_id, v_account.id, v_plan.category_id, 'expense', 'posted',
      v_installment.amount, p_paid_on,
      v_plan.name || ' · Cuota ' || v_installment.installment_number || '/' || v_plan.installments_total,
      v_plan.payment_method, 'installment', v_installment.id::text,
      'installment:' || v_installment.id::text
    ) returning id into v_transaction_id;
    v_paid_on := p_paid_on;
  end if;

  update public.installments set transaction_id = v_transaction_id, status = 'paid',
    paid_on = coalesce(v_paid_on, paid_on), updated_at = now()
  where id = v_installment.id and user_id = v_user_id;

  if not exists (
    select 1 from public.installments where plan_id = v_installment.plan_id
      and user_id = v_user_id and status <> 'paid' and status <> 'cancelled'
  ) then
    update public.installment_plans set status = 'completed', updated_at = now()
    where id = v_installment.plan_id and user_id = v_user_id;
  end if;

  return jsonb_build_object('success', true, 'alreadyRecorded', false, 'transactionId', v_transaction_id, 'installmentId', v_installment.id);
end;
$$;

create or replace function public.register_debt_settlement(
  p_debt_id uuid, p_account_id uuid, p_amount numeric, p_occurred_on date,
  p_idempotency_key text, p_category_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_debt public.debts%rowtype;
  v_account public.accounts%rowtype;
  v_existing public.transactions%rowtype;
  v_transaction_id uuid;
  v_remaining numeric(14,2);
  v_kind public.transaction_kind;
  v_status text;
  v_description text;
begin
  if v_user_id is null then raise exception 'Debes iniciar sesión.'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 then raise exception 'No se pudo validar la operación. Vuelve a intentarlo.'; end if;

  select * into v_debt from public.debts where id = p_debt_id and user_id = v_user_id for update;
  if not found then raise exception 'No se encontró la deuda seleccionada.'; end if;

  select * into v_existing from public.transactions
  where user_id = v_user_id and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.external_source <> 'debt_settlement' then raise exception 'La referencia de esta operación ya está utilizada.'; end if;
    return jsonb_build_object('success', true, 'alreadyRecorded', true, 'transactionId', v_existing.id,
      'outstandingAmount', v_debt.outstanding_amount, 'status', v_debt.status);
  end if;

  if v_debt.status in ('settled', 'written_off') or v_debt.outstanding_amount <= 0 then raise exception 'Esta deuda ya está saldada.'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > v_debt.outstanding_amount then raise exception 'El importe debe ser mayor que cero y no superar el saldo pendiente.'; end if;
  if p_occurred_on is null then raise exception 'Indica la fecha del movimiento.'; end if;

  select * into v_account from public.accounts
  where id = p_account_id and user_id = v_user_id and is_active = true;
  if not found then raise exception 'La cuenta seleccionada no está disponible.'; end if;
  if v_account.currency_code <> 'EUR' then raise exception 'La cuenta debe estar en euros para registrar esta deuda.'; end if;

  if p_category_id is not null and not exists (
    select 1 from public.categories where id = p_category_id and user_id = v_user_id
      and direction in (case when v_debt.direction = 'receivable' then 'income' else 'expense' end, 'both')
  ) then raise exception 'La categoría seleccionada no es válida.'; end if;

  v_kind := case when v_debt.direction = 'receivable' then 'income'::public.transaction_kind else 'expense'::public.transaction_kind end;
  v_description := case when v_debt.direction = 'receivable' then 'Cobro de deuda: ' else 'Pago de deuda: ' end || v_debt.person_name;

  insert into public.transactions (
    user_id, account_id, category_id, kind, status, amount, occurred_on,
    description, counterparty, external_source, external_reference, idempotency_key
  ) values (
    v_user_id, v_account.id, p_category_id, v_kind, 'posted', round(p_amount, 2),
    p_occurred_on, v_description, v_debt.person_name, 'debt_settlement',
    p_idempotency_key, p_idempotency_key
  ) returning id into v_transaction_id;

  v_remaining := round(v_debt.outstanding_amount - p_amount, 2);
  v_status := case when v_remaining = 0 then 'settled'
    when v_remaining < v_debt.original_amount then 'partially_settled' else 'open' end;

  update public.debts set outstanding_amount = v_remaining, status = v_status, updated_at = now()
  where id = v_debt.id and user_id = v_user_id;

  return jsonb_build_object('success', true, 'alreadyRecorded', false, 'transactionId', v_transaction_id,
    'outstandingAmount', v_remaining, 'status', v_status);
end;
$$;

create or replace function public.register_replenishment(
  p_item_id uuid, p_account_id uuid, p_amount numeric, p_occurred_on date,
  p_idempotency_key text, p_category_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_item public.financial_items%rowtype;
  v_account public.accounts%rowtype;
  v_existing public.transactions%rowtype;
  v_transaction_id uuid;
  v_remaining numeric(14,2);
  v_status text;
begin
  if v_user_id is null then raise exception 'Debes iniciar sesión.'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 then raise exception 'No se pudo validar la operación. Vuelve a intentarlo.'; end if;

  select * into v_item from public.financial_items
  where id = p_item_id and user_id = v_user_id and item_kind = 'replenishment' for update;
  if not found then raise exception 'No se encontró la reposición seleccionada.'; end if;

  select * into v_existing from public.transactions
  where user_id = v_user_id and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.external_source <> 'replenishment' then raise exception 'La referencia de esta operación ya está utilizada.'; end if;
    return jsonb_build_object('success', true, 'alreadyRecorded', true, 'transactionId', v_existing.id,
      'outstandingAmount', v_item.outstanding_amount, 'status', v_item.status);
  end if;

  if v_item.status = 'settled' or v_item.outstanding_amount <= 0 then raise exception 'Esta reposición ya está completada.'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > v_item.outstanding_amount then raise exception 'El importe debe ser mayor que cero y no superar lo pendiente de reponer.'; end if;
  if p_occurred_on is null then raise exception 'Indica la fecha de la reposición.'; end if;

  select * into v_account from public.accounts
  where id = p_account_id and user_id = v_user_id and is_active = true;
  if not found then raise exception 'La cuenta seleccionada no está disponible.'; end if;
  if v_account.currency_code <> 'EUR' then raise exception 'La cuenta debe estar en euros para registrar esta reposición.'; end if;

  if p_category_id is not null and not exists (
    select 1 from public.categories where id = p_category_id and user_id = v_user_id and direction in ('income', 'both')
  ) then raise exception 'La categoría seleccionada no es válida.'; end if;

  insert into public.transactions (
    user_id, account_id, category_id, kind, status, amount, occurred_on,
    description, counterparty, external_source, external_reference, idempotency_key
  ) values (
    v_user_id, v_account.id, p_category_id, 'income', 'posted', round(p_amount, 2),
    p_occurred_on, 'Reposición: ' || v_item.title, v_item.beneficiary,
    'replenishment', p_idempotency_key, p_idempotency_key
  ) returning id into v_transaction_id;

  v_remaining := round(v_item.outstanding_amount - p_amount, 2);
  v_status := case when v_remaining = 0 then 'settled'
    when v_remaining < v_item.amount then 'partially_settled' else 'open' end;

  update public.financial_items set outstanding_amount = v_remaining, status = v_status, updated_at = now()
  where id = v_item.id and user_id = v_user_id;

  return jsonb_build_object('success', true, 'alreadyRecorded', false, 'transactionId', v_transaction_id,
    'outstandingAmount', v_remaining, 'status', v_status);
end;
$$;

revoke all on function public.register_installment_payment(uuid, uuid, date, uuid) from public, anon;
revoke all on function public.register_debt_settlement(uuid, uuid, numeric, date, text, uuid) from public, anon;
revoke all on function public.register_replenishment(uuid, uuid, numeric, date, text, uuid) from public, anon;
grant execute on function public.register_installment_payment(uuid, uuid, date, uuid) to authenticated;
grant execute on function public.register_debt_settlement(uuid, uuid, numeric, date, text, uuid) to authenticated;
grant execute on function public.register_replenishment(uuid, uuid, numeric, date, text, uuid) to authenticated;
