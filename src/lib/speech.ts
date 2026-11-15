// Sprachausgabe: Wörter über die Stimmen des Geräts, Buchstaben über eingebaute Aufnahmen.
import { useSyncExternalStore } from 'react';
import { getSettings } from './settings';
import { sayText, spellText } from './text';
import type { Subject, Vocab } from './types';

type Lang = 'fr' | 'en' | 'de';
const BCP: Record<Lang, string> = { fr: 'fr-FR', en: 'en-GB', de: 'de-DE' };
const synth: SpeechSynthesis | undefined = typeof window !== 'undefined' ? window.speechSynthesis : undefined;

/* ───────── Stimmen ───────── */
const MALE: Record<Lang, RegExp> = {
  fr: /\b(thomas|daniel|paul|henri|r[ée]my|j[ée]r[ôo]me|jacques|alain|yves|nicolas|antoine|maxime|male|masculin)\b|fr-fr-x-(frd|vlf)/i,
  en: /\b(daniel|arthur|oliver|george|ryan|guy|eric|aaron|fred|rishi|thomas|alfie|elliot|male)\b|en-gb-x-(gbd|rjs)/i,
  de: /\b(yannick|markus|martin|stefan|conrad|killian|florian|ralf|bernd|christoph|kasper|klaus|hans|viktor|jonas|male|männlich)\b|de-de-x-(deb|deg)/i,
};
const ROBOT = /\b(eddy|reed|rocko|grandpa|grandma|sandy|shelley|flo)\b/i;
let voiceList: SpeechSynthesisVoice[] = [];
const vsubs = new Set<() => void>();
function loadVoices() { voiceList = synth?.getVoices() || []; vsubs.forEach((f) => f()); }
if (synth) { loadVoices(); synth.addEventListener?.('voiceschanged', loadVoices); }
export const voicesFor = (l: Lang) => voiceList.filter((v) => v.lang?.toLowerCase().replace('_', '-').startsWith(l));
export function useVoices() { return useSyncExternalStore((f) => { vsubs.add(f); return () => vsubs.delete(f); }, () => voiceList); }
export function pickVoice(l: Lang): SpeechSynthesisVoice | null {
  const s = getSettings();
  const c = voicesFor(l);
  const wanted = s.voice[l];
  if (wanted) { const w = c.find((v) => v.voiceURI === wanted); if (w) return w; }
  const region = BCP[l].toLowerCase();
  const score = (v: SpeechSynthesisVoice) => (v.lang.toLowerCase().replace('_', '-') === region ? 4 : 0)
    + (/premium|enhanced|natural|neural|google|erweitert|optimiert/i.test(v.name) ? 2 : 0) + (v.localService ? 1 : 0)
    + (s.male && MALE[l].test(`${v.name} ${v.voiceURI}`) ? 10 : 0) + (ROBOT.test(v.name) ? -8 : 0)
    + (s.male && /female|weiblich/i.test(v.name) ? -5 : 0);
  return [...c].sort((a, b) => score(b) - score(a))[0] || null;
}
export const hasSpeech = !!synth;

/* ───────── Ton freischalten (iPhone: Lautlos-Schalter, Medienlautstärke) ─────────
   iOS behandelt Webseiten-Ton standardmässig wie Klingeltöne: Der Lautlos-Schalter macht ihn stumm.
   Solange auf der Seite ein Medien-Element läuft, gilt die „Wiedergabe“-Kategorie wie bei Musik:
   Lautlos-Schalter wird ignoriert, Lautstärke über die Tasten. Darum läuft während des Vorlesens
   leise eine stumme Tonspur im Hintergrund mit. */
const clip = typeof Audio !== 'undefined' ? new Audio() : null;
if (clip) { clip.setAttribute('playsinline', ''); clip.preload = 'auto'; }
let unlocked = false;
const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';

