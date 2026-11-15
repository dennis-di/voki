// Funktion: read-photo · Vokabeln vom Foto lesen (Claude) · "Verify JWT" AUS
// Secret im Dashboard setzen: ANTHROPIC_API_KEY (dein Schlüssel, nur für Konten mit Claude-Zugang)
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

const MODEL = 'claude-sonnet-5-5';
const OWNER_DAILY_LIMIT = 40; // Fotos pro Tag und Kind über deinen Schlüssel

const LANG = { fr: 'Französisch', en: 'Englisch' } as const;

function prompt(subject: 'fr' | 'en') {
  const L = LANG[subject];
  const ex = subject === 'fr'
    ? '{"title":"Unité 2 · Les copains et les activités","page":"163","sections":[{"name":"A1","items":[{"kind":"word","term":"une activité","ipa":"ynaktivite","translation":"eine Freizeitbeschäftigung; eine Aktivität","gender":"f","plural":"","note":"","examples":[]},{"kind":"word","term":"aimer qn/qc","ipa":"eme","translation":"jdn./etw. lieben; jemanden/etwas mögen","gender":"","plural":"","note":"","examples":[{"fr":"J\'aime le sport.","de":"Ich mag Sport."}]},{"kind":"word","term":"un jeu vidéo","ipa":"ɛ̃ʒøvideo","translation":"ein Computerspiel","gender":"m","plural":"des jeux vidéo","note":"","examples":[]},{"kind":"rule","text":"Un jeu / des jeux: Jeu bekommt im Plural ein -x. Man schreibt es, aber man spricht es nicht!"}]}]}'
    : '{"title":"Unit 1","page":"12","sections":[{"name":"A","items":[{"kind":"word","term":"to go","ipa":"ɡəʊ","translation":"gehen","gender":"","plural":"","note":"","examples":[{"fr":"Let\'s go!","de":"Los geht\'s!"}]}]}]}';
  return `Das Bild zeigt eine Vokabelseite aus einem ${L}-Schulbuch: links ${L} (oft mit [Lautschrift]), in der Mitte Deutsch, rechts oft eine dritte Spalte mit Beispielsätzen und Hinweisen.
Lies ALLE Einträge exakt in der Reihenfolge der Seite ab. Übernimm Schreibweise, Akzente, Apostrophe, Satzzeichen und Abkürzungen wie (fam.), (ugs.), qn/qc, sth., sb. genau so wie gedruckt.

Für jede Vokabel ein Item mit "kind":"word":
- "term": Wort/Ausdruck in der Fremdsprache inkl. Artikel (un, une, le, la, l'), ohne Lautschrift. Bei "un jeu vidéo / des jeux vidéo" nur die Einzahl in "term", die Mehrzahl in "plural".
- "ipa": Lautschrift ohne eckige Klammern (leer, wenn keine da ist).
- "translation": deutsche Bedeutung, wie gedruckt.
- "gender": "m" oder "f" für Nomen. Das Buch färbt den Artikel ein (blau = männlich, rot = weiblich); nutze die Farbe, den Artikel (le/un = m, la/une = f) oder "(f.)"/"(m.)". Bei Verben, Adjektiven, Ausdrücken: "".
- "examples": Beispielsätze aus der rechten Spalte, die zu DIESER Vokabel gehören (gleiche Zeile/Höhe), je {"fr": Satz in der Fremdsprache, "de": Übersetzung}. Das Feld heisst immer "fr", auch bei Englisch.
- "note": kurze Hinweise aus der rechten Spalte zu dieser Vokabel, z. B. "englisch: dance", "→ la danse (der Tanz)". Sonst "".

Farbig hinterlegte Merk-Kästen (meist orange, oft mit "!") und allgemeine Merksätze ohne eigene Vokabel ("Merke dir diese Abkürzungen …") als eigenes Item {"kind":"rule","text":"…"} an der Stelle, wo sie auf der Seite stehen. Den Text vollständig übernehmen, ohne Zeilenumbrüche.
Kästen wie "Tu te rappelles?" mit Wiederholungswörtern sind normale Vokabeln (Abschnitt "Wiederholung").
Abschnitte: Marker am Rand wie "A1", "A2", "A4" oder große Zahlen. Pro Abschnitt eine Section mit "name" = Marker. Vokabeln vor dem ersten Marker: Section mit leerem name (oder "Wiederholung" für den Erinnerungskasten).
"title": die Unit-Überschrift (z. B. "Unité 2 · Les copains et les activités"). "page": die gedruckte Seitenzahl als Ziffern, sonst "".
Seitenzahlen, Überschriften, Tipps zum Lernen allgemein (z. B. Schaukel-Tipp) sind KEINE Vokabeln und keine Regeln.
Antworte nur mit JSON in genau dieser Form:
${ex}`;
}

