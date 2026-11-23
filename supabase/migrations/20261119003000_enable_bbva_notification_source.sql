-- Extend the private notification inbox to the BBVA Android app.
-- This is an additive Preview migration; it does not rewrite financial transactions.
alter table public.notification_capture_events
  drop constraint if exists notification_capture_events_source_app_check;

alter table public.notification_capture_events
  add constraint notification_capture_events_source_app_check
  check (source_app in ('revolut', 'google_wallet', 'bbva'));

alter table public.notification_capture_events
  drop constraint if exists notification_capture_events_payment_channel_check;

alter table public.notification_capture_events
  add constraint notification_capture_events_payment_channel_check
  check (payment_channel is null or payment_channel in ('revolut', 'google_wallet', 'bbva'));
