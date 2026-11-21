create or replace function public.cancel_account_transfer(p_transfer_id uuid)
returns public.transfers
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_transfer public.transfers%rowtype;
  v_count integer;
begin
  if v_user_id is null then raise exception 'Debes iniciar sesión.'; end if;
  select * into v_transfer from public.transfers where id = p_transfer_id and user_id = v_user_id for update;
  if not found then raise exception 'No se encontró la transferencia.'; end if;
  update public.transactions set status = 'void', updated_at = now()
    where transfer_id = v_transfer.id and user_id = v_user_id and status = 'posted';
  get diagnostics v_count = row_count;
  if v_count <> 2 then raise exception 'La transferencia no tiene sus dos movimientos contabilizados; no se puede anular automáticamente.'; end if;
  return v_transfer;
end;
$$;
revoke all on function public.cancel_account_transfer(uuid) from public, anon;
grant execute on function public.cancel_account_transfer(uuid) to authenticated;