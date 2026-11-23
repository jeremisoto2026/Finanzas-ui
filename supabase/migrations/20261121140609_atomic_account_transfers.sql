alter table public.transfers
  add column if not exists idempotency_key text;

create unique index if not exists transfers_user_idempotency_key_unique
  on public.transfers(user_id, idempotency_key)
  where idempotency_key is not null;

create or replace function public.create_account_transfer(
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_amount numeric,
  p_occurred_on date,
  p_description text default null,
  p_idempotency_key text default null
)
returns public.transfers
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_from public.accounts%rowtype;
  v_to public.accounts%rowtype;
  v_transfer public.transfers%rowtype;
  v_today date := (now() at time zone 'Europe/Madrid')::date;
  v_from_balance numeric(14,2);
  v_from_reserved numeric(14,2);
  v_from_net numeric(14,2);
  v_existing public.transfers%rowtype;
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
begin
  if v_user_id is null then raise exception 'Debes iniciar sesión para registrar una transferencia.'; end if;
  if p_from_account_id is null or p_to_account_id is null or p_from_account_id = p_to_account_id then
    raise exception 'Selecciona dos cuentas diferentes.';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 999999999999.99 then
    raise exception 'El importe debe ser mayor que cero y válido.';
  end if;
  if p_occurred_on is null or p_occurred_on > v_today then raise exception 'La fecha de la transferencia no es válida.'; end if;
  if v_key is null or length(v_key) > 200 then raise exception 'No se recibió una clave de operación válida. Vuelve a intentarlo.'; end if;

  perform pg_advisory_xact_lock(hashtextextended('transfer:' || v_user_id::text || ':' || v_key, 0));
  select * into v_existing from public.transfers where user_id = v_user_id and idempotency_key = v_key;
  if found then
    if v_existing.from_account_id <> p_from_account_id or v_existing.to_account_id <> p_to_account_id
      or v_existing.amount <> round(p_amount, 2) or v_existing.occurred_on <> p_occurred_on then
      raise exception 'La clave de esta transferencia ya se utilizó con otros datos.';
    end if;
    return v_existing;
  end if;

  if p_from_account_id < p_to_account_id then
    perform pg_advisory_xact_lock(hashtextextended(p_from_account_id::text, 0));
    perform pg_advisory_xact_lock(hashtextextended(p_to_account_id::text, 0));
  else
    perform pg_advisory_xact_lock(hashtextextended(p_to_account_id::text, 0));
    perform pg_advisory_xact_lock(hashtextextended(p_from_account_id::text, 0));
  end if;

  select * into v_from from public.accounts where id = p_from_account_id and user_id = v_user_id;
  if not found then raise exception 'La cuenta de origen no existe o no te pertenece.'; end if;
  select * into v_to from public.accounts where id = p_to_account_id and user_id = v_user_id;
  if not found then raise exception 'La cuenta de destino no existe o no te pertenece.'; end if;
  if not v_from.is_active or not v_to.is_active then raise exception 'Las dos cuentas deben estar activas.'; end if;
  if upper(btrim(v_from.currency_code)) <> upper(btrim(v_to.currency_code)) then
    raise exception 'Por ahora solo se permiten transferencias entre cuentas de la misma moneda.';
  end if;

  select coalesce(sum(case when kind in ('income', 'transfer_in') then amount
    when kind in ('expense', 'transfer_out') then -amount else 0 end), 0)
  into v_from_net
  from public.transactions
  where user_id = v_user_id and account_id = v_from.id and status = 'posted'
    and occurred_on >= v_from.opening_balance_date and occurred_on <= v_today;
  v_from_balance := v_from.opening_balance + v_from_net;

  select coalesce(sum(amount), 0) into v_from_reserved
  from public.reservations where user_id = v_user_id and account_id = v_from.id and status = 'active';
  if round(p_amount, 2) > v_from_balance - v_from_reserved then
    raise exception 'Saldo disponible insuficiente en la cuenta de origen.';
  end if;

  insert into public.transfers (user_id, from_account_id, to_account_id, amount, occurred_on, description, idempotency_key)
  values (v_user_id, v_from.id, v_to.id, round(p_amount, 2), p_occurred_on,
    coalesce(v_description, 'Transferencia entre cuentas'), v_key)
  returning * into v_transfer;

  insert into public.transactions (user_id, account_id, transfer_id, kind, status, amount, occurred_on, description)
  values
    (v_user_id, v_from.id, v_transfer.id, 'transfer_out', 'posted', round(p_amount, 2), p_occurred_on,
      coalesce(v_description, 'Transferencia a ' || v_to.name)),
    (v_user_id, v_to.id, v_transfer.id, 'transfer_in', 'posted', round(p_amount, 2), p_occurred_on,
      coalesce(v_description, 'Transferencia desde ' || v_from.name));
  return v_transfer;
end;
$$;

revoke all on function public.create_account_transfer(uuid, uuid, numeric, date, text, text) from public, anon;
grant execute on function public.create_account_transfer(uuid, uuid, numeric, date, text, text) to authenticated;
