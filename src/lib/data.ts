import { supabase } from './supabase';
import type { Invite, Profile, Row, Stat, Subject, Unit, Vocab } from './types';

const ok = <T,>(r: { data: T | null; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
};

export async function loadSubject(subject: Subject) {
  const units = ok(await supabase.from('units').select('*').eq('subject', subject).order('created_at', { ascending: true })) as Unit[];
  const ids = units.map((u) => u.id);
  const vocab = ids.length ? (ok(await supabase.from('vocab').select('*').in('unit_id', ids).order('position')) as Vocab[]) : [];
  const stats = ok(await supabase.from('vocab_stats').select('vocab_id,correct,wrong,last_correct,last_seen')) as Stat[];
  return { units, vocab, stats };
}

export async function loadUnit(id: string) {
  const unit = ok(await supabase.from('units').select('*').eq('id', id).single()) as Unit;
  const vocab = ok(await supabase.from('vocab').select('*').eq('unit_id', id).order('position')) as Vocab[];
  return { unit, vocab };
}

/** Unit anlegen oder speichern; Zeilen werden abgeglichen, damit der Lernstand erhalten bleibt */
export async function saveUnit(p: { id?: string; subject: Subject; title: string; subtitle: string; rows: Row[]; removed: string[] }) {
  let unitId = p.id;
  if (unitId) ok(await supabase.from('units').update({ title: p.title, subtitle: p.subtitle || null }).eq('id', unitId));
  else unitId = (ok(await supabase.from('units').insert({ subject: p.subject, title: p.title, subtitle: p.subtitle || null }).select('id').single()) as { id: string }).id;
  if (p.removed.length) ok(await supabase.from('vocab').delete().in('id', p.removed));
  const clean = p.rows.filter((r) => r.term.trim() && r.translation.trim());
  const existing = clean.map((r, i) => ({ r, i })).filter((x) => x.r.id);
  const fresh = clean.map((r, i) => ({ r, i })).filter((x) => !x.r.id);
  for (const { r, i } of existing) {
    ok(await supabase.from('vocab').update({ position: i, section: r.section.trim() || null, term: r.term.trim(), ipa: r.ipa.trim() || null, translation: r.translation.trim() }).eq('id', r.id!));
  }
  if (fresh.length) {
    ok(await supabase.from('vocab').insert(fresh.map(({ r, i }) => ({ unit_id: unitId, position: i, section: r.section.trim() || null, term: r.term.trim(), ipa: r.ipa.trim() || null, translation: r.translation.trim() }))));
  }
  return unitId!;
}
export async function deleteUnit(id: string) { ok(await supabase.from('units').delete().eq('id', id)); }
export async function recordAnswer(vocabId: string, correct: boolean) {
  await supabase.rpc('record_answer', { p_vocab: vocabId, p_correct: correct });
}

export async function myProfile(): Promise<Profile | null> {
  const { data: s } = await supabase.auth.getUser();
  if (!s.user) return null;
  const { data } = await supabase.from('profiles').select('*').eq('id', s.user.id).single();
  return (data as Profile) || null;
}
export async function updateMyProfile(id: string, patch: { display_name?: string | null; parent_email?: string | null }) {
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
