-- Preserve the original Notion source identity for safe, idempotent imports.
alter table public.fixed_payments
  add column if not exists payment_method text,
  add column if not exists notification_enabled boolean not null default false,
  add column if not exists external_source text,
  add column if not exists external_reference text;

alter table public.installment_plans
  add column if not exists category_id uuid,
  add column if not exists payment_method text,
  add column if not exists external_source text,
  add column if not exists external_reference text;

alter table public.transactions
  add column if not exists payment_method text;

alter table public.installment_plans
  add constraint installment_plans_category_id_user_id_fkey
  foreign key (category_id, user_id)
  references public.categories(id, user_id)
  on delete restrict;

create unique index if not exists fixed_payments_external_reference_unique
  on public.fixed_payments(user_id, external_source, external_reference)
  where external_source is not null and external_reference is not null;

create unique index if not exists installment_plans_external_reference_unique
  on public.installment_plans(user_id, external_source, external_reference)
  where external_source is not null and external_reference is not null;

create index if not exists installment_plans_category_user_idx
  on public.installment_plans(category_id, user_id);