/** 2 Sekunden Stille als WAV (8 kHz, 8 bit) – zum Endlos-Abspielen */
function silentWav(): string {
  const n = 16000, b = new Uint8Array(44 + n), d = new DataView(b.buffer);
  const w = (o: number, t: string) => [...t].forEach((c, i) => (b[o + i] = c.charCodeAt(0)));
  w(0, 'RIFF'); d.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt '); d.setUint32(16, 16, true);
  d.setUint16(20, 1, true); d.setUint16(22, 1, true); d.setUint32(24, 8000, true); d.setUint32(28, 8000, true);
  d.setUint16(32, 1, true); d.setUint16(34, 8, true); w(36, 'data'); d.setUint32(40, n, true); b.fill(128, 44);
  return URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
}
const keep = typeof Audio !== 'undefined' ? new Audio() : null;
if (keep) { keep.setAttribute('playsinline', ''); keep.loop = true; keep.preload = 'auto'; try { keep.src = silentWav(); } catch { /* alt */ } }
let keepTimer: ReturnType<typeof setTimeout> | undefined;
/** Wiedergabe-Modus halten: stumme Spur läuft, bis 25 s lang nichts mehr gesprochen wurde */
function holdPlayback() {
  clearTimeout(keepTimer);
  try { (navigator as unknown as { audioSession?: { type: string } }).audioSession!.type = 'playback'; } catch { /* nicht vorhanden */ }
  if (keep && keep.paused) keep.play().catch(() => { /* braucht Antippen */ });
  keepTimer = setTimeout(() => { try { keep?.pause(); } catch { /* egal */ } }, 25000);
}
export function unlockAudio() {
  holdPlayback();
  if (unlocked || !clip) return;
  unlocked = true;
  clip.src = SILENT; clip.play().catch(() => { /* egal */ });
}
// Nach Rückkehr in die App den Modus erneut setzen
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { try { keep?.pause(); } catch { /* egal */ } } });

/* ───────── Grundfunktionen ───────── */
export function say(text: string, lang: Lang, rate = getSettings().rate): Promise<void> {
  return new Promise((res) => {
    if (!synth || !text) return res();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = BCP[lang]; const v = pickVoice(lang); if (v) u.voice = v;
    u.rate = rate; u.volume = 1; u.pitch = 1;
    let done = false;
    const fin = () => { if (!done) { done = true; clearTimeout(t); res(); } };
    u.onend = fin; u.onerror = fin;
    const t = setTimeout(fin, 2500 + (text.length * 170) / rate);
    holdPlayback();
    // iOS: hängende Sprachausgabe lösen, sonst bleibt sie manchmal stumm
    try { if (synth.paused) synth.resume(); } catch { /* egal */ }
    synth.speak(u);
  });
}
function playClip(src: string): Promise<void> {
  return new Promise((res) => {
    if (!clip) return res();
    let done = false;
    const fin = () => { if (!done) { done = true; clearTimeout(t); clip.onended = clip.onerror = null; res(); } };
    clip.onended = fin; clip.onerror = fin;
    const r = Math.max(0.7, Math.min(1.2, getSettings().rate / 0.85));
    // Aufnahme selbst ist Medienton; stumme Spur kurz anhalten, damit sich die beiden nicht stören
    try { keep?.pause(); } catch { /* egal */ }
    clip.src = src; clip.defaultPlaybackRate = r; clip.playbackRate = r;
    const t = setTimeout(fin, 6000);
    clip.play().catch(fin);
  });
}
function stopSound() { synth?.cancel(); try { clip?.pause(); clip?.onended?.(new Event('ended')); } catch { /* egal */ } }