function promptV1(subject: 'fr' | 'en') {
  const L = LANG[subject];
  const ex = subject === 'fr'
    ? '{"title":"Au début","subtitle":"Seite 158","sections":[{"name":"1","items":[{"term":"Bienvenue!","ipa":"bjɛ̃vny","translation":"Willkommen!"}]}]}'
    : '{"title":"Unit 1","subtitle":"Seite 12","sections":[{"name":"A","items":[{"term":"to go","ipa":"ɡəʊ","translation":"gehen"}]}]}';
  return `Das Bild zeigt eine Vokabelseite aus einem ${L}-Schulbuch (${L} links, Deutsch rechts).
Lies ALLE Vokabeleinträge exakt in der Reihenfolge der Seite ab. Übernimm Schreibweise, Akzente, Apostrophe, Satzzeichen und Abkürzungen wie (fam.), (ugs.), (Adv.), sth., sb. genau so wie gedruckt.
Lautschrift in eckigen Klammern kommt ohne Klammern ins Feld "ipa" (leer lassen, wenn keine da ist).
Infokästen, Beispielsätze in Kästen, Seitenzahlen und Überschriften sind KEINE Vokabeln.
Gibt es nummerierte oder benannte Abschnitte (z. B. große Zahlen am Rand), lege pro Abschnitt eine Section an; "name" ist die Nummer oder der Name. Ohne Abschnitte: eine Section mit leerem name.
"title" ist die Seitenüberschrift, "subtitle" z. B. "Seite 158", falls eine Seitenzahl sichtbar ist.
Antworte nur mit JSON in genau dieser Form:
${ex}`;
}

function parseJson(text: string) {
  try { return JSON.parse(text); } catch { /* weiter */ }
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m) { try { return JSON.parse(m[1]); } catch { /* weiter */ } }
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s >= 0 && e > s) { try { return JSON.parse(text.slice(s, e + 1)); } catch { /* weiter */ } }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const me = await caller(req);
  if (!me) return json({ error: 'unauthorized' }, 401);

  // Welcher Schlüssel? 1. eigener, 2. deiner (wenn freigegeben), sonst keiner
  let key: string | null = null, viaOwner = false;
  const { data: own } = await admin.rpc('get_ai_key_for', { p_user: me.user.id });
  if (own) key = own as string;
  else if (me.profile.ai_access === 'owner') { key = Deno.env.get('ANTHROPIC_API_KEY') || null; viaOwner = true; }
  if (!key) return json({ error: 'no_key' }, 403);

  if (viaOwner) {
    const { data: n } = await admin.rpc('bump_ai_usage', { p_user: me.user.id });
    if ((n as number) > OWNER_DAILY_LIMIT) return json({ error: 'daily_limit' }, 429);
  }

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const subject = b.subject === 'en' ? 'en' : 'fr';
  const v2 = b.v === 2; // neue App: Seite, Genus, Beispiele, Regeln
  const image = String(b.image || '');
  const mediaType = ['image/jpeg', 'image/png', 'image/webp'].includes(String(b.media_type)) ? String(b.media_type) : 'image/jpeg';
  if (!image || image.length > 7_000_000) return json({ error: 'bad_image' }, 400);

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: v2 ? 12000 : 6000,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
        { type: 'text', text: v2 ? prompt(subject) : promptV1(subject) },
      ] }],
    }),
  });
  if (r.status === 401 || r.status === 403) return json({ error: 'bad_key' }, 400);
  if (r.status === 429) return json({ error: 'rate_limited' }, 429);
  if (r.status === 400) {
    const t = await r.text();
    return json({ error: /credit|billing|balance/i.test(t) ? 'no_credit' : 'failed' }, 400);
  }
  if (!r.ok) return json({ error: 'failed' }, 502);
  const data = await r.json();
  const text = (data.content || []).filter((c: { type: string }) => c.type === 'text').map((c: { text: string }) => c.text).join('');
  const parsed = parseJson(text);
  if (!parsed?.sections) return json({ error: 'unreadable' }, 422);
  const str = (x: unknown, n: number) => String(x ?? '').slice(0, n);
  if (v2) {
    const sections = (parsed.sections as Array<Record<string, unknown>>).map((sec) => ({
      name: str(sec.name, 40),
      items: ((sec.items as Array<Record<string, unknown>>) || []).flatMap((it) => {
        if (!it) return [];
        if (it.kind === 'rule') { const t = str(it.text ?? it.term, 600).trim(); return t ? [{ kind: 'rule', text: t }] : []; }
        if (!it.term || !it.translation) return [];
        return [{
          kind: 'word', term: str(it.term, 200), ipa: str(it.ipa, 120), translation: str(it.translation, 300),
          gender: it.gender === 'm' || it.gender === 'f' ? it.gender : '', plural: str(it.plural, 120), note: str(it.note, 400),
          examples: (Array.isArray(it.examples) ? it.examples : []).slice(0, 6).map((e: Record<string, unknown>) => ({ fr: str(e?.fr, 300), de: str(e?.de, 300) })).filter((e: { fr: string }) => e.fr),
        }];
      }),
    })).filter((sec) => sec.items.length);
    return json({ title: str(parsed.title, 80), page: str(parsed.page, 20).replace(/[^\d]/g, ''), sections, via: viaOwner ? 'owner' : 'own' });
  }
  const sections = (parsed.sections as Array<Record<string, unknown>>).map((s) => ({
    name: String(s.name ?? '').slice(0, 40),
    items: ((s.items as Array<Record<string, unknown>>) || [])
      .filter((it) => it && it.term && it.translation)
      .map((it) => ({ term: String(it.term).slice(0, 200), ipa: String(it.ipa ?? '').slice(0, 120), translation: String(it.translation).slice(0, 300) })),
  })).filter((s) => s.items.length);
  return json({ title: String(parsed.title ?? '').slice(0, 80), subtitle: String(parsed.subtitle ?? '').slice(0, 80), sections, via: viaOwner ? 'owner' : 'own' });
});
