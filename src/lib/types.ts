export type Subject = 'fr' | 'en';
export interface Profile { id: string; username: string; display_name: string | null; parent_email: string | null; role: 'admin' | 'member'; ai_access: 'none' | 'owner'; created_at: string }
export interface Unit { id: string; owner_id: string; subject: Subject; title: string; subtitle: string | null; created_at: string; updated_at: string }
export interface Vocab { id: string; unit_id: string; position: number; section: string | null; term: string; ipa: string | null; translation: string }
export interface Stat { vocab_id: string; correct: number; wrong: number; last_correct: boolean | null; last_seen: string | null }
export interface Invite { code: string; note: string | null; role: 'admin' | 'member'; ai_access: 'none' | 'owner'; uses_left: number; expires_at: string | null; created_at: string }
/** Zeile im Editor (id fehlt bei neuen Zeilen) */
export interface Row { key: string; id?: string; section: string; term: string; ipa: string; translation: string }

export const SUBJECTS: Record<Subject, { name: string; lang: string; short: string; hello: string }> = {
  fr: { name: 'Französisch', lang: 'fr-FR', short: 'FR', hello: 'Bonjour' },
  en: { name: 'Englisch', lang: 'en-GB', short: 'EN', hello: 'Hello' },
};
