-- Voki v2 · Seiten, Genus, Beispiele, Regeln, Lernstufen, XP, Tests, Liga, Eltern-Ansicht
-- Nach schema.sql einmal im SQL Editor ausführen. Kann mehrfach laufen, ändert bestehende Daten nicht.

-- ───────────── Vokabeln: mehr als nur „fremd = deutsch“ ─────────────
alter table public.vocab add column if not exists kind     text not null default 'word';
alter table public.vocab add column if not exists page     text;
alter table public.vocab add column if not exists gender   text;
alter table public.vocab add column if not exists plural   text;
alter table public.vocab add column if not exists note     text;
alter table public.vocab add column if not exists examples jsonb not null default '[]'::jsonb;

alter table public.vocab drop constraint if exists vocab_kind_check;
alter table public.vocab add constraint vocab_kind_check check (kind in ('word','rule'));
alter table public.vocab drop constraint if exists vocab_gender_check;
alter table public.vocab add constraint vocab_gender_check check (gender is null or gender in ('m','f'));
alter table public.vocab drop constraint if exists vocab_page_check;
alter table public.vocab add constraint vocab_page_check check (char_length(page) <= 20);
alter table public.vocab drop constraint if exists vocab_plural_check;
alter table public.vocab add constraint vocab_plural_check check (char_length(plural) <= 120);
alter table public.vocab drop constraint if exists vocab_note_check;
alter table public.vocab add constraint vocab_note_check check (char_length(note) <= 400);
alter table public.vocab drop constraint if exists vocab_examples_check;
alter table public.vocab add constraint vocab_examples_check check (jsonb_typeof(examples) = 'array' and pg_column_size(examples) <= 6000);
-- Regeln (orange Kästen) haben längeren Text und keine Übersetzung
alter table public.vocab drop constraint if exists vocab_term_check;
alter table public.vocab add constraint vocab_term_check check (char_length(term) between 1 and 600);
alter table public.vocab drop constraint if exists vocab_translation_check;
alter table public.vocab add constraint vocab_translation_check check (char_length(translation) <= 300 and (kind = 'rule' or char_length(translation) >= 1));

-- Bestehende Units: Seitenzahl aus dem Zusatz („Seite 158“) übernehmen
update public.vocab v set page = substring(u.subtitle from '(\d{1,4})')
from public.units u
where v.unit_id = u.id and v.page is null and u.subtitle ~ '\d';

