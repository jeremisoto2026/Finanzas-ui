-- Record the initial cash outflow when a receivable (money lent) is created.
alter table public.debts
  add column if not exists account_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'debts_account_id_user_id_fkey'
      and conrelid = 'public.debts'::regclass
  ) then
    alter table public.debts
      add constraint debts_account_id_user_id_fkey
      foreign key (account_id, user_id)
      references public.accounts(id, user_id)
      on delete restrict;
  end if;
end $$;

create or replace function public.register_debt_creation(
  p_direction text,
  p_person_name text,
  p_description text,
  p_original_amount numeric,
  p_outstanding_amount numeric,
  p_due_on date,
  p_account_id uuid,
  p_occurred_on date,
  p_idempotency_key text,
  p_category_id uuid default null
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
  v_transaction_id uuid;
  v_status text;
begin
  if v_user_id is null then raise exception 'Debes iniciar sesión.'; end if;
  if p_direction not in ('receivable', 'payable') then raise exception 'Tipo de deuda no válido.'; end if;
  if p_person_name is null or length(trim(p_person_name)) = 0 then raise exception 'Indica una persona.'; end if;
  if p_original_amount is null or p_original_amount <= 0 then raise exception 'El importe original debe ser mayor que cero.'; end if;
  if p_outstanding_amount is null or p_outstanding_amount < 0 or p_outstanding_amount > p_original_amount then raise exception 'El saldo pendiente no es válido.'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 then raise exception 'No se pudo validar la operación. Vuelve a intentarlo.'; end if;

  if p_direction = 'receivable' then
    if p_account_id is null then raise exception 'Selecciona la cuenta desde la que prestaste el dinero.'; end if;
    if p_occurred_on is null then raise exception 'Indica la fecha en que prestaste el dinero.'; end if;
    select * into v_account from public.accounts
      where id = p_account_id and user_id = v_user_id and is_active = true for update;
    if not found then raise exception 'La cuenta seleccionada no está disponible.'; end if;
    if v_account.currency_code <> 'EUR' then raise exception 'La cuenta debe estar en euros para registrar este préstamo.'; end if;
    if p_category_id is not null and not exists (
      select 1 from public.categories where id = p_category_id and user_id = v_user_id
        and direction in ('expense', 'both')
    ) then raise exception 'La categoría seleccionada no es válida.'; end if;

    select d.* into v_debt from public.debts d
      join public.transactions t on t.external_source = 'debt_creation'
        and t.external_reference = d.id::text
      where t.user_id = v_user_id and t.idempotency_key = p_idempotency_key
        and d.user_id = v_user_id;
    if found then
      select id into v_transaction_id from public.transactions
        where user_id = v_user_id and idempotency_key = p_idempotency_key;
      return jsonb_build_object('success', true, 'alreadyRecorded', true,
        'debtId', v_debt.id, 'transactionId', v_transaction_id);
    end if;
  end if;

  v_status := case when p_outstanding_amount = 0 then 'settled'
    when p_outstanding_amount < p_original_amount then 'partially_settled' else 'open' end;

  insert into public.debts (
    user_id, direction, person_name, description, original_amount,
    outstanding_amount, due_on, status, account_id
  ) values (
    v_user_id, p_direction, trim(p_person_name), nullif(trim(coalesce(p_description, '')), ''),
    round(p_original_amount, 2), round(p_outstanding_amount, 2), p_due_on, v_status,
    case when p_direction = 'receivable' then p_account_id else null end
  ) returning * into v_debt;

  if p_direction = 'receivable' then
    insert into public.transactions (
      user_id, account_id, category_id, kind, status, amount, occurred_on,
      description, counterparty, external_source, external_reference, idempotency_key
    ) values (
      v_user_id, v_account.id, p_category_id, 'expense', 'posted',
      round(p_original_amount, 2), p_occurred_on,
      'Préstamo a ' || trim(p_person_name), trim(p_person_name),
      'debt_creation', v_debt.id::text, p_idempotency_key
    ) returning id into v_transaction_id;
  end if;

  return jsonb_build_object('success', true, 'alreadyRecorded', false,
    'debtId', v_debt.id, 'transactionId', v_transaction_id);
end;
$$;

revoke all on function public.register_debt_creation(text, text, text, numeric, numeric, date, uuid, date, text, uuid) from public, anon;
grant execute on function public.register_debt_creation(text, text, text, numeric, numeric, date, uuid, date, text, uuid) to authenticated;
