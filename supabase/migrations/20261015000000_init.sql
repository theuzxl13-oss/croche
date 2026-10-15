-- =============================================================
-- Fio & Ponto IA — esquema inicial
-- Receitas, progresso, limites de uso e armazenamento de imagens.
-- =============================================================

create extension if not exists pgcrypto;

-- -------------------------------------------------------------
-- Receitas
-- -------------------------------------------------------------
create table if not exists public.recipes (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  title             text not null check (char_length(title) between 1 and 200),
  description       text not null default '' check (char_length(description) <= 2000),
  category          text not null default 'outros'
                    check (category in ('amigurumi', 'roupas', 'bolsas', 'decoracao', 'acessorios', 'outros')),
  difficulty        text not null default 'iniciante'
                    check (difficulty in ('iniciante', 'intermediario', 'avancado')),
  prompt            text not null default '',
  options           jsonb not null default '{}'::jsonb,
  content           jsonb not null,
  validation        jsonb not null,
  validation_status text not null
                    check (validation_status in ('validada', 'validada_com_ressalvas', 'com_erros')),
  correction_rounds integer not null default 0,
  image_path        text,
  is_saved          boolean not null default false,
  is_favorite       boolean not null default false,
  progress          jsonb not null default '{}'::jsonb,
  duplicated_from   uuid references public.recipes (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists recipes_user_created_idx on public.recipes (user_id, created_at desc);
create index if not exists recipes_user_category_idx on public.recipes (user_id, category);
create index if not exists recipes_image_path_idx on public.recipes (image_path);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists recipes_set_updated_at on public.recipes;
create trigger recipes_set_updated_at
  before update on public.recipes
  for each row execute function public.set_updated_at();

-- Cada usuário só enxerga e altera as próprias receitas.
alter table public.recipes enable row level security;

drop policy if exists "recipes_select_own" on public.recipes;
create policy "recipes_select_own" on public.recipes
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "recipes_insert_own" on public.recipes;
create policy "recipes_insert_own" on public.recipes
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "recipes_update_own" on public.recipes;
create policy "recipes_update_own" on public.recipes
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "recipes_delete_own" on public.recipes;
create policy "recipes_delete_own" on public.recipes
  for delete to authenticated using (auth.uid() = user_id);

-- -------------------------------------------------------------
-- Limites de uso (proteção contra abuso). Acesso apenas pelo backend.
-- -------------------------------------------------------------
create table if not exists public.usage_events (
  id         bigserial primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  kind       text not null check (kind in ('recipe', 'image', 'chat')),
  created_at timestamptz not null default now()
);

create index if not exists usage_events_lookup_idx on public.usage_events (user_id, kind, created_at desc);

alter table public.usage_events enable row level security;
-- Sem políticas: nenhum acesso via anon/authenticated; só service role.

create or replace function public.consume_rate_limit(
  p_user_id  uuid,
  p_kind     text,
  p_per_hour integer,
  p_per_day  integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hour_count integer;
  v_day_count  integer;
  v_oldest     timestamptz;
begin
  -- Serializa chamadas simultâneas do mesmo usuário/tipo.
  perform pg_advisory_xact_lock(hashtext(p_user_id::text || ':' || p_kind));

  select count(*) into v_hour_count
    from usage_events
   where user_id = p_user_id and kind = p_kind and created_at > now() - interval '1 hour';

  if v_hour_count >= p_per_hour then
    select min(created_at) into v_oldest
      from (select created_at from usage_events
             where user_id = p_user_id and kind = p_kind and created_at > now() - interval '1 hour'
             order by created_at desc limit p_per_hour) t;
    return jsonb_build_object('allowed', false,
      'retry_after_seconds', greatest(1, extract(epoch from (v_oldest + interval '1 hour' - now()))::int));
  end if;

  select count(*) into v_day_count
    from usage_events
   where user_id = p_user_id and kind = p_kind and created_at > now() - interval '1 day';

  if v_day_count >= p_per_day then
    select min(created_at) into v_oldest
      from (select created_at from usage_events
             where user_id = p_user_id and kind = p_kind and created_at > now() - interval '1 day'
             order by created_at desc limit p_per_day) t;
    return jsonb_build_object('allowed', false,
      'retry_after_seconds', greatest(1, extract(epoch from (v_oldest + interval '1 day' - now()))::int));
  end if;

  insert into usage_events (user_id, kind) values (p_user_id, p_kind);

  -- Limpeza leve de eventos antigos.
  delete from usage_events where user_id = p_user_id and created_at < now() - interval '2 days';

  return jsonb_build_object('allowed', true, 'retry_after_seconds', null);
end;
$$;

revoke all on function public.consume_rate_limit(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(uuid, text, integer, integer) to service_role;

-- -------------------------------------------------------------
-- Armazenamento das imagens (bucket privado, pasta = id do usuário)
-- -------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-images', 'recipe-images', false, 10485760, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "recipe_images_select_own" on storage.objects;
create policy "recipe_images_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'recipe-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "recipe_images_insert_own" on storage.objects;
create policy "recipe_images_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'recipe-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "recipe_images_delete_own" on storage.objects;
create policy "recipe_images_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'recipe-images' and (storage.foldername(name))[1] = auth.uid()::text);
