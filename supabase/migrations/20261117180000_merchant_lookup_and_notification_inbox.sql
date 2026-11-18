-- Additive infrastructure for merchant categorization and Android notification capture.
-- This migration is intentionally NOT applied to the active database during Preview preparation.
-- It does not update, delete, or rewrite any existing financial movement.

create table if not exists public.merchant_category_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  merchant_key text not null check (length(merchant_key) between 2 and 120),
  merchant_name text not null check (length(merchant_name) between 2 and 160),
  category_id uuid not null,
  source text not null default 'user' check (source in ('user', 'osm')),
  confidence numeric(4,3) not null default 1.000 check (confidence >= 0 and confidence <= 1),
  osm_type text,
  osm_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, merchant_key),
  foreign key (category_id, user_id)
    references public.categories(id, user_id) on delete restrict
);

create table if not exists public.merchant_lookup_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  merchant_key text not null check (length(merchant_key) between 2 and 120),
  query_name text not null,
  results jsonb not null default '[]'::jsonb,
  provider text not null default 'openstreetmap-nominatim',
  cached_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  unique (user_id, merchant_key)
);

create table public.notification_capture_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_app text not null check (source_app in ('revolut', 'google_wallet')),
  package_name text not null check (length(package_name) between 3 and 180),
  fingerprint text not null check (length(fingerprint) between 16 and 128),
  notification_title text not null check (length(notification_title) <= 500),
  notification_text text not null check (length(notification_text) <= 2000),
  occurred_at timestamptz not null,
  status text not null default 'received'
    check (status in ('received', 'needs_review', 'paired', 'ignored', 'posted')),
  pair_key text,
  parsed_merchant text,
  parsed_amount numeric(14,2) check (parsed_amount is null or parsed_amount > 0),
  currency_code char(3) not null default 'EUR',
  category_id uuid,
  account_label text,
  payment_channel text check (payment_channel in ('revolut', 'google_wallet')),
  card_last4 char(4) check (card_last4 is null or card_last4 ~ '^[0-9]{4}$'),
  matched_transaction_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source_app, fingerprint),
  foreign key (category_id, user_id)
    references public.categories(id, user_id) on delete restrict,
  foreign key (matched_transaction_id, user_id)
    references public.transactions(id, user_id) on delete restrict
);

create index if not exists merchant_category_rules_user_idx
  on public.merchant_category_rules(user_id, merchant_key);
create index if not exists merchant_lookup_cache_user_expiry_idx
  on public.merchant_lookup_cache(user_id, expires_at);
create index if not exists notification_capture_events_user_time_idx
  on public.notification_capture_events(user_id, occurred_at desc);
create index if not exists notification_capture_events_pair_idx
  on public.notification_capture_events(user_id, pair_key)
  where pair_key is not null;
create index if not exists notification_capture_events_pair_search_idx
  on public.notification_capture_events(user_id, source_app, currency_code, parsed_amount, occurred_at desc)
  where status = 'needs_review' and parsed_merchant is not null;

alter table public.merchant_category_rules enable row level security;
alter table public.merchant_lookup_cache enable row level security;
alter table public.notification_capture_events enable row level security;

create policy merchant_category_rules_owner_all
  on public.merchant_category_rules for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy merchant_lookup_cache_owner_all
  on public.merchant_lookup_cache for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy notification_capture_events_owner_all
  on public.notification_capture_events for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete
  on public.merchant_category_rules, public.merchant_lookup_cache, public.notification_capture_events
  to authenticated;

revoke all
  on public.merchant_category_rules, public.merchant_lookup_cache, public.notification_capture_events
  from anon, public;
