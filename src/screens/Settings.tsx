import { useEffect, useState } from 'react';
import { clearOwnKey, hasOwnKey, setOwnKey, updateMyProfile } from '../lib/data';
import { setSettings, useSettings } from '../lib/settings';
import { hasSpeech, pickVoice, speakOnce, useVoices, voicesFor } from '../lib/speech';
import { supabase } from '../lib/supabase';
import type { Profile } from '../lib/types';
import { toast } from '../ui/common';
import { IShield } from '../ui/icons';
import type { Go } from '../App';

const SAMPLES = { fr: "Bonjour, je m'appelle Thomas.", en: 'Hello, my name is Daniel.', de: 'Hallo, wie geht es dir?' } as const;
const LNAME = { fr: 'Französisch', en: 'Englisch', de: 'Deutsch' } as const;

export default function Settings({ profile, onProfile, go }: { profile: Profile; onProfile: () => void; go: Go }) {
  const s = useSettings();
  useVoices();
  const [name, setName] = useState(profile.display_name || '');
  const [mail, setMail] = useState(profile.parent_email || '');
  const [pw, setPw] = useState('');
  const [ownKey, setOwnKeyState] = useState<boolean | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => { hasOwnKey().then(setOwnKeyState).catch(() => setOwnKeyState(false)); }, []);

  async function saveProfile() {
    try { await updateMyProfile(profile.id, { display_name: name.trim() || null, parent_email: mail.trim() || null }); onProfile(); toast('Gespeichert'); }
    catch { toast('Speichern hat nicht geklappt'); }
  }
  async function changePw() {
    if (pw.length < 8) { setMsg({ kind: 'err', text: 'Das neue Passwort braucht mindestens 8 Zeichen.' }); return; }
    const { error } = await supabase.auth.updateUser({ password: pw });
    setMsg(error ? { kind: 'err', text: 'Das Passwort konnte nicht geändert werden.' } : { kind: 'ok', text: 'Passwort geändert.' });
    if (!error) setPw('');
  }
  async function saveKey() {
    try { await setOwnKey(keyInput); setKeyInput(''); setOwnKeyState(true); toast('Schlüssel gespeichert'); }
    catch { toast('Das ist kein gültiger Claude-Schlüssel (beginnt mit sk-ant-)'); }
  }

  return (
    <main className="app">
      <header className="stack" style={{ gap: 4 }}><span className="eyebrow">Einstellungen</span><h1>Dein <span className="gradtext">Setup</span></h1></header>

      {profile.role === 'admin' && (
        <button className="glass pad row" style={{ textAlign: 'left', color: 'inherit', width: '100%' }} onClick={() => go({ n: 'admin' })}>
          <span className="ib" style={{ background: 'var(--grad)', color: '#fff', border: 0 }}><IShield /></span>
          <span className="grow"><b style={{ display: 'block' }}>Admin</b><span className="muted small">Einladungen, Konten, Passwörter, Claude-Zugang</span></span>
          <span aria-hidden="true" style={{ fontSize: '1.4rem' }}>›</span>
        </button>
      )}

      <section className="glass pad stack">
        <h2>Darstellung</h2>
        <div className="seg" role="group" aria-label="Farbschema">
          <button aria-pressed={s.theme === 'system'} onClick={() => setSettings({ theme: 'system' })}>Auto</button>
          <button aria-pressed={s.theme === 'light'} onClick={() => setSettings({ theme: 'light' })}>Hell</button>
          <button aria-pressed={s.theme === 'dark'} onClick={() => setSettings({ theme: 'dark' })}>Dunkel</button>
        </div>
      </section>

      <section className="glass pad stack">
        <h2>Vorlesen</h2>
        {!hasSpeech && <div className="note err">Dieser Browser kann nicht vorlesen. Öffne die App in Safari oder Chrome.</div>}
        <label className="f">Tempo <span className="hint">{Math.round(s.rate * 100)} %</span>
          <input type="range" id="rate" min={0.5} max={1.1} step={0.05} value={s.rate} onChange={(e) => setSettings({ rate: +e.target.value })} />
        </label>
        <label className="switch"><span>Nach dem Vorlesen buchstabieren</span><input type="checkbox" id="spell" checked={s.spell} onChange={(e) => setSettings({ spell: e.target.checked })} /></label>
        <label className="switch"><span>Danach das Wort nochmal sagen</span><input type="checkbox" id="again" checked={s.again} onChange={(e) => setSettings({ again: e.target.checked })} /></label>
        <div className="stack" style={{ gap: 6 }}>
          <span className="lbl" style={{ fontWeight: 700, fontSize: '.9rem' }}>Buchstaben ansagen</span>
          <div className="seg" role="group" aria-label="Buchstaben ansagen">
            <button aria-pressed={s.spellLang === 'target'} onClick={() => setSettings({ spellLang: 'target' })}>In der Fremdsprache</button>
            <button aria-pressed={s.spellLang === 'de'} onClick={() => setSettings({ spellLang: 'de' })}>Auf Deutsch</button>
          </div>
        </div>
        <label className="switch"><span>Eingebaute Buchstaben-Aufnahmen <span className="muted small">(klarer als die Handy-Stimme)</span></span><input type="checkbox" id="builtin" checked={s.builtinLetters} onChange={(e) => setSettings({ builtinLetters: e.target.checked })} /></label>
        <label className="switch"><span>Männliche Stimmen bevorzugen</span><input type="checkbox" id="male" checked={s.male} onChange={(e) => setSettings({ male: e.target.checked, voice: {} })} /></label>
        {(['fr', 'en', 'de'] as const).map((l) => {
          const list = voicesFor(l), cur = pickVoice(l);
          return (
            <div key={l} className="row" style={{ alignItems: 'end' }}>
              <label className="f grow">{LNAME[l]}e Stimme
                <select className="inp" id={'voice-' + l} value={cur?.voiceURI || ''} disabled={!list.length} onChange={(e) => setSettings({ voice: { ...s.voice, [l]: e.target.value } })}>
                  {!list.length && <option value="">Keine Stimme auf diesem Gerät</option>}
                  {list.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}
                </select>
              </label>
              <button className="btn sm" style={{ marginBottom: 4 }} onClick={() => speakOnce(SAMPLES[l], l)}>Test</button>
            </div>
          );
        })}
        <p className="hint">Fehlt eine gute Stimme? iPhone: Einstellungen › Bedienungshilfen › Gesprochene Inhalte › Stimmen, dort z. B. „Thomas“ (Französisch), „Daniel“ (Englisch), „Yannick“ (Deutsch) laden. Die Lautstärke regelst du mit den Tasten am Handy.</p>
      </section>

      <section className="glass pad stack">
        <h2>Foto-Erkennung</h2>
        {profile.ai_access === 'owner'
          ? <div className="note ok">Für dich ist die Erkennung mit Claude freigeschaltet.</div>
          : ownKey
            ? <div className="note ok">Dein eigener Claude-Schlüssel ist gespeichert. Er liegt nur auf dem Server und wird hier nicht mehr angezeigt.</div>
            : <p className="hint">Ohne Claude liest die App Fotos kostenlos direkt auf dem Gerät. Mit einem eigenen Claude-Schlüssel klappt es genauer. Den bekommst du unter console.anthropic.com (Konto anlegen, Guthaben aufladen, Schlüssel erstellen).</p>}
        {profile.ai_access !== 'owner' && (ownKey
          ? <button className="btn danger" onClick={async () => { await clearOwnKey(); setOwnKeyState(false); toast('Schlüssel entfernt'); }}>Eigenen Schlüssel entfernen</button>
          : <div className="row"><input className="inp grow" id="aikey" type="password" placeholder="sk-ant-…" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} autoComplete="off" /><button className="btn" disabled={!keyInput.trim()} onClick={saveKey}>Speichern</button></div>)}
      </section>

      <section className="glass pad stack">
        <h2>Konto</h2>
        <p className="muted" style={{ margin: 0 }}>Benutzername: <b>{profile.username}</b>{profile.role === 'admin' ? ' · Admin' : ''}</p>
        <label className="f">Anzeigename<input className="inp" id="dn" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} /></label>
        <label className="f">E-Mail eines Elternteils <span className="hint">freiwillig</span><input className="inp" id="pm" type="email" value={mail} onChange={(e) => setMail(e.target.value)} maxLength={120} /></label>
        <button className="btn" onClick={saveProfile}>Speichern</button>
        <label className="f">Neues Passwort<input className="inp" id="npw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></label>
        <button className="btn" onClick={changePw} disabled={!pw}>Passwort ändern</button>
        {msg && <div className={'note ' + msg.kind}>{msg.text}</div>}
        <button className="btn danger" onClick={() => supabase.auth.signOut()}>Abmelden</button>
      </section>

      <p className="hint center">Buchstaben-Aufnahmen: Piper-Stimmen „Gilles“ (CC0), „Thorsten“ (CC0), „Ryan“ (CC BY-NC-SA 4.0).</p>
    </main>
  );
}
