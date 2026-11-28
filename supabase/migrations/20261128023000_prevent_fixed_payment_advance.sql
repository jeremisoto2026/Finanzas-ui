-- Prevent paying the next fixed-payment period in advance after the current period was registered.
-- The first occurrence may still be paid early; subsequent periods unlock on/after their due date.
create or replace function public.register_fixed_payment(
  p_fixed_payment_id uuid,
  p_account_id uuid,
  p_paid_on date,
  p_period_key date
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_payment public.fixed_payments%rowtype;
  v_existing public.fixed_payment_records%rowtype;
  v_transaction_id uuid;
  v_next_due date;
begin
  if v_user_id is null then raise exception 'Sesión no válida.' using errcode = '28000'; end if;
  if p_paid_on is null or p_period_key is null or p_account_id is null then
    raise exception 'Selecciona la cuenta y la fecha real del pago.';
  end if;
  select * into v_payment from public.fixed_payments
    where id = p_fixed_payment_id and user_id = v_user_id and status = 'active'
    for update;
  if not found then raise exception 'No se encontró el pago fijo activo.' using errcode = 'P0002'; end if;

  select * into v_existing from public.fixed_payment_records
    where fixed_payment_id = p_fixed_payment_id and period_key = p_period_key;
  if found then
    return jsonb_build_object('alreadyRecorded', true, 'transactionId', v_existing.transaction_id,
      'periodKey', v_existing.period_key, 'paidOn', v_existing.paid_on);
  end if;

  if v_payment.next_due_on is null or v_payment.next_due_on <> p_period_key then
    raise exception 'El periodo seleccionado ya no es el siguiente vencimiento. Actualiza la pantalla.';
  end if;

  -- Once a payment has been recorded, do not allow the following period to be paid
  -- before its due date. This closes the loophole caused by advancing next_due_on
  -- immediately after an early payment.
  if p_period_key > current_date and exists (
    select 1 from public.fixed_payment_records
    where fixed_payment_id = p_fixed_payment_id and user_id = v_user_id
  ) then
    raise exception 'Este periodo todavía no está disponible. Ya registraste el pago anterior; podrás marcar el siguiente cuando llegue su fecha de vencimiento.';
  end if;

  if not exists (select 1 from public.accounts where id = p_account_id and user_id = v_user_id and is_active) then
    raise exception 'La cuenta seleccionada no existe o está inactiva.';
  end if;

  insert into public.transactions(user_id, account_id, category_id, kind, status, amount,
    occurred_on, description, counterparty, notes, payment_method, idempotency_key)
  values (v_user_id, p_account_id, v_payment.category_id, 'expense', 'posted', v_payment.amount,
    p_paid_on, v_payment.name, v_payment.name, 'Pago fijo · periodo ' || p_period_key::text,
    v_payment.payment_method, 'fixed-payment:' || p_fixed_payment_id::text || ':' || p_period_key::text)
  returning id into v_transaction_id;

  insert into public.fixed_payment_records(user_id, fixed_payment_id, period_key, due_on,
    paid_on, amount, account_id, transaction_id)
  values (v_user_id, p_fixed_payment_id, p_period_key, p_period_key, p_paid_on,
    v_payment.amount, p_account_id, v_transaction_id);

  v_next_due := case v_payment.frequency
    when 'weekly' then (p_period_key + interval '7 days')::date
    when 'biweekly' then (p_period_key + interval '14 days')::date
    when 'monthly' then (p_period_key + interval '1 month')::date
    when 'quarterly' then (p_period_key + interval '3 months')::date
    when 'yearly' then (p_period_key + interval '1 year')::date
    else p_period_key
  end;
  update public.fixed_payments set next_due_on = v_next_due, updated_at = now()
    where id = p_fixed_payment_id and user_id = v_user_id;
  return jsonb_build_object('alreadyRecorded', false, 'transactionId', v_transaction_id,
    'periodKey', p_period_key, 'paidOn', p_paid_on, 'nextDueOn', v_next_due);
exception
  when unique_violation then
    select * into v_existing from public.fixed_payment_records
      where fixed_payment_id = p_fixed_payment_id and period_key = p_period_key;
    if found then return jsonb_build_object('alreadyRecorded', true,
      'transactionId', v_existing.transaction_id, 'periodKey', v_existing.period_key,
      'paidOn', v_existing.paid_on); end if;
    raise;
end;
$$;
