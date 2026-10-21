// Funktion: admin · Passwort zurücksetzen, Konto löschen (nur für Admins) · "Verify JWT" AUS
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

function secretKey(): string {
  try {
    const k = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default;
    if (k) return k;
  } catch { /* ältere Projekte: Service-Role-Key */ }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
}
const admin = createClient(Deno.env.get('SUPABASE_URL')!, secretKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Angemeldeten Benutzer aus dem Authorization-Header lesen, samt Profil. */
async function caller(req: Request) {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token || token.startsWith('sb_')) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: profile } = await admin.from('profiles').select('*').eq('id', data.user.id).single();
  if (!profile) return null;
  return { user: data.user, profile };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const me = await caller(req);
  if (!me) return json({ error: 'unauthorized' }, 401);
  if (me.profile.role !== 'admin') return json({ error: 'forbidden' }, 403);
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const userId = String(b.user_id || '');
  if (!/^[0-9a-f-]{36}$/.test(userId)) return json({ error: 'bad_request' }, 400);

  if (b.action === 'reset_password') {
    const password = String(b.password || '');
    if (password.length < 8) return json({ error: 'weak_password' }, 400);
    const { error } = await admin.auth.admin.updateUserById(userId, { password });
    return error ? json({ error: 'failed' }, 400) : json({ ok: true });
  }
  if (b.action === 'delete_user') {
    if (userId === me.user.id) return json({ error: 'forbidden' }, 403);
    const { error } = await admin.auth.admin.deleteUser(userId);
    return error ? json({ error: 'failed' }, 400) : json({ ok: true });
  }
  return json({ error: 'bad_request' }, 400);
});