/* Buchstaben */
let manifest: Record<string, string> | null = null;
fetch('/audio/manifest.json').then((r) => r.json()).then((m) => { manifest = m; }).catch(() => { manifest = {}; });
const NAMES: Record<Lang, Record<string, string>> = {
  fr: Object.fromEntries('abcdefghijklmnopqrstuvwxyz'.split('').map((c, i) => [c, ['a','bé','cé','dé','e','effe','gé','ache','i','ji','ka','elle','aime','enne','o','pé','ku','erre','esse','té','u','vé','double vé','ixe','i grec','zède'][i]])),
  en: Object.fromEntries('abcdefghijklmnopqrstuvwxyz'.split('').map((c, i) => [c, ['ay','bee','see','dee','ee','eff','gee','aitch','eye','jay','kay','el','em','en','oh','pee','cue','ar','ess','tee','you','vee','double you','ex','why','zed'][i]])),
  de: Object.fromEntries('abcdefghijklmnopqrstuvwxyz'.split('').map((c, i) => [c, ['Ah','Beh','Zeh','Deh','Eh','Eff','Geh','Hah','Ih','Jott','Kah','Ell','Emm','Enn','Oh','Peh','Kuh','Err','Ess','Teh','Uh','Fau','Weh','Ix','Üpsilon','Zett'][i]])),
};
const ACC: Record<string, [string, string]> = { 'é': ['e', 'aigu'], 'è': ['e', 'grave'], 'ê': ['e', 'circ'], 'ë': ['e', 'trema'], 'à': ['a', 'grave'], 'â': ['a', 'circ'], 'î': ['i', 'circ'], 'ï': ['i', 'trema'], 'ô': ['o', 'circ'], 'ù': ['u', 'grave'], 'û': ['u', 'circ'], 'ü': ['u', 'trema'], 'ç': ['c', 'cedil'], 'ä': ['a', 'trema'], 'ö': ['o', 'trema'], 'ñ': ['n', 'tilde'] };
const ACCN: Record<Lang, Record<string, string>> = {
  fr: { aigu: 'accent aigu', grave: 'accent grave', circ: 'accent circonflexe', trema: 'tréma', cedil: 'cédille', tilde: 'tilde' },
  en: { aigu: 'acute', grave: 'grave', circ: 'circumflex', trema: 'umlaut', cedil: 'cedilla', tilde: 'tilde' },
  de: { aigu: 'mit Accent aigu', grave: 'mit Accent grave', circ: 'mit Accent circonflexe', trema: 'mit Trema', cedil: 'mit Cedille', tilde: 'mit Tilde' },
};
function letterName(ch: string, lang: Lang): string | null {
  const lo = ch.toLowerCase(), up = ch !== lo;
  let n: string | null = NAMES[lang][lo] ?? null;
  if (!n && ACC[lo]) { const [b, a] = ACC[lo]; n = `${NAMES[lang][b]} ${ACCN[lang][a]}`; }
  if (!n && lo === 'œ') n = lang === 'fr' ? 'o e collés' : 'O E';
  if (!n && lo === 'ß') n = lang === 'de' ? 'Eszett' : 'sharp s';
  if (ch === "'" || ch === '’') return lang === 'fr' ? 'apostrophe' : lang === 'en' ? 'apostrophe' : 'Apostroph';
  if (ch === '-') return lang === 'fr' ? 'tiret' : lang === 'en' ? 'hyphen' : 'Bindestrich';
  if (!n) return null;
  if (up) return lang === 'fr' ? `${n} majuscule` : lang === 'en' ? `capital ${n}` : `großes ${n}`;
  return n;
}
function speakLetter(ch: string, lang: Lang): Promise<void> | null {
  const c = ch === '’' ? "'" : ch;
  if (getSettings().builtinLetters && manifest?.[lang]?.includes(c)) {
    const hex = [...c].map((x) => x.codePointAt(0)!.toString(16)).join('-');
    return playClip(`/audio/${lang}/${hex}.mp3`);
  }
  const n = letterName(c, lang);
  return n ? say(n, lang, Math.min(getSettings().rate, 0.9)) : null;
}

/* ───────── Abspieler ───────── */
export interface PlayerState {
  queue: Vocab[]; pos: number; playing: boolean; single: boolean; only: 'spell' | null; scope: string; swing: boolean;
  activeId: string | null; spell: { id: string; chars: string[]; idx: number } | null;
}
let st: PlayerState = { queue: [], pos: 0, playing: false, single: false, only: null, scope: '', swing: false, activeId: null, spell: null };
let run = 0, subject: Subject = 'fr';
const psubs = new Set<() => void>();
const emit = (patch: Partial<PlayerState>) => { st = { ...st, ...patch }; psubs.forEach((f) => f()); };
export function usePlayer() { return useSyncExternalStore((f) => { psubs.add(f); return () => psubs.delete(f); }, () => st); }
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

let wakeLock: { release: () => Promise<void> } | null = null;
async function wake(on: boolean) {
  try {
    const nav = navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } };
    if (on && !wakeLock && nav.wakeLock) wakeLock = await nav.wakeLock.request('screen');
    if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch { wakeLock = null; }
}

