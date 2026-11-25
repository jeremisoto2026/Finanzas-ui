alter table public.notification_income_candidates
  add column if not exists suggested_category text,
  add column if not exists classification_confidence numeric(4,3) not null default 0,
  add column if not exists classification_source text not null default 'none';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.notification_income_candidates'::regclass
      and conname = 'notification_income_candidates_confidence_range'
  ) then
    alter table public.notification_income_candidates
      add constraint notification_income_candidates_confidence_range
      check (classification_confidence >= 0 and classification_confidence <= 1);
  end if;
end $$;