-- Männlich/weiblich aus dem Artikel ableiten (nur Französisch, l' bleibt offen)
update public.vocab v set gender = case
    when v.term ~* '\(\s*f\.?\s*\)' or v.term ~* '^(la|une)\s' then 'f'
    when v.term ~* '\(\s*m\.?\s*\)' or v.term ~* '^(le|un)\s' then 'm' end
from public.units u
where v.unit_id = u.id and u.subject = 'fr' and v.gender is null and v.kind = 'word'
  and (v.term ~* '^(le|la|un|une)\s' or v.term ~* '\(\s*[mf]\.?\s*\)');

-- ───────────── Lernstufen ─────────────
-- 0 neu · 1 erkennt (Auswahl FR→DE) · 2 ordnet zu (Auswahl DE→FR) · 3 schreibt richtig = sitzt
alter table public.vocab_stats add column if not exists level  int not null default 0;
alter table public.vocab_stats add column if not exists streak int not null default 0;
-- Wer bisher richtig lag, startet auf Stufe 1
update public.vocab_stats set level = 1 where level = 0 and last_correct is true;

-- Tagesaktivität: Punkte (XP) und Antworten pro Tag
create table if not exists public.daily_activity (
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  day     date not null default current_date,
  xp      int  not null default 0,
  answers int  not null default 0,
  correct int  not null default 0,
  primary key (user_id, day)
);
alter table public.daily_activity enable row level security;
drop policy if exists activity_own on public.daily_activity;
create policy activity_own on public.daily_activity for select to authenticated using (user_id = auth.uid());

create or replace function public.mode_rank(p_mode text) returns int
language sql immutable set search_path = public as $$
  select case p_mode when 'mc-to-de' then 1 when 'mc-from-de' then 2 when 'write' then 3 when 'listen' then 3 else 0 end;
$$;

-- Antwort speichern, Lernstufe anpassen, Punkte gutschreiben
create or replace function public.record_answer_v2(p_vocab uuid, p_correct boolean, p_mode text, p_xp int default 0)
returns table (level int, xp_today int)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare r int := public.mode_rank(p_mode); s public.vocab_stats; x int := greatest(0, least(coalesce(p_xp, 0), 12));
begin
  if not exists (select 1 from public.vocab where id = p_vocab and owner_id = auth.uid()) then
    raise exception 'not allowed';
  end if;
  insert into public.vocab_stats (user_id, vocab_id) values (auth.uid(), p_vocab) on conflict do nothing;
  select * into s from public.vocab_stats where user_id = auth.uid() and vocab_id = p_vocab for update;
  if p_correct then
    s.correct := s.correct + 1;
    if r > s.level then
      s.streak := s.streak + 1;
      -- Zweimal hintereinander richtig auf höherer Stufe: aufsteigen
      -- (Schreiben zählt sofort als „sitzt“, Auswahl geht Stufe für Stufe)
      if s.streak >= 2 then s.level := case when r = 3 then 3 else s.level + 1 end; s.streak := 0; end if;
    end if;
  else
    s.wrong := s.wrong + 1; s.streak := 0;
    if r > 0 then s.level := greatest(0, s.level - 1); end if;
  end if;
  update public.vocab_stats v set correct = s.correct, wrong = s.wrong, level = s.level, streak = s.streak,
    last_correct = p_correct, last_seen = now()
  where v.user_id = auth.uid() and v.vocab_id = p_vocab;

  insert into public.daily_activity (user_id, day, xp, answers, correct)
  values (auth.uid(), current_date, case when p_correct then x else 0 end, 1, case when p_correct then 1 else 0 end)
  on conflict (user_id, day) do update set
    xp = daily_activity.xp + excluded.xp, answers = daily_activity.answers + 1, correct = daily_activity.correct + excluded.correct;

  return query select s.level, (select a.xp from public.daily_activity a where a.user_id = auth.uid() and a.day = current_date);
end $$;

-- ───────────── Tests mit Datum (Countdown) ─────────────
create table if not exists public.exams (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  subject    text not null check (subject in ('fr','en')),
  title      text not null check (char_length(title) between 1 and 80),
  day        date not null,
  unit_ids   uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.exams enable row level security;
drop policy if exists exams_own on public.exams;
create policy exams_own on public.exams for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ───────────── Wochen-Liga (nur wer mitmacht) ─────────────
alter table public.profiles add column if not exists in_league boolean not null default false;
grant update (display_name, parent_email, in_league) on public.profiles to authenticated;

create or replace function public.league_week() returns table (name text, xp int, me boolean)
language sql stable security definer set search_path = public as $$
  select coalesce(p.display_name, p.username), coalesce(sum(a.xp), 0)::int, p.id = auth.uid()
  from public.profiles p
  left join public.daily_activity a on a.user_id = p.id and a.day >= date_trunc('week', current_date)::date
  where p.in_league and exists (select 1 from public.profiles m where m.id = auth.uid() and m.in_league)
  group by p.id
  order by 2 desc, 1;
$$;

-- ───────────── Eltern-Ansicht (nur Admin) ─────────────
create or replace function public.admin_progress()
returns table (user_id uuid, name text, words int, mastered int, to_practice int, xp_week int, last_day date, days_active_14 int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  return query
  select p.id, coalesce(p.display_name, p.username),
    (select count(*)::int from public.vocab v where v.owner_id = p.id and v.kind = 'word'),
    (select count(*)::int from public.vocab_stats s where s.user_id = p.id and s.level >= 3),
    (select count(*)::int from public.vocab_stats s where s.user_id = p.id and s.last_correct is false),
    (select coalesce(sum(a.xp), 0)::int from public.daily_activity a where a.user_id = p.id and a.day >= date_trunc('week', current_date)::date),
    (select max(a.day) from public.daily_activity a where a.user_id = p.id),
    (select count(*)::int from public.daily_activity a where a.user_id = p.id and a.day > current_date - 14)
  from public.profiles p order by p.created_at;
end $$;

create or replace function public.admin_weak_words(p_user uuid)
returns table (term text, translation text, wrong int, level int, last_seen timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  return query
  select v.term, v.translation, s.wrong, s.level, s.last_seen
  from public.vocab_stats s join public.vocab v on v.id = s.vocab_id
  where s.user_id = p_user and s.last_correct is false
  order by s.wrong desc, s.last_seen desc limit 15;
end $$;

revoke execute on function public.admin_progress() from anon, public;
grant execute on function public.admin_progress() to authenticated;
revoke execute on function public.admin_weak_words(uuid) from anon, public;
grant execute on function public.admin_weak_words(uuid) to authenticated;
revoke execute on function public.league_week() from anon, public;
grant execute on function public.league_week() to authenticated;
revoke execute on function public.record_answer_v2(uuid, boolean, text, int) from anon, public;
grant execute on function public.record_answer_v2(uuid, boolean, text, int) to authenticated;
