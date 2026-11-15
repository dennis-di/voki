import { supabase } from './supabase';
import type { Activity, Exam, Invite, Profile, Row, Stat, Subject, Unit, Vocab } from './types';

const ok = <T,>(r: { data: T | null; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
};

export async function loadSubject(subject: Subject) {
  const units = ok(await supabase.from('units').select('*').eq('subject', subject).order('created_at', { ascending: true })) as Unit[];
  const ids = units.map((u) => u.id);
  const vocab = ids.length ? (ok(await supabase.from('vocab').select('*').in('unit_id', ids).order('position')) as Vocab[]) : [];
  const stats = ok(await supabase.from('vocab_stats').select('*')) as Stat[];
  return { units, vocab, stats };
}

export async function loadUnit(id: string) {
  const unit = ok(await supabase.from('units').select('*').eq('id', id).single()) as Unit;
  const vocab = ok(await supabase.from('vocab').select('*').eq('unit_id', id).order('position')) as Vocab[];
  return { unit, vocab };
}

const rowData = (r: Row, i: number) => ({
  position: i, kind: r.kind, page: r.page.trim() || null, section: r.section.trim() || null,
  term: r.term.trim(), ipa: r.kind === 'word' ? r.ipa.trim() || null : null, translation: r.kind === 'word' ? r.translation.trim() : '',
  gender: r.kind === 'word' && r.gender ? r.gender : null, plural: r.plural.trim() || null, note: r.note.trim() || null,
  examples: r.examples.map((e) => ({ fr: e.fr.trim(), de: e.de.trim() })).filter((e) => e.fr),
});
/** Unit anlegen oder speichern; Zeilen werden abgeglichen, damit der Lernstand erhalten bleibt */
export async function saveUnit(p: { id?: string; subject: Subject; title: string; subtitle: string; rows: Row[]; removed: string[] }) {
  let unitId = p.id;
  if (unitId) ok(await supabase.from('units').update({ title: p.title, subtitle: p.subtitle || null }).eq('id', unitId));
  else unitId = (ok(await supabase.from('units').insert({ subject: p.subject, title: p.title, subtitle: p.subtitle || null }).select('id').single()) as { id: string }).id;
  if (p.removed.length) ok(await supabase.from('vocab').delete().in('id', p.removed));
  const clean = p.rows.filter((r) => r.term.trim() && (r.kind === 'rule' || r.translation.trim()));
  const existing = clean.map((r, i) => ({ r, i })).filter((x) => x.r.id);
  const fresh = clean.map((r, i) => ({ r, i })).filter((x) => !x.r.id);
  for (const { r, i } of existing) ok(await supabase.from('vocab').update(rowData(r, i)).eq('id', r.id!));
  if (fresh.length) ok(await supabase.from('vocab').insert(fresh.map(({ r, i }) => ({ unit_id: unitId, ...rowData(r, i) }))));
  return unitId!;
}
export async function deleteUnit(id: string) { ok(await supabase.from('units').delete().eq('id', id)); }
export type AnswerMode = 'mc-to-de' | 'mc-from-de' | 'write' | 'listen' | 'puzzle';
/** Antwort speichern: Lernstufe und Punkte. Liefert die neue Stufe (oder null, wenn offline / alte Datenbank). */
export async function recordAnswer(vocabId: string, correct: boolean, mode: AnswerMode = 'mc-to-de', xp = 0): Promise<{ level: number; xp_today: number } | null> {
  const { data, error } = await supabase.rpc('record_answer_v2', { p_vocab: vocabId, p_correct: correct, p_mode: mode, p_xp: xp });
  if (error) { await supabase.rpc('record_answer', { p_vocab: vocabId, p_correct: correct }); return null; }
  const row = Array.isArray(data) ? data[0] : data;
  return row ? { level: row.level, xp_today: row.xp_today } : null;
}

/* Fortschritt, Tests, Liga */
export async function loadActivity(): Promise<Activity[]> {
  const since = new Date(Date.now() - 70 * 864e5).toISOString().slice(0, 10);
  const { data, error } = await supabase.from('daily_activity').select('day,xp,answers,correct').gte('day', since).order('day');
  return error ? [] : (data as Activity[]);
}
export async function loadExams(subject: Subject): Promise<Exam[]> {
  const d = new Date(), today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const { data, error } = await supabase.from('exams').select('id,subject,title,day,unit_ids').eq('subject', subject).gte('day', today).order('day');
  return error ? [] : (data as Exam[]);
}
export async function saveExam(e: Omit<Exam, 'id'> & { id?: string }) {
  if (e.id) ok(await supabase.from('exams').update({ title: e.title, day: e.day, unit_ids: e.unit_ids }).eq('id', e.id));
  else ok(await supabase.from('exams').insert({ subject: e.subject, title: e.title, day: e.day, unit_ids: e.unit_ids }));
}
export async function deleteExam(id: string) { ok(await supabase.from('exams').delete().eq('id', id)); }
export async function leagueWeek(): Promise<{ name: string; xp: number; me: boolean }[]> {
  const { data, error } = await supabase.rpc('league_week');
  return error ? [] : (data as { name: string; xp: number; me: boolean }[]);
}
export async function adminProgress() {
  const { data, error } = await supabase.rpc('admin_progress');
  if (error) throw new Error(error.message);
  return data as { user_id: string; name: string; words: number; mastered: number; to_practice: number; xp_week: number; last_day: string | null; days_active_14: number }[];
}
export async function adminWeakWords(user: string) {
  const { data, error } = await supabase.rpc('admin_weak_words', { p_user: user });
  if (error) throw new Error(error.message);
  return data as { term: string; translation: string; wrong: number; level: number }[];
}

export async function myProfile(): Promise<Profile | null> {
  const { data: s } = await supabase.auth.getUser();
  if (!s.user) return null;
  const { data } = await supabase.from('profiles').select('*').eq('id', s.user.id).single();
  return (data as Profile) || null;
}
export async function updateMyProfile(id: string, patch: { display_name?: string | null; parent_email?: string | null; in_league?: boolean }) {
  ok(await supabase.from('profiles').update(patch).eq('id', id));
}
export async function hasOwnKey() { const { data } = await supabase.rpc('has_my_ai_key'); return !!data; }
export async function setOwnKey(k: string) { const { error } = await supabase.rpc('set_my_ai_key', { p_key: k.trim() }); if (error) throw new Error(error.message); }
export async function clearOwnKey() { await supabase.rpc('clear_my_ai_key'); }

/* Admin */
export async function listProfiles() { return ok(await supabase.from('profiles').select('*').order('created_at')) as Profile[]; }
export async function listInvites() { return ok(await supabase.from('invites').select('*').order('created_at', { ascending: false })) as Invite[]; }
export async function createInvite(i: Omit<Invite, 'created_at'>) { ok(await supabase.from('invites').insert(i)); }
export async function deleteInvite(code: string) { ok(await supabase.from('invites').delete().eq('code', code)); }
export async function adminSetUser(id: string, role: string, ai: string) {
  const { error } = await supabase.rpc('admin_set_user', { p_user: id, p_role: role, p_ai: ai });
  if (error) throw new Error(error.message);
}
