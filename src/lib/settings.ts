import { useSyncExternalStore } from 'react';
import type { Subject } from './types';

export interface Settings {
  theme: 'system' | 'light' | 'dark';
  subject: Subject;
  rate: number;
  spell: boolean;
  again: boolean;
  loop: boolean;
  spellLang: 'target' | 'de';
  builtinLetters: boolean;
  male: boolean;
  voice: Partial<Record<'fr' | 'en' | 'de', string>>;
  autoNext: boolean;
  dailyGoal: number;
  v?: number;
}
const DEFAULTS: Settings = { theme: 'system', subject: 'fr', rate: 0.85, spell: true, again: true, loop: false, spellLang: 'de', builtinLetters: true, male: true, voice: {}, autoNext: true, dailyGoal: 10, v: 2 };
const KEY = 'vw:settings';
let state: Settings = DEFAULTS;
try {
  const stored = JSON.parse(localStorage.getItem(KEY) || '{}');
  state = { ...DEFAULTS, ...stored };
  // v2: Buchstabieren standardmässig auf Deutsch (einmalig für bestehende Geräte)
  if (!stored.v || stored.v < 2) { state = { ...state, spellLang: 'de', v: 2 }; localStorage.setItem(KEY, JSON.stringify(state)); }
} catch { /* privat */ }
const subs = new Set<() => void>();

export const getSettings = () => state;
export function setSettings(patch: Partial<Settings>) {
  state = { ...state, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* privat */ }
  applyTheme();
  subs.forEach((f) => f());
}
export function useSettings(): Settings {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state);
}
export function applyTheme() {
  const t = state.theme;
  if (t === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}
