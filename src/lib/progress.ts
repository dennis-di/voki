// Fortschritt: Lernstufen, Serie mit Joker, Tagesziel, Test-Countdown, Voki-Accessoires.
import type { Activity, Exam, Stat, Unit, Vocab } from './types';
import { isWord } from './types';

/** Datum als JJJJ-MM-TT. Server rechnet in UTC, also hier auch (für Serie und XP). */
export const utcDay = (d = new Date()) => d.toISOString().slice(0, 10);
/** Lokales Datum (für Testtermine, die man im Kalender auswählt) */
export const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (day: string, n: number) => { const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const weekKey = (day: string) => { const d = new Date(day + 'T12:00:00Z'); const wd = (d.getUTCDay() + 6) % 7; return addDays(day, -wd); };
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);

export const levelOf = (s?: Stat) => s?.level ?? (s?.last_correct ? 1 : 0);

/**
 * Serie: Tage in Folge, an denen das Tagesziel erreicht wurde.
 * Pro Kalenderwoche darf ein Tag ausfallen (Joker), ohne dass die Serie reisst. Heute zählt erst, wenn erreicht.
 */
export function streakInfo(acts: Activity[], goal: number) {
  const done = new Set(acts.filter((a) => a.correct >= goal).map((a) => a.day));
  const today = utcDay();
  let day = done.has(today) ? today : addDays(today, -1);
  let streak = 0;
  const jokerUsed = new Set<string>();
  for (let guard = 0; guard < 400; guard++) {
    if (done.has(day)) { streak++; day = addDays(day, -1); continue; }
    const wk = weekKey(day);
    // Ein Fehltag pro Woche wird überbrückt, aber nur, wenn davor wieder geübt wurde
    if (!jokerUsed.has(wk) && streak > 0 && done.has(addDays(day, -1))) { jokerUsed.add(wk); day = addDays(day, -1); continue; }
    break;
  }
  const todayAct = acts.find((a) => a.day === today);
  return {
    streak,
    todayCorrect: todayAct?.correct ?? 0,
    todayXp: todayAct?.xp ?? 0,
    goalReached: done.has(today),
    jokerThisWeek: jokerUsed.has(weekKey(today)),
    lastActive: acts.length ? acts[acts.length - 1].day : null,
  };
}

/** Wie geht es Voki? */
export type Mood = 'neutral' | 'happy' | 'proud' | 'sad' | 'sleepy' | 'wow';
export function homeMood(info: ReturnType<typeof streakInfo>): Mood {
  if (info.goalReached) return 'proud';
  if (!info.lastActive || daysBetween(info.lastActive, utcDay()) >= 2) return 'sleepy';
  if (info.todayCorrect > 0) return 'happy';
  return 'neutral';
}

/** Accessoires: eins pro gemeisterter Unit (alle Wörter auf Stufe 3) */
export const ACCESSORIES = [
  { id: 'beret', name: 'Baskenmütze' },
  { id: 'scarf', name: 'Schal' },
  { id: 'glasses', name: 'Brille' },
  { id: 'baguette', name: 'Baguette' },
  { id: 'eiffel', name: 'Eiffelturm' },
  { id: 'crown', name: 'Krone' },
] as const;
export type AccessoryId = typeof ACCESSORIES[number]['id'];
export function masteredUnits(units: Unit[], vocab: Vocab[], stats: Stat[]) {
  const by = new Map(stats.map((s) => [s.vocab_id, s]));
  return units.filter((u) => {
    const ws = vocab.filter((v) => v.unit_id === u.id && isWord(v));
    return ws.length > 0 && ws.every((v) => levelOf(by.get(v.id)) >= 3);
  });
}
export const unlockedAccessories = (mastered: number) => ACCESSORIES.slice(0, Math.min(mastered, ACCESSORIES.length)).map((a) => a.id);

/** Test-Countdown: wie viele Wörter heute dran sind */
export function examPlan(exam: Exam, vocab: Vocab[], stats: Stat[]) {
  const by = new Map(stats.map((s) => [s.vocab_id, s]));
  const words = vocab.filter((v) => isWord(v) && (exam.unit_ids.length === 0 || exam.unit_ids.includes(v.unit_id)));
  const open = words.filter((v) => levelOf(by.get(v.id)) < 3);
  const daysLeft = daysBetween(localDay(), exam.day);
  // Bis zum Vortag fertig werden; am Vortag Generalprobe
  const learnDays = Math.max(1, daysLeft - 1);
  // Jedes offene Wort braucht im Schnitt noch ein paar Wiederholungen, darum lieber etwas mehr pro Tag
  const today = Math.min(open.length, Math.max(5, Math.ceil(open.length / learnDays)));
  // Zuerst die schwächsten, dann die, die am längsten nicht dran waren
  const queue = [...open].sort((a, b) => levelOf(by.get(a.id)) - levelOf(by.get(b.id)) || (by.get(a.id)?.last_seen || '').localeCompare(by.get(b.id)?.last_seen || ''));
  return { words, open, daysLeft, today, queue: queue.slice(0, today), rehearsal: daysLeft <= 1 };
}
