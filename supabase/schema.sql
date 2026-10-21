-- Vokabel-App · Datenbank
-- Einmal komplett im Supabase SQL Editor ausführen (Dashboard › SQL Editor › New query › Run).

create schema if not exists private;

-- ───────────── Tabellen ─────────────

create table if not exists public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  username     text not null unique check (username ~ '^[a-z0-9._-]{3,24}$'),
  display_name text check (char_length(display_name) <= 40),
  parent_email text check (char_length(parent_email) <= 120),
  role         text not null default 'member' check (role in ('admin','member')),
  ai_access    text not null default 'none'   check (ai_access in ('none','owner')),
  created_at   timestamptz not null default now()
);

create table if not exists public.invites (
  code       text primary key,
  note       text,
  role       text not null default 'member' check (role in ('admin','member')),
  ai_access  text not null default 'none'   check (ai_access in ('none','owner')),
  uses_left  int  not null default 1 check (uses_left >= 0),
  expires_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.units (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  subject    text not null check (subject in ('fr','en')),
  title      text not null check (char_length(title) between 1 and 80),
  subtitle   text check (char_length(subtitle) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists units_owner_idx on public.units(owner_id, subject);

create table if not exists public.vocab (
  id          uuid primary key default gen_random_uuid(),
  unit_id     uuid not null references public.units(id) on delete cascade,
  owner_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  position    int  not null default 0,
  section     text check (char_length(section) <= 40),
  term        text not null check (char_length(term) between 1 and 200),
  ipa         text check (char_length(ipa) <= 120),
  translation text not null check (char_length(translation) between 1 and 300),
  created_at  timestamptz not null default now()
);
create index if not exists vocab_unit_idx on public.vocab(unit_id, position);

create table if not exists public.vocab_stats (
  user_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  vocab_id     uuid not null references public.vocab(id) on delete cascade,
  correct      int  not null default 0,
  wrong        int  not null default 0,
  last_correct boolean,
  last_seen    timestamptz,
  primary key (user_id, vocab_id)
);

-- Eigene Claude-Schlüssel: liegen in einem Schema, das über die API nicht erreichbar ist.
create table if not exists private.user_secrets (
  user_id       uuid primary key references auth.users on delete cascade,
  anthropic_key text not null,
  updated_at    timestamptz not null default now()
);
revoke all on schema private from anon, authenticated;

-- ───────────── Hilfsfunktionen ─────────────

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.touch_unit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.units set updated_at = now() where id = coalesce(new.unit_id, old.unit_id);
  return null;
end $$;
drop trigger if exists vocab_touch_unit on public.vocab;
create trigger vocab_touch_unit after insert or update or delete on public.vocab
  for each row execute function public.touch_unit();

-- Antwort im Test speichern (für „Nur Fehler üben“)
create or replace function public.record_answer(p_vocab uuid, p_correct boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.vocab where id = p_vocab and owner_id = auth.uid()) then
    raise exception 'not allowed';
  end if;
  insert into public.vocab_stats (user_id, vocab_id, correct, wrong, last_correct, last_seen)
  values (auth.uid(), p_vocab, case when p_correct then 1 else 0 end, case when p_correct then 0 else 1 end, p_correct, now())
  on conflict (user_id, vocab_id) do update set
    correct = vocab_stats.correct + case when p_correct then 1 else 0 end,
    wrong   = vocab_stats.wrong   + case when p_correct then 0 else 1 end,
    last_correct = p_correct,
    last_seen = now();
end $$;

-- Eigener Claude-Schlüssel: setzen, prüfen, löschen (lesen kann ihn nur der Server)
create or replace function public.set_my_ai_key(p_key text) returns void
language plpgsql security definer set search_path = public, private as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_key is null or p_key !~ '^sk-ant-[A-Za-z0-9_-]{20,}$' then raise exception 'invalid key'; end if;
  insert into private.user_secrets (user_id, anthropic_key, updated_at) values (auth.uid(), p_key, now())
  on conflict (user_id) do update set anthropic_key = excluded.anthropic_key, updated_at = now();
end $$;

create or replace function public.clear_my_ai_key() returns void
language sql security definer set search_path = public, private as $$
  delete from private.user_secrets where user_id = auth.uid();
$$;

create or replace function public.has_my_ai_key() returns boolean
language sql stable security definer set search_path = public, private as $$
  select exists (select 1 from private.user_secrets where user_id = auth.uid());
$$;

-- Nur für die Server-Funktion „read-photo“
create or replace function public.get_ai_key_for(p_user uuid) returns text
language sql stable security definer set search_path = public, private as $$
  select anthropic_key from private.user_secrets where user_id = p_user;
$$;
revoke execute on function public.get_ai_key_for(uuid) from public, anon, authenticated;
grant execute on function public.get_ai_key_for(uuid) to service_role;

-- Tageszähler für Foto-Erkennungen (schützt deinen Schlüssel vor Dauerbenutzung)
create table if not exists private.ai_usage (
  user_id uuid not null references auth.users on delete cascade,
  day     date not null default current_date,
  count   int  not null default 0,
  primary key (user_id, day)
);
create or replace function public.bump_ai_usage(p_user uuid) returns int
language sql security definer set search_path = public, private as $$
  insert into private.ai_usage (user_id, day, count) values (p_user, current_date, 1)
  on conflict (user_id, day) do update set count = ai_usage.count + 1
  returning count;
$$;
revoke execute on function public.bump_ai_usage(uuid) from public, anon, authenticated;
grant execute on function public.bump_ai_usage(uuid) to service_role;

-- Admin: Rolle und Claude-Zugang eines Kontos ändern
create or replace function public.admin_set_user(p_user uuid, p_role text, p_ai text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if p_user = auth.uid() and p_role <> 'admin' then raise exception 'cannot demote yourself'; end if;
  update public.profiles set role = p_role, ai_access = p_ai where id = p_user;
end $$;

-- ───────────── Zugriffsregeln (RLS) ─────────────

alter table public.profiles    enable row level security;
alter table public.invites     enable row level security;
alter table public.units       enable row level security;
alter table public.vocab       enable row level security;
alter table public.vocab_stats enable row level security;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
-- Nur Anzeigename und Eltern-Mail darf man selbst ändern
revoke update on public.profiles from authenticated;
grant update (display_name, parent_email) on public.profiles to authenticated;

drop policy if exists invites_admin on public.invites;
create policy invites_admin on public.invites for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists units_own on public.units;
create policy units_own on public.units for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists vocab_own on public.vocab;
create policy vocab_own on public.vocab for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and exists (select 1 from public.units u where u.id = unit_id and u.owner_id = auth.uid()));

drop policy if exists stats_own on public.vocab_stats;
create policy stats_own on public.vocab_stats for select to authenticated
  using (user_id = auth.uid());

-- ───────────── Erste Einladung (dein Admin-Konto) ─────────────
insert into public.invites (code, note, role, ai_access, uses_left)
values ('START-GAT5FX', 'Erstes Admin-Konto', 'admin', 'owner', 1)
on conflict (code) do nothing;
