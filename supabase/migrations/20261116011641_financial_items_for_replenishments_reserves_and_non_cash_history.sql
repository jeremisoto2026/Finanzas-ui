create table if not exists public.financial_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_kind text not null,
  title text not null,
  amount numeric(14,2) not null check (amount > 0),
  outstanding_amount numeric(14,2) not null check (outstanding_amount >= 0 and outstanding_amount <= amount),
  status text not null,
  effective_on date,
  due_on date,
  beneficiary text,
  notes text,
  external_source text,
  external_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_items_kind_check
    check (item_kind = any (array['replenishment','reserve','planned_extra','historical_expense'])),
  constraint financial_items_status_check
    check (
      (item_kind = 'replenishment' and status = any (array['open','partially_settled','settled'])) or
      (item_kind = 'reserve' and status = any (array['reserved','released','settled'])) or
      (item_kind = 'planned_extra' and status = any (array['open','settled','released'])) or
      (item_kind = 'historical_expense' and status = 'recorded')
    )
);

create unique index if not exists financial_items_external_reference_unique
  on public.financial_items(user_id, external_source, external_reference)
  where external_source is not null and external_reference is not null;

create index if not exists financial_items_user_status_idx
  on public.financial_items(user_id, item_kind, status);

alter table public.financial_items enable row level security;

drop policy if exists financial_items_select_own on public.financial_items;
create policy financial_items_select_own
  on public.financial_items for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists financial_items_insert_own on public.financial_items;
create policy financial_items_insert_own
  on public.financial_items for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists financial_items_update_own on public.financial_items;
create policy financial_items_update_own
  on public.financial_items for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists financial_items_delete_own on public.financial_items;
create policy financial_items_delete_own
  on public.financial_items for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.financial_items from anon, public;
grant select, insert, update, delete on table public.financial_items to authenticated;
