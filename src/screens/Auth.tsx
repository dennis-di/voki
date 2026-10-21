import { useState } from 'react';
import { callFn, loginEmail, supabase } from '../lib/supabase';
import { Logo } from '../ui/common';

const ERR: Record<string, string> = {
  bad_username: 'Der Benutzername braucht 3 bis 24 Zeichen: Buchstaben, Zahlen, Punkt, Strich.',
  weak_password: 'Das Passwort braucht mindestens 8 Zeichen.',
  bad_code: 'Diesen Einladungscode gibt es nicht oder er ist schon verbraucht.',
  username_taken: 'Diesen Benutzernamen gibt es schon. Nimm einen anderen.',
  create_failed: 'Das Konto konnte nicht angelegt werden. Bitte nochmal versuchen.',
  network: 'Keine Verbindung. Bist du online?',
};

export default function Auth() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [parent, setParent] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function login() {
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail(username), password });
    if (error) setErr(/invalid/i.test(error.message) ? 'Benutzername oder Passwort stimmt nicht.' : 'Anmelden hat nicht geklappt. Bist du online?');
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      if (mode === 'login') await login();
      else {
        const { error } = await callFn('signup', { code, username, password, display_name: name, parent_email: parent }, false);
        if (error) setErr(ERR[error] || 'Das Konto konnte nicht angelegt werden.');
        else await login();
      }
    } finally { setBusy(false); }
  }

  return (
    <main className="app auth">
      <div className="stack" style={{ gap: 22 }}>
        <Logo height={64} />
        <p className="muted" style={{ margin: 0, fontSize: '1.05rem' }}>Französisch und Englisch hören, buchstabieren, üben.</p>
      </div>
      <form className="glass pad stack" onSubmit={submit}>
        <div className="seg" role="group" aria-label="Anmelden oder registrieren">
          <button type="button" aria-pressed={mode === 'login'} onClick={() => { setMode('login'); setErr(''); }}>Anmelden</button>
          <button type="button" aria-pressed={mode === 'signup'} onClick={() => { setMode('signup'); setErr(''); }}>Neues Konto</button>
        </div>
        {mode === 'signup' && (
          <label className="f">Einladungscode
            <input className="inp code" id="code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" required placeholder="z. B. LARA-7KQ2PX" />
          </label>
        )}
        <label className="f">Benutzername
          <input className="inp" id="username" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ''))} autoCapitalize="off" autoCorrect="off" autoComplete="username" required minLength={3} maxLength={24} />
        </label>
        <label className="f">Passwort
          <input className="inp" id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'signup' ? 8 : 1} />
        </label>
        {mode === 'signup' && (<>
          <label className="f">Wie sollen wir dich nennen? <span className="hint">freiwillig</span>
            <input className="inp" id="dname" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
          </label>
          <label className="f">E-Mail eines Elternteils <span className="hint">freiwillig, nur für Rückfragen</span>
            <input className="inp" id="pmail" type="email" value={parent} onChange={(e) => setParent(e.target.value)} maxLength={120} />
          </label>
        </>)}
        {err && <div className="note err" role="alert">{err}</div>}
        <button className="btn primary block" disabled={busy}>{busy ? 'Einen Moment …' : mode === 'login' ? 'Anmelden' : 'Konto anlegen'}</button>
        {mode === 'login' && <p className="hint center">Passwort vergessen? Frag die Person, die dich eingeladen hat. Sie kann es zurücksetzen.</p>}
      </form>
    </main>
  );
}
