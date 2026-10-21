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
}
const DEFAULTS: Settings = { theme: 'system', subject: 'fr', rate: 0.85, spell: true, again: true, loop: false, spellLang: 'target', builtinLetters: true, male: true, voice: {} };
const KEY = 'vw:settings';
let state: Settings = DEFAULTS;
try { state = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { /* privat */ }
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
