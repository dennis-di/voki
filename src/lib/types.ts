export type Subject = 'fr' | 'en';
export type Gender = 'm' | 'f';
export interface Example { fr: string; de: string }
export interface Profile { id: string; username: string; display_name: string | null; parent_email: string | null; role: 'admin' | 'member'; ai_access: 'none' | 'owner'; in_league?: boolean; created_at: string }
export interface Unit { id: string; owner_id: string; subject: Subject; title: string; subtitle: string | null; created_at: string; updated_at: string }
/** Eintrag einer Unit: Vokabel (kind 'word') oder Merk-Regel aus dem orangen Kasten (kind 'rule', Text in term) */
export interface Vocab {
  id: string; unit_id: string; position: number; section: string | null; term: string; ipa: string | null; translation: string;
  kind?: 'word' | 'rule'; page?: string | null; gender?: Gender | null; plural?: string | null; note?: string | null; examples?: Example[] | null;
}
export interface Stat { vocab_id: string; correct: number; wrong: number; last_correct: boolean | null; last_seen: string | null; level?: number; streak?: number }
export interface Activity { day: string; xp: number; answers: number; correct: number }
export interface Exam { id: string; subject: Subject; title: string; day: string; unit_ids: string[] }
export interface Invite { code: string; note: string | null; role: 'admin' | 'member'; ai_access: 'none' | 'owner'; uses_left: number; expires_at: string | null; created_at: string }
/** Zeile im Editor (id fehlt bei neuen Zeilen) */
export interface Row {
  key: string; id?: string; kind: 'word' | 'rule'; page: string; section: string; term: string; ipa: string; translation: string;
  gender: '' | Gender; plural: string; note: string; examples: Example[];
}

export const isWord = (v: Vocab) => (v.kind ?? 'word') === 'word';

export const SUBJECTS: Record<Subject, { name: string; lang: string; short: string; hello: string }> = {
  fr: { name: 'Französisch', lang: 'fr-FR', short: 'FR', hello: 'Bonjour' },
  en: { name: 'Englisch', lang: 'en-GB', short: 'EN', hello: 'Hello' },
};

/** Lernstufen */
export const LEVELS = ['Neu', 'Erkennt', 'Ordnet zu', 'Sitzt'] as const;
