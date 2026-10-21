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
