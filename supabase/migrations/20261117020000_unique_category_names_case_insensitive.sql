create unique index if not exists categories_user_normalized_name_uidx
  on public.categories (
    user_id,
    lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g'))
  );
