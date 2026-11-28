-- Fixed payment periods and atomic ledger registration (Preview).
create table if not exists public.fixed_payment_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fixed_payment_id uuid not null,
  period_key date not null,
  due_on date not null,
  paid_on date not null,
  amount numeric(14,2) not null check (amount > 0),
  account_id uuid not null,
  transaction_id uuid not null,
  created_at timestamptz not null default now(),
  unique (fixed_payment_id, period_key),
  unique (transaction_id),
  foreign key (fixed_payment_id, user_id) references public.fixed_payments(id, user_id) on delete restrict,
  foreign key (account_id, user_id) references public.accounts(id, user_id) on delete restrict,
  foreign key (transaction_id, user_id) references public.transactions(id, user_id) on delete restrict
);
alter table public.fixed_payment_records enable row level security;
create policy fixed_payment_records_select_own on public.fixed_payment_records
  for select to authenticated using ((select auth.uid()) = user_id);
create policy fixed_payment_records_insert_own on public.fixed_payment_records
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy fixed_payment_records_update_own on public.fixed_payment_records
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy fixed_payment_records_delete_own on public.fixed_payment_records
  for delete to authenticated using ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.fixed_payment_records to authenticated;

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
grant execute on function public.register_fixed_payment(uuid, uuid, date, date) to authenticated;
