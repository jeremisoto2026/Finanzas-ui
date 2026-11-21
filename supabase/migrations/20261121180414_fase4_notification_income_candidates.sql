-- Isolated, owner-scoped inbox for possible bank income notifications.
-- Candidate rows are never posted as transactions by the sync function.
create table if not exists public.notification_income_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_app text not null check (length(source_app) between 2 and 180),
  source_label text not null check (length(source_label) between 2 and 100),
  fingerprint text not null check (length(fingerprint) between 16 and 128),
  amount numeric(14,2) check (amount is null or amount > 0),
  currency_code char(3) not null default 'EUR' check (currency_code = 'EUR'),
  occurred_at timestamptz not null,
  reason text not null check (length(reason) between 2 and 240),
  status text not null default 'needs_review'
    check (status in ('needs_review', 'posted', 'ignored')),
  account_id uuid,
  matched_transaction_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, fingerprint),
  foreign key (account_id, user_id)
    references public.accounts(id, user_id) on delete restrict,
  foreign key (matched_transaction_id, user_id)
    references public.transactions(id, user_id) on delete restrict
);

create index if not exists notification_income_candidates_user_time_idx
  on public.notification_income_candidates(user_id, occurred_at desc);

alter table public.notification_income_candidates enable row level security;

create policy notification_income_candidates_owner_all
  on public.notification_income_candidates for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete
  on public.notification_income_candidates to authenticated;
revoke all on public.notification_income_candidates from anon, public;
