// Funktion: signup · Konto mit Einladungscode anlegen · "Verify JWT" AUS
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

const LOGIN_DOMAIN = 'users.vokabel.example.com';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ error: 'bad_request' }, 400); }

  const code = String(b.code || '').trim().toUpperCase();
  const username = String(b.username || '').trim().toLowerCase();
  const password = String(b.password || '');
  const displayName = String(b.display_name || '').trim().slice(0, 40) || null;
  const parentEmail = String(b.parent_email || '').trim().slice(0, 120) || null;

  if (!/^[a-z0-9._-]{3,24}$/.test(username)) return json({ error: 'bad_username' }, 400);
  if (password.length < 8) return json({ error: 'weak_password' }, 400);
  if (!code) return json({ error: 'bad_code' }, 400);

  const { data: taken } = await admin.from('profiles').select('id').eq('username', username).maybeSingle();
  if (taken) return json({ error: 'username_taken' }, 409);

  // Einladung reservieren (Zähler runter), erst dann Konto anlegen
  const { data: inv } = await admin.from('invites').select('*').eq('code', code).maybeSingle();
  if (!inv || inv.uses_left < 1 || (inv.expires_at && new Date(inv.expires_at) < new Date())) return json({ error: 'bad_code' }, 400);
  const { data: reserved } = await admin.from('invites').update({ uses_left: inv.uses_left - 1 })
    .eq('code', code).eq('uses_left', inv.uses_left).select('code');
  if (!reserved?.length) return json({ error: 'bad_code' }, 409);
  const restore = () => admin.from('invites').update({ uses_left: inv.uses_left }).eq('code', code);

  const email = `${username}@${LOGIN_DOMAIN}`;
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { username },
  });
  if (cErr || !created.user) {
    await restore();
    return json({ error: /already/i.test(cErr?.message || '') ? 'username_taken' : 'create_failed' }, 400);
  }
  const { error: pErr } = await admin.from('profiles').insert({
    id: created.user.id, username, display_name: displayName, parent_email: parentEmail,
    role: inv.role, ai_access: inv.ai_access,
  });
  if (pErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    await restore();
    return json({ error: 'create_failed' }, 400);
  }
  return json({ ok: true, email });
});
