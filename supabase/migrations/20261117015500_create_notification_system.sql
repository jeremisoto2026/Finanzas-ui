-- Finanzas-ui: real payment reminders and Web Push subscriptions.
-- Apply to the isolated Supabase preview branch first.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net;

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  fixed_payments_enabled boolean not null default true,
  installments_enabled boolean not null default true,
  reminder_days_before smallint not null default 3 check (reminder_days_before in (1, 2, 3, 5, 7)),
  reminder_hour smallint not null default 9 check (reminder_hour between 0 and 23),
  same_day_enabled boolean not null default false,
  timezone text not null default 'Europe/Madrid',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device_label text not null default 'Este dispositivo',
  expiration_time timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reminder_key text not null,
  source_type text not null check (source_type in ('fixed_payment', 'installment')),
  source_id uuid not null,
  title text not null,
  body text not null,
  due_on date not null,
  amount numeric(14,2),
  currency_code char(3) not null default 'EUR',
  push_status text not null default 'pending' check (push_status in ('pending', 'sent', 'failed')),
  last_error text,
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, reminder_key)
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions(user_id);
create index if not exists notifications_user_created_idx
  on public.notifications(user_id, created_at desc);
create index if not exists notifications_pending_idx
  on public.notifications(push_status, created_at)
  where push_status in ('pending', 'failed');
create index if not exists fixed_payments_due_reminders_idx
  on public.fixed_payments(user_id, next_due_on)
  where status = 'active' and notification_enabled = true;
create index if not exists installments_due_reminders_idx
  on public.installments(user_id, due_on)
  where status = 'scheduled';

alter table public.notification_preferences enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notifications enable row level security;

drop policy if exists notification_preferences_owner_all on public.notification_preferences;
create policy notification_preferences_owner_all
  on public.notification_preferences for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists push_subscriptions_owner_all on public.push_subscriptions;
create policy push_subscriptions_owner_all
  on public.push_subscriptions for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists notifications_owner_select on public.notifications;
create policy notifications_owner_select
  on public.notifications for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists notifications_owner_update on public.notifications;
create policy notifications_owner_update
  on public.notifications for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update on public.notification_preferences to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant select on public.notifications to authenticated;
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;
grant all on public.notification_preferences, public.push_subscriptions, public.notifications to service_role;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.push_service_config (
  singleton boolean primary key default true check (singleton),
  project_url text not null,
  publishable_key text not null,
  vapid_public_key text not null,
  vapid_private_key text not null,
  cron_secret text not null,
  updated_at timestamptz not null default now()
);
alter table private.push_service_config enable row level security;
revoke all on private.push_service_config from public, anon, authenticated, service_role;

create or replace function public.get_push_service_config(p_cron_secret text)
returns table (
  project_url text,
  publishable_key text,
  vapid_public_key text,
  vapid_private_key text,
  cron_secret text
)
language sql
security definer
set search_path = ''
as $
  select c.project_url, c.publishable_key, c.vapid_public_key, c.vapid_private_key, c.cron_secret
  from private.push_service_config c
  where c.singleton = true
    and p_cron_secret is not null
    and c.cron_secret = p_cron_secret;
$;

revoke all on function public.get_push_service_config() from public, anon, authenticated;
grant execute on function public.get_push_service_config() to service_role;

create or replace function private.invoke_reminder_worker()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  config_row record;
begin
  select project_url, publishable_key, cron_secret
  into config_row
  from private.push_service_config
  where singleton = true;

  if config_row.project_url is null or config_row.cron_secret is null then
    return;
  end if;

  perform net.http_post(
    url := config_row.project_url || '/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', config_row.publishable_key,
      'Authorization', 'Bearer ' || config_row.publishable_key,
      'x-cron-secret', config_row.cron_secret
    ),
    body := jsonb_build_object('triggered_at', clock_timestamp()),
    timeout_milliseconds := 10000
  );
end;
$$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'finanzas-ui-reminders-hourly') then
    perform cron.unschedule('finanzas-ui-reminders-hourly');
  end if;

  perform cron.schedule(
    'finanzas-ui-reminders-hourly',
    '5 * * * *',
    'select private.invoke_reminder_worker();'
  );
end;
$$;