export function stopPlayer() { run++; stopSound(); emit({ playing: false, spell: null }); wake(false); }
export function startPlayer(queue: Vocab[], pos: number, subj: Subject, opts: { single?: boolean; only?: 'spell' | null; scope?: string; swing?: boolean } = {}) {
  unlockAudio(); stopSound();
  subject = subj;
  const my = ++run;
  emit({ queue, pos, single: !!opts.single, only: opts.only ?? null, scope: opts.scope ?? (opts.single ? 'Vokabel' : st.scope), swing: !!opts.swing, playing: true, spell: null });
  wake(true);
  loop(my);
}
export function stepPlayer(d: number) {
  if (!st.queue.length) return;
  const np = Math.max(0, Math.min(st.queue.length - 1, st.pos + d));
  startPlayer(st.queue, np, subject, { single: st.single, scope: st.scope, swing: st.swing });
}
export function togglePlayer() {
  if (st.playing) stopPlayer();
  else if (st.queue.length) startPlayer(st.queue, st.pos, subject, { single: st.single, only: st.only, scope: st.scope, swing: st.swing });
}
async function loop(my: number) {
  while (run === my) {
    await playItem(st.queue[st.pos], my);
    if (run !== my) return;
    const loopOn = getSettings().loop;
    if (st.single) { if (loopOn) { await wait(1200); continue; } break; }
    if (st.pos < st.queue.length - 1) { emit({ pos: st.pos + 1 }); await wait(800); continue; }
    if (loopOn) { emit({ pos: 0 }); await wait(1600); continue; }
    break;
  }
  if (run === my) { emit({ playing: false, spell: null }); wake(false); }
}
async function playItem(v: Vocab | undefined, my: number) {
  if (!v) return;
  const s = getSettings();
  emit({ activeId: v.id, spell: null });
  const term = sayText(v.term, subject), tr = sayText(v.translation, 'de');
  if (st.swing) {
    // Schaukel-Modus: Wort, Zeit zum Mitsagen, Übersetzung, Pause. Ohne Buchstabieren.
    await say(term, subject); if (run !== my) return;
    await wait(2600); if (run !== my) return;
    await say(tr, 'de'); if (run !== my) return;
    await wait(1600);
    return;
  }
  if (st.only !== 'spell') {
    await say(term, subject); if (run !== my) return;
    await wait(450); if (run !== my) return;
    await say(tr, 'de'); if (run !== my) return;
  }
  if (s.spell || st.only === 'spell') {
    if (st.only !== 'spell') await wait(600);
    if (run !== my) return;
    await spellWord(v.id, spellText(v.term), my);
    if (run !== my) return;
    if (s.again) { await wait(450); if (run !== my) return; await say(term, subject); }
  }
}
async function spellWord(id: string, word: string, my: number) {
  const lang: Lang = getSettings().spellLang === 'de' ? 'de' : subject;
  const chars = [...word.normalize('NFC')];
  for (let i = 0; i < chars.length; i++) {
    if (run !== my) return;
    emit({ spell: { id, chars, idx: i } });
    if (/\s/.test(chars[i])) { await wait(420); continue; }
    const p = speakLetter(chars[i], lang);
    if (!p) { await wait(100); continue; }
    await p; await wait(130);
  }
  emit({ spell: { id, chars, idx: chars.length } });
}

/** Für Test und Einstellungen: ein Wort sprechen (und optional buchstabieren) */
let qrun = 0;
export async function speakOnce(text: string, lang: Lang, spellIt = false) {
  unlockAudio(); stopPlayer(); stopSound();
  const my = ++qrun;
  await say(lang === 'de' ? sayText(text, 'de') : sayText(text, lang), lang);
  if (!spellIt || qrun !== my) return;
  await wait(400);
  const sl: Lang = getSettings().spellLang === 'de' ? 'de' : lang;
  for (const ch of [...spellText(text).normalize('NFC')]) {
    if (qrun !== my) return;
    if (/\s/.test(ch)) { await wait(380); continue; }
    const p = speakLetter(ch, sl); if (p) { await p; await wait(120); }
  }
}
export function stopOnce() { qrun++; stopSound(); }
