-- Per-user mapping between a supported bank notification source/card and an account.
-- Additive only: does not rewrite transactions, account balances, or existing capture history.

begin;

create table if not exists public.account_notification_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null,
  source_app text not null check (source_app in ('revolut', 'bbva')),
  card_last4 char(4) check (card_last4 is null or card_last4 ~ '^[0-9]{4}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  constraint account_notification_sources_user_source_card_key
    unique nulls not distinct (user_id, source_app, card_last4),
  foreign key (account_id, user_id)
    references public.accounts(id, user_id) on delete restrict
);

create index if not exists account_notification_sources_lookup_idx
  on public.account_notification_sources(user_id, source_app, is_active);

alter table public.account_notification_sources enable row level security;

drop policy if exists account_notification_sources_owner_all
  on public.account_notification_sources;

create policy account_notification_sources_owner_all
  on public.account_notification_sources
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.accounts a
      where a.id = account_id
        and a.user_id = (select auth.uid())
    )
  );

grant select, insert, update, delete
  on public.account_notification_sources to authenticated;

revoke all
  on public.account_notification_sources from anon, public;

alter table public.notification_capture_events
  add column if not exists account_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'notification_capture_events_account_owner_fkey'
      and conrelid = 'public.notification_capture_events'::regclass
  ) then
    alter table public.notification_capture_events
      add constraint notification_capture_events_account_owner_fkey
      foreign key (account_id, user_id)
      references public.accounts(id, user_id)
      on delete restrict;
  end if;
end
$$;

create index if not exists notification_capture_events_user_account_idx
  on public.notification_capture_events(user_id, account_id)
  where account_id is not null;

comment on table public.account_notification_sources is
  'User-owned links from a supported bank notification source and optional bank-card suffix to one of the user own accounts.';

comment on column public.account_notification_sources.card_last4 is
  'Last four digits as shown by the BANK app notification, not the Google Wallet virtual card number.';

notify pgrst, 'reload schema';

commit;
