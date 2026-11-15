// Textregeln: was vorgelesen, buchstabiert und im Test akzeptiert wird.

const TAGS = /\((?:fam|ugs|adv|Adv|f|m|pl|sg|n|v|adj|AE|BE|infml|fml|inf|form|bes|fig|o\.?\s?pl|no pl)\.?\)|\b(?:adv|fam|ugs|infml)\./gi;

const EXPAND: Record<string, Array<[RegExp, string]>> = {
  fr: [[/\bqc\b\.?/g, 'quelque chose'], [/\bqn\b\.?/g, "quelqu'un"]],
  en: [[/\bsth\b\.?/g, 'something'], [/\bsb\b\.?/g, 'somebody'], [/\bsb's\b/g, "somebody's"]],
  de: [[/\betw\.?/g, 'etwas'], [/\bjdn\.?/g, 'jemanden'], [/\bjdm\.?/g, 'jemandem'], [/\bjds\.?/g, 'jemandes'], [/\bjmd\.?/g, 'jemand']],
};

/** Text zum Vorlesen */
export function sayText(s: string, lang: 'fr' | 'en' | 'de') {
  let t = s.replace(TAGS, '');
  for (const [re, rep] of EXPAND[lang]) t = t.replace(re, rep);
  return t.replace(/[()[\]]/g, '').replace(/\s*;\s*/g, ', ').replace(/\s*\/\s*/g, ', ').replace(/\s+/g, ' ')
    .replace(/\s+([!?.,])/g, '$1').replace(/^[,\s]+|[,\s]+$/g, '').trim();
}

/** Text zum Buchstabieren (ohne Hinweise in Klammern) */
export function spellText(s: string) {
  return s.replace(TAGS, '').replace(/\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim()
    .replace(/[!?.,;:]+$/g, '').trim();
}

export const shuffle = <T,>(a: T[]): T[] => {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
};

const norm = (s: string) => s.toLowerCase().replace(/[’`´]/g, "'").replace(/[!?.,;:¡¿«»"]/g, ' ')
  .replace(/\s*'\s*/g, "'").replace(/\s+/g, ' ').trim();
const loose = (s: string) => norm(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/g, 'oe')
  .replace(/ß/g, 'ss').replace(/'/g, '').replace(/\s+/g, ' ');

function variants(ans: string) {
  const base = ans.replace(TAGS, '');
  const alts = base.split(/[;/]/).map((s) => s.trim()).filter(Boolean);
  const out = new Set<string>();
  const add = (a: string) => {
    out.add(a.replace(/[()]/g, ''));
    out.add(a.replace(/\([^)]*\)/g, ''));
    // „to go“ auch ohne „to“, „sth.“ / „qc“ optional
    out.add(a.replace(/^to\s+/i, '').replace(/[()]/g, ''));
    out.add(a.replace(/\b(sth|sb|qc|qn|etw|jdn|jdm|jmd)\b\.?/g, '').replace(/[()]/g, ''));
  };
  alts.forEach(add);
  add(base);
  return [...out].map(norm).filter(Boolean);
}
function lev(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
export type Grade = 'ok' | 'article' | 'accent' | 'almost' | 'bad';

/** Bestimmte und unbestimmte Artikel am Wortanfang */
const ART = /^(?:(le|la|les|un|une|des|du|the|a|an)\s+|(l)'\s*)/i;
export function splitArticle(term: string): { article: string; rest: string } {
  const m = term.match(ART);
  if (!m) return { article: '', rest: term };
  return { article: m[0].trimEnd(), rest: term.slice(m[0].length) };
}
/** Geschlecht aus dem Artikel ableiten (nur Französisch, l' bleibt offen) */
export function guessGender(term: string, subject: 'fr' | 'en'): '' | 'm' | 'f' {
  if (subject !== 'fr') return '';
  if (/\(\s*f\.?\s*\)/.test(term)) return 'f';
  if (/\(\s*m\.?\s*\)/.test(term)) return 'm';
  const a = splitArticle(term).article.toLowerCase();
  if (a === 'le' || a === 'un') return 'm';
  if (a === 'la' || a === 'une') return 'f';
  return '';
}
const noArt = (s: string) => s.replace(ART, '');

export function grade(input: string, answer: string): Grade {
  const u = norm(input);
  if (!u) return 'bad';
  const vs = variants(answer);
  if (vs.includes(u)) return 'ok';
  // Wort stimmt, nur der Artikel fehlt oder ist falsch
  const ua = noArt(u);
  if (vs.some((v) => ART.test(v) && noArt(v) === ua)) return 'article';
  const lu = loose(input);
  if (vs.some((v) => loose(v) === lu)) return 'accent';
  if (vs.some((v) => ART.test(v) && loose(noArt(v)) === loose(ua))) return 'article';
  if (vs.some((v) => v.length > 3 && lev(loose(v), lu) <= 1)) return 'almost';
  return 'bad';
}

/** Buchstaben-Vergleich: die richtige Lösung, falsche/fehlende Buchstaben markiert */
export interface DiffChar { ch: string; bad: boolean }
export function letterDiff(input: string, answer: string): { chars: DiffChar[]; extra: number } {
  const best = variants(answer).sort((x, y) => lev2(norm(input), x) - lev2(norm(input), y))[0] || norm(answer);
  const a = [...norm(input)], b = [...best];
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  const flags = new Array(b.length).fill(false);
  let i = a.length, j = b.length, extra = 0;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) { flags[j - 1] = a[i - 1] !== b[j - 1]; i--; j--; }
    else if (j > 0 && d[i][j] === d[i][j - 1] + 1) { flags[j - 1] = true; j--; }
    else { extra++; i--; }
  }
  return { chars: b.map((ch, k) => ({ ch, bad: flags[k] })), extra };
}
function lev2(a: string, b: string) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/** Einfaches Textformat:
 *  fremd = deutsch      Vokabel (optional [Lautschrift] am Ende des fremden Teils)
 *  # A1                 neuer Abschnitt
 *  @ 163                neue Seite
 *  ! Text               Regel (oranger Kasten)
 *  > satz = Satz        Beispielsatz zur Vokabel davor
 */
export function parseLines(txt: string, subject: 'fr' | 'en' = 'fr') {
  const rows: { kind: 'word' | 'rule'; page: string; section: string; term: string; ipa: string; translation: string; gender: '' | 'm' | 'f'; plural: string; note: string; examples: { fr: string; de: string }[] }[] = [];
  let section = '', page = '';
  const split = (line: string) => {
    const i = line.search(/\s=\s|=|\t|\s[–—-]\s/);
    if (i < 0) return null;
    const sep = line.slice(i).match(/^(\s=\s|=|\t|\s[–—-]\s)/)![0];
    return [line.slice(0, i).trim(), line.slice(i + sep.length).trim()] as const;
  };
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#')) { section = line.replace(/^#+\s*/, ''); continue; }
    if (line.startsWith('@')) { page = line.replace(/^@\s*(seite\s*)?/i, ''); continue; }
    if (line.startsWith('!')) { const t = line.replace(/^!\s*/, ''); if (t) rows.push({ kind: 'rule', page, section, term: t, ipa: '', translation: '', gender: '', plural: '', note: '', examples: [] }); continue; }
    if (line.startsWith('>')) {
      const p = split(line.replace(/^>\s*/, '')); const last = [...rows].reverse().find((r) => r.kind === 'word');
      if (p && last) last.examples.push({ fr: p[0], de: p[1] });
      continue;
    }
    const p = split(line);
    if (!p) continue;
    let term = p[0]; const translation = p[1];
    let ipa = '';
    const m = term.match(/\[([^\]]*)\]\s*$/);
    if (m) { ipa = m[1].trim(); term = term.slice(0, m.index).trim(); }
    if (term && translation) rows.push({ kind: 'word', page, section, term, ipa, translation, gender: guessGender(term, subject), plural: '', note: '', examples: [] });
  }
  return rows;
}
