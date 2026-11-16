-- Cover composite foreign keys used by user-scoped finance relations.
create index if not exists budgets_category_user_idx
  on public.budgets(category_id, user_id);

create index if not exists fixed_payments_account_user_idx
  on public.fixed_payments(account_id, user_id);
create index if not exists fixed_payments_category_user_idx
  on public.fixed_payments(category_id, user_id);

create index if not exists installments_plan_user_idx
  on public.installments(plan_id, user_id);
create index if not exists installments_transaction_user_idx
  on public.installments(transaction_id, user_id);

create index if not exists reservations_account_user_idx
  on public.reservations(account_id, user_id);

create index if not exists transactions_account_user_fk_idx
  on public.transactions(account_id, user_id);
create index if not exists transactions_category_user_fk_idx
  on public.transactions(category_id, user_id);
create index if not exists transactions_import_batch_user_fk_idx
  on public.transactions(import_batch_id, user_id);
create index if not exists transactions_transfer_user_fk_idx
  on public.transactions(transfer_id, user_id);

create index if not exists transfers_from_account_user_idx
  on public.transfers(from_account_id, user_id);
create index if not exists transfers_to_account_user_idx
  on public.transfers(to_account_id, user_id);
