-- Fase 5: extend the existing notification pipeline additively.
alter table public.notification_preferences
  add column if not exists budget_alerts_enabled boolean not null default true,
  add column if not exists overdue_installments_enabled boolean not null default true,
  add column if not exists balance_alerts_enabled boolean not null default true,
  add column if not exists commitment_summary_enabled boolean not null default true,
  add column if not exists commitment_summary_days smallint not null default 7
    check (commitment_summary_days between 1 and 31);

alter table public.notifications
  alter column source_id drop not null,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.notifications
  drop constraint if exists notifications_source_type_check;
alter table public.notifications
  add constraint notifications_source_type_check
  check (source_type in (
    'fixed_payment', 'installment', 'budget_threshold',
    'overdue_installment', 'insufficient_balance', 'commitment_summary'
  ));

create index if not exists notifications_user_source_idx
  on public.notifications(user_id, source_type, due_on desc);
