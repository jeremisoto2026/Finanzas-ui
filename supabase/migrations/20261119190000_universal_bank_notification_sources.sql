-- Allow per-user notification capture from any eligible Android app package.
-- Existing Revolut/BBVA links retain their keys; Wallet remains a pairing-only source.
-- This Preview migration only expands source identifiers and adds display labels.
begin;

alter table public.notification_capture_events
  drop constraint if exists notification_capture_events_source_app_check;

alter table public.notification_capture_events
  add constraint notification_capture_events_source_app_check
  check (
    source_app in ('revolut', 'bbva', 'google_wallet')
    or (
      source_app like 'android:%'
      and length(source_app) <= 188
      and substring(source_app from 9) ~ '^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$'
    )
  );

alter table public.notification_capture_events
  drop constraint if exists notification_capture_events_payment_channel_check;

alter table public.notification_capture_events
  add constraint notification_capture_events_payment_channel_check
  check (
    payment_channel is null
    or payment_channel in ('revolut', 'bbva', 'google_wallet')
    or (
      payment_channel like 'android:%'
      and length(payment_channel) <= 188
      and substring(payment_channel from 9) ~ '^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$'
    )
  );

alter table public.account_notification_sources
  drop constraint if exists account_notification_sources_source_app_check;

alter table public.account_notification_sources
  add constraint account_notification_sources_source_app_check
  check (
    source_app in ('revolut', 'bbva')
    or (
      source_app like 'android:%'
      and length(source_app) <= 188
      and substring(source_app from 9) ~ '^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$'
    )
  );

alter table public.notification_capture_events
  add column if not exists source_label text;

alter table public.account_notification_sources
  add column if not exists source_label text;

alter table public.notification_capture_events
  drop constraint if exists notification_capture_events_source_label_check;

alter table public.notification_capture_events
  add constraint notification_capture_events_source_label_check
  check (
    source_label is null
    or (length(btrim(source_label)) between 2 and 100)
  );

alter table public.account_notification_sources
  drop constraint if exists account_notification_sources_source_label_check;

alter table public.account_notification_sources
  add constraint account_notification_sources_source_label_check
  check (
    source_label is null
    or (length(btrim(source_label)) between 2 and 100)
  );

comment on column public.notification_capture_events.source_app is
  'Known source key (revolut, bbva, google_wallet) or android:<package> for any eligible app.';
comment on column public.notification_capture_events.source_label is
  'Display name resolved locally from Android PackageManager; raw notification contents are not stored.';
comment on column public.account_notification_sources.source_app is
  'Known bank source key or android:<package> for a user-configured Android banking/payment app.';
comment on column public.account_notification_sources.source_label is
  'Human-readable app name shown when the user links the source to one of their accounts.';

notify pgrst, 'reload schema';

commit;
