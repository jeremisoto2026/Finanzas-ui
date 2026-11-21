-- Dynamic, user-owned account classification.
-- The accounts table already has user_id, owner-only RLS policies,
-- active/inactive state, and composite ownership foreign keys.
-- This migration only adds a type classification and a lookup index.
-- Existing account rows and historical transactions remain untouched.

begin;

alter table public.accounts
  add column if not exists account_type text not null default 'bank';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'accounts_account_type_check'
      and conrelid = 'public.accounts'::regclass
  ) then
    alter table public.accounts
      add constraint accounts_account_type_check
      check (account_type in (
        'bank',
        'cash',
        'debit_card',
        'credit_card',
        'digital_wallet',
        'savings',
        'other'
      ));
  end if;
end
$$;

create index if not exists accounts_user_active_name_idx
  on public.accounts(user_id, is_active, name);

comment on column public.accounts.account_type is
  'User-defined account classification: bank, cash, debit_card, credit_card, digital_wallet, savings, or other.';

commit;
