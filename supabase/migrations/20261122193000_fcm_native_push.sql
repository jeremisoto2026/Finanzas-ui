-- Native Firebase Cloud Messaging tokens for the authenticated Android app.
create table if not exists public.fcm_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  platform text not null default 'android' check (platform in ('android')),
  device_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fcm_push_tokens_user_idx
  on public.fcm_push_tokens(user_id);

alter table public.fcm_push_tokens enable row level security;

drop policy if exists "Users can view their own FCM tokens" on public.fcm_push_tokens;
create policy "Users can view their own FCM tokens"
  on public.fcm_push_tokens for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can register their own FCM tokens" on public.fcm_push_tokens;
create policy "Users can register their own FCM tokens"
  on public.fcm_push_tokens for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own FCM tokens" on public.fcm_push_tokens;
create policy "Users can update their own FCM tokens"
  on public.fcm_push_tokens for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can remove their own FCM tokens" on public.fcm_push_tokens;
create policy "Users can remove their own FCM tokens"
  on public.fcm_push_tokens for delete to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.fcm_push_tokens to authenticated;
