-- Finanzas-ui: PostgreSQL ledger foundation.
-- Review this migration and apply it only to a new or verified Supabase project.
-- Notion remains the legacy source until the data is reconciled.

create extension if not exists pgcrypto;

create type public.transaction_kind as enum ('income', 'expense', 'transfer_in', 'transfer_out');
create type public.transaction_status as enum ('pending', 'posted', 'void');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  currency_code char(3) not null default 'EUR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  institution text,
  currency_code char(3) not null default 'EUR',
  opening_balance numeric(14,2) not null default 0,
  opening_balance_date date not null default current_date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, name)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  direction text not null default 'both' check (direction in ('income', 'expense', 'both')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, name)
);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null,
  fingerprint text not null,
  filename text,
  imported_at timestamptz not null default now(),
  row_count integer not null default 0 check (row_count >= 0),
  unique (id, user_id),
  unique (user_id, fingerprint)
);

create table public.transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  from_account_id uuid not null,
  to_account_id uuid not null,
  amount numeric(14,2) not null check (amount > 0),
  occurred_on date not null,
  description text,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  check (from_account_id <> to_account_id),
  foreign key (from_account_id, user_id) references public.accounts(id, user_id) on delete restrict,
  foreign key (to_account_id, user_id) references public.accounts(id, user_id) on delete restrict
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null,
  category_id uuid,
  import_batch_id uuid,
  transfer_id uuid,
  kind public.transaction_kind not null,
  status public.transaction_status not null default 'posted',
  amount numeric(14,2) not null check (amount > 0),
  occurred_on date not null,
  description text not null,
  counterparty text,
  notes text,
  external_source text,
  external_reference text,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (account_id, user_id) references public.accounts(id, user_id) on delete restrict,
  foreign key (category_id, user_id) references public.categories(id, user_id) on delete restrict,
  foreign key (import_batch_id, user_id) references public.import_batches(id, user_id) on delete restrict,
  foreign key (transfer_id, user_id) references public.transfers(id, user_id) on delete restrict,
  check (
    (kind in ('transfer_in', 'transfer_out') and transfer_id is not null)
    or (kind not in ('transfer_in', 'transfer_out') and transfer_id is null)
  )
);

create unique index transactions_external_reference_unique
  on public.transactions(user_id, external_source, external_reference)
  where external_source is not null and external_reference is not null;

create unique index transactions_idempotency_key_unique
  on public.transactions(user_id, idempotency_key)
  where idempotency_key is not null;

create unique index transactions_transfer_direction_unique
  on public.transactions(user_id, transfer_id, kind)
  where transfer_id is not null;

create table public.fixed_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid,
  category_id uuid,
  name text not null,
  amount numeric(14,2) not null check (amount > 0),
  currency_code char(3) not null default 'EUR',
  frequency text not null check (frequency in ('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly', 'custom')),
  next_due_on date,
  status text not null default 'active' check (status in ('active', 'paused', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (account_id, user_id) references public.accounts(id, user_id) on delete restrict,
  foreign key (category_id, user_id) references public.categories(id, user_id) on delete restrict
);

create table public.installment_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  total_amount numeric(14,2) not null check (total_amount > 0),
  installments_total integer not null check (installments_total > 0),
  start_on date not null,
  frequency text not null default 'monthly' check (frequency in ('weekly', 'biweekly', 'monthly', 'quarterly')),
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.installments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null,
  transaction_id uuid,
  installment_number integer not null check (installment_number > 0),
  amount numeric(14,2) not null check (amount > 0),
  due_on date not null,
  paid_on date,
  status text not null default 'scheduled' check (status in ('scheduled', 'paid', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (plan_id, user_id) references public.installment_plans(id, user_id) on delete cascade,
  foreign key (transaction_id, user_id) references public.transactions(id, user_id) on delete restrict,
  unique (plan_id, installment_number)
);

create table public.debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  direction text not null check (direction in ('receivable', 'payable')),
  person_name text not null,
  description text,
  original_amount numeric(14,2) not null check (original_amount > 0),
  outstanding_amount numeric(14,2) not null check (outstanding_amount >= 0 and outstanding_amount <= original_amount),
  due_on date,
  status text not null default 'open' check (status in ('open', 'partially_settled', 'settled', 'written_off')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid,
  name text not null,
  amount numeric(14,2) not null check (amount > 0),
  status text not null default 'active' check (status in ('active', 'released', 'consumed')),
  reserved_on date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (account_id, user_id) references public.accounts(id, user_id) on delete restrict
);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null,
  period_start date not null,
  planned_amount numeric(14,2) not null check (planned_amount >= 0),
  notes text,
  created_at timestamptz not null default now(),
  foreign key (category_id, user_id) references public.categories(id, user_id) on delete restrict,
  unique (user_id, category_id, period_start),
  check (date_trunc('month', period_start)::date = period_start)
);

create table public.monthly_closings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  opening_balance numeric(14,2) not null,
  income_total numeric(14,2) not null default 0,
  expense_total numeric(14,2) not null default 0,
  closing_balance numeric(14,2) not null,
  closed_at timestamptz not null default now(),
  unique (user_id, period_start),
  check (date_trunc('month', period_start)::date = period_start)
);

-- The view counts posted income/expenses and paired transfers only.
create or replace view public.account_balances
with (security_invoker = true)
as
select
  a.id as account_id,
  a.user_id,
  a.name as account_name,
  a.currency_code,
  a.opening_balance + coalesce(sum(
    case
      when t.kind in ('income', 'transfer_in') then t.amount
      when t.kind in ('expense', 'transfer_out') then -t.amount
      else 0
    end
  ), 0) as current_balance
from public.accounts a
left join public.transactions t
  on t.account_id = a.id and t.user_id = a.user_id and t.status = 'posted'
group by a.id, a.user_id, a.name, a.currency_code, a.opening_balance;

alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.import_batches enable row level security;
alter table public.transfers enable row level security;
alter table public.transactions enable row level security;
alter table public.fixed_payments enable row level security;
alter table public.installment_plans enable row level security;
alter table public.installments enable row level security;
alter table public.debts enable row level security;
alter table public.reservations enable row level security;
alter table public.budgets enable row level security;
alter table public.monthly_closings enable row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'accounts', 'categories', 'import_batches', 'transfers', 'transactions',
    'fixed_payments', 'installment_plans', 'installments', 'debts',
    'reservations', 'budgets', 'monthly_closings'
  ]
  loop
    execute format('create policy %I on public.%I for select to authenticated using (user_id = auth.uid())', table_name || '_select_own', table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = auth.uid())', table_name || '_insert_own', table_name);
    execute format('create policy %I on public.%I for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', table_name || '_update_own', table_name);
    execute format('create policy %I on public.%I for delete to authenticated using (user_id = auth.uid())', table_name || '_delete_own', table_name);
  end loop;
end $$;

grant select, insert, update, delete on
  public.profiles, public.accounts, public.categories, public.import_batches, public.transfers,
  public.transactions, public.fixed_payments, public.installment_plans, public.installments,
  public.debts, public.reservations, public.budgets, public.monthly_closings
to authenticated;
grant select on public.account_balances to authenticated;
