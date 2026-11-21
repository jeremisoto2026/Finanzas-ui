create or replace function public.save_reservation(
  p_reservation_id uuid,
  p_account_id uuid,
  p_name text,
  p_amount numeric,
  p_status text,
  p_reserved_on date,
  p_notes text default null
)
returns public.reservations
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing_account_id uuid;
  v_account public.accounts%rowtype;
  v_balance numeric(14,2);
  v_movement_total numeric(14,2);
  v_reserved_total numeric(14,2);
  v_available numeric(14,2);
  v_row public.reservations%rowtype;
begin
  if v_user_id is null then
    raise exception 'Debes iniciar sesión para gestionar reservas.';
  end if;

  if p_account_id is null then
    raise exception 'Selecciona una cuenta válida.';
  end if;

  if nullif(btrim(p_name), '') is null then
    raise exception 'Escribe el concepto de la reserva.';
  end if;

  if p_amount is null or p_amount <= 0 or p_amount > 999999999999.99 then
    raise exception 'El importe debe ser mayor que cero y válido.';
  end if;

  if p_status not in ('active', 'released') then
    raise exception 'El estado de la reserva no es válido.';
  end if;

  if p_reserved_on is null then
    raise exception 'La fecha de la reserva no es válida.';
  end if;

  if p_reservation_id is not null then
    select account_id into v_existing_account_id
    from public.reservations
    where id = p_reservation_id and user_id = v_user_id;

    if not found then
      raise exception 'No se encontró esa reserva.';
    end if;
  end if;

  -- Serialize changes per account so simultaneous reservations cannot overspend.
  if v_existing_account_id is null or v_existing_account_id = p_account_id then
    perform pg_advisory_xact_lock(hashtextextended(p_account_id::text, 0));
  elsif v_existing_account_id < p_account_id then
    perform pg_advisory_xact_lock(hashtextextended(v_existing_account_id::text, 0));
    perform pg_advisory_xact_lock(hashtextextended(p_account_id::text, 0));
  else
    perform pg_advisory_xact_lock(hashtextextended(p_account_id::text, 0));
    perform pg_advisory_xact_lock(hashtextextended(v_existing_account_id::text, 0));
  end if;

  select * into v_account
  from public.accounts
  where id = p_account_id and user_id = v_user_id;

  if not found then
    raise exception 'Selecciona una cuenta válida de tu espacio financiero.';
  end if;

  if p_status = 'active' and not v_account.is_active then
    raise exception 'No puedes reservar dinero en una cuenta desactivada.';
  end if;

  select coalesce(sum(
    case
      when kind::text in ('income', 'transfer_in') then amount
      when kind::text in ('expense', 'transfer_out') then -amount
      else 0
    end
  ), 0)
  into v_movement_total
  from public.transactions
  where user_id = v_user_id
    and account_id = p_account_id
    and status::text = 'posted'
    and occurred_on >= v_account.opening_balance_date
    and occurred_on <= (now() at time zone 'Europe/Madrid')::date;

  v_balance := v_account.opening_balance + v_movement_total;

  select coalesce(sum(amount), 0)
  into v_reserved_total
  from public.reservations
  where user_id = v_user_id
    and account_id = p_account_id
    and status = 'active'
    and (p_reservation_id is null or id <> p_reservation_id);

  v_available := v_balance - v_reserved_total;

  if p_status = 'active' and p_amount > v_available then
    raise exception 'Saldo insuficiente: solo tienes % % libres en % después de las reservas activas.',
      to_char(v_available, 'FM999999999990.00'),
      btrim(v_account.currency_code),
      v_account.name;
  end if;

  if p_reservation_id is null then
    insert into public.reservations (
      user_id, account_id, name, amount, status, reserved_on, notes, updated_at
    ) values (
      v_user_id, p_account_id, btrim(p_name), round(p_amount, 2), p_status, p_reserved_on,
      nullif(btrim(coalesce(p_notes, '')), ''), now()
    )
    returning * into v_row;
  else
    update public.reservations
    set account_id = p_account_id,
        name = btrim(p_name),
        amount = round(p_amount, 2),
        status = p_status,
        reserved_on = p_reserved_on,
        notes = nullif(btrim(coalesce(p_notes, '')), ''),
        updated_at = now()
    where id = p_reservation_id and user_id = v_user_id
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

revoke all on function public.save_reservation(uuid, uuid, text, numeric, text, date, text) from public, anon;
grant execute on function public.save_reservation(uuid, uuid, text, numeric, text, date, text) to authenticated;
