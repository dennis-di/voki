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
export type Grade = 'ok' | 'accent' | 'almost' | 'bad';
export function grade(input: string, answer: string): Grade {
  const u = norm(input);
  if (!u) return 'bad';
  const vs = variants(answer);
  if (vs.includes(u)) return 'ok';
  const lu = loose(input);
  if (vs.some((v) => loose(v) === lu)) return 'accent';
  if (vs.some((v) => v.length > 3 && lev(loose(v), lu) <= 1)) return 'almost';
  return 'bad';
}

/** Einfaches Textformat „fremd = deutsch“, # beginnt Abschnitt */
export function parseLines(txt: string) {
  const rows: { section: string; term: string; ipa: string; translation: string }[] = [];
  let section = '';
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#')) { section = line.replace(/^#+\s*/, ''); continue; }
    const i = line.search(/\s=\s|=|\t|\s[–—-]\s/);
    if (i < 0) continue;
    const sep = line.slice(i).match(/^(\s=\s|=|\t|\s[–—-]\s)/)![0];
    let term = line.slice(0, i).trim();
    const translation = line.slice(i + sep.length).trim();
    let ipa = '';
    const m = term.match(/\[([^\]]*)\]\s*$/);
    if (m) { ipa = m[1].trim(); term = term.slice(0, m.index).trim(); }
    if (term && translation) rows.push({ section, term, ipa, translation });
  }
  return rows;
}
