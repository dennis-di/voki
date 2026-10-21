import { createClient } from '@supabase/supabase-js';

// Öffentliche Werte (dürfen im Code stehen; geschützt wird über die Zugriffsregeln in der Datenbank)
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://kjeuvgvsakhstyhqarat.supabase.co';
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_hzTJS0Lv6uE7WQ8I2ptZHA_hxdKEL_a';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'vw-auth' },
});

export const LOGIN_DOMAIN = 'users.vokabel.example.com';
export const loginEmail = (username: string) => `${username.trim().toLowerCase()}@${LOGIN_DOMAIN}`;

/** Server-Funktion aufrufen; liefert { data } oder { error: code } */
export async function callFn<T = unknown>(name: string, body: unknown, withAuth = true): Promise<{ data?: T; error?: string }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', apikey: SUPABASE_KEY };
  if (withAuth) {
    const { data } = await supabase.auth.getSession();
    if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, { method: 'POST', headers, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) return { error: j.error || `http_${r.status}` };
    return { data: j as T };
  } catch {
    return { error: 'network' };
  }
}
