alter table public.installment_plans
  drop constraint if exists installment_plans_status_check;

alter table public.installment_plans
  add constraint installment_plans_status_check
  check (status = any (array['active'::text, 'paused'::text, 'completed'::text, 'cancelled'::text]));
