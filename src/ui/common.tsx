import { useEffect, useState } from 'react';

let push: ((t: string) => void) | null = null;
export const toast = (t: string) => push?.(t);
export function Toaster() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    push = (t) => { setMsg(t); clearTimeout(timer); timer = setTimeout(() => setMsg(null), 2600); };
    return () => { push = null; };
  }, []);
  return msg ? <div className="toast glass" role="status">{msg}</div> : null;
}
/** Logo: positiv im hellen, negativ im dunklen Modus */
export function Logo({ height = 28 }: { height?: number }) {
  return (
    <span className="logo-wrap" style={{ height }} role="img" aria-label="Voki">
      <img className="logo-pos" src="/brand/voki-logo.svg" alt="" style={{ height }} />
      <img className="logo-neg" src="/brand/voki-logo-neg.svg" alt="" style={{ height: height * 1.083 }} />
    </span>
  );
}
/** Zahnrad oben rechts */
export function SettingsButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="ib gear" onClick={onClick} aria-label="Einstellungen">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
    </button>
  );
}
export function Background() {
  return <div className="bg" aria-hidden="true"><i /><i /><i /><i /></div>;
}
export async function copyText(t: string) {
  try { await navigator.clipboard.writeText(t); toast('Kopiert'); }
  catch { toast('Kopieren ging nicht. Bitte markieren und kopieren.'); }
}
export const randomCode = (prefix = '') => {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const r = crypto.getRandomValues(new Uint32Array(6));
  return prefix + Array.from(r, (x) => a[x % a.length]).join('');
};
