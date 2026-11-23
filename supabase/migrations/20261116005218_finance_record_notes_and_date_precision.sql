-- Keep confidence notes and month-only installment schedules explicit.
alter table public.fixed_payments
  add column if not exists notes text;

alter table public.installment_plans
  add column if not exists notes text,
  add column if not exists start_date_precision text not null default 'day';

alter table public.installments
  add column if not exists notes text,
  add column if not exists due_date_precision text not null default 'day';

alter table public.budgets
  add column if not exists notes text;

alter table public.debts
  add column if not exists external_source text,
  add column if not exists external_reference text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'installment_plans_start_date_precision_check'
      and conrelid = 'public.installment_plans'::regclass
  ) then
    alter table public.installment_plans
      add constraint installment_plans_start_date_precision_check
      check (start_date_precision in ('day','month'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'installments_due_date_precision_check'
      and conrelid = 'public.installments'::regclass
  ) then
    alter table public.installments
      add constraint installments_due_date_precision_check
      check (due_date_precision in ('day','month'));
  end if;
end $$;

create unique index if not exists debts_external_reference_unique
  on public.debts(user_id, external_source, external_reference)
  where external_source is not null and external_reference is not null;
