-- Retire all bank-card suffix data from notification capture.
-- One active/default account mapping is retained per user and bank application.
-- Historical notification text is replaced with a minimal parsed summary before the
-- legacy columns are dropped, so raw notification contents are not kept in Preview.

begin;

-- Keep the most recently updated mapping per user/app. These rows are configuration
-- only; financial movements and account balances are never changed.
with ranked_mappings as (
  select
    id,
    row_number() over (
      partition by user_id, source_app
      order by is_active desc, updated_at desc, created_at desc, id desc
    ) as row_number
  from public.account_notification_sources
)
delete from public.account_notification_sources mapping
using ranked_mappings ranked
where mapping.id = ranked.id
  and ranked.row_number > 1;

-- Remove the original notification title/body that could contain sensitive details.
-- Keep only parsed merchant and amount metadata needed by the review inbox.
update public.notification_capture_events
set
  notification_title = coalesce(
    nullif(btrim(parsed_merchant), ''),
    case source_app
      when 'revolut' then 'Revolut'
      when 'bbva' then 'BBVA'
      when 'google_wallet' then 'Google Wallet'
      else 'Aviso bancario'
    end
  ),
  notification_text = case
    when parsed_amount is not null
      then 'Pago detectado: ' || parsed_amount::text || ' ' || coalesce(nullif(btrim(currency_code), ''), 'EUR')
    else 'Aviso recibido de ' || source_app
  end,
  updated_at = now();

alter table public.account_notification_sources
  drop constraint if exists account_notification_sources_user_source_card_key;

alter table public.account_notification_sources
  drop constraint if exists account_notification_sources_card_last4_check;

alter table public.account_notification_sources
  drop column if exists card_last4;

alter table public.account_notification_sources
  add constraint account_notification_sources_user_source_key
  unique (user_id, source_app);

alter table public.notification_capture_events
  drop constraint if exists notification_capture_events_card_last4_check;

alter table public.notification_capture_events
  drop column if exists card_last4;

comment on table public.account_notification_sources is
  'One default account destination per user and supported bank notification application.';

notify pgrst, 'reload schema';

commit;
