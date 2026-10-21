import { useEffect, useState } from 'react';
import { adminSetUser, createInvite, deleteInvite, listInvites, listProfiles } from '../lib/data';
import { callFn } from '../lib/supabase';
import type { Invite, Profile } from '../lib/types';
import { copyText, randomCode, toast } from '../ui/common';
import { IBack, ICopy, ITrash } from '../ui/icons';
import type { Go } from '../App';

export default function Admin({ me, go }: { me: Profile; go: Go }) {
  const [users, setUsers] = useState<Profile[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [note, setNote] = useState('');
  const [uses, setUses] = useState(1);
  const [ai, setAi] = useState(false);
  const [days, setDays] = useState(14);
  const [pwFor, setPwFor] = useState<string | null>(null);
  const [pw, setPw] = useState('');
  const [delFor, setDelFor] = useState<string | null>(null);

  const reload = () => { listProfiles().then(setUsers).catch(() => toast('Konten konnten nicht geladen werden')); listInvites().then(setInvites).catch(() => { /* egal */ }); };
  useEffect(reload, []);

  const shareText = (code: string) => `Hallo! Hier ist dein Einladungscode für Voki: ${code}\nApp öffnen: ${location.origin}\nDort „Neues Konto“ wählen, Code eingeben und Benutzername + Passwort festlegen.`;

  async function newInvite() {
    const prefix = note.trim() ? note.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) + '-' : '';
    const code = randomCode(prefix);
    try {
      await createInvite({ code, note: note.trim() || null, role: 'member', ai_access: ai ? 'owner' : 'none', uses_left: Math.max(1, uses), expires_at: days ? new Date(Date.now() + days * 864e5).toISOString() : null });
      setNote(''); setAi(false); setUses(1); reload();
      copyText(shareText(code));
    } catch { toast('Einladung konnte nicht erstellt werden'); }
  }
  async function resetPw(id: string) {
    const { error } = await callFn('admin', { action: 'reset_password', user_id: id, password: pw });
    toast(error ? (error === 'weak_password' ? 'Mindestens 8 Zeichen' : 'Zurücksetzen hat nicht geklappt') : 'Passwort gesetzt');
    if (!error) { setPwFor(null); setPw(''); }
  }
  async function delUser(id: string) {
    const { error } = await callFn('admin', { action: 'delete_user', user_id: id });
    toast(error ? 'Löschen hat nicht geklappt' : 'Konto gelöscht');
    setDelFor(null); reload();
  }
  async function setUser(u: Profile, patch: Partial<Profile>) {
    try { await adminSetUser(u.id, patch.role ?? u.role, patch.ai_access ?? u.ai_access); reload(); }
    catch { toast('Ändern hat nicht geklappt'); }
  }

  return (
    <main className="app">
      <header className="subhead">
        <button className="ib" onClick={() => go({ n: 'settings' })} aria-label="Zurück zu den Einstellungen"><IBack /></button>
        <div className="grow"><span className="eyebrow">Einstellungen › Admin</span><h1>Konten &amp; <span className="gradtext">Einladungen</span></h1></div>
      </header>

      <section className="glass pad stack">
        <h2>Neue Einladung</h2>
        <label className="f">Für wen? <span className="hint">wird Teil des Codes, z. B. LARA</span><input className="inp" id="inote" value={note} onChange={(e) => setNote(e.target.value)} maxLength={30} /></label>
        <div className="row wrap">
          <label className="f grow">Gültig für Konten<input className="inp" id="iuses" type="number" min={1} max={40} value={uses} onChange={(e) => setUses(+e.target.value)} /></label>
          <label className="f grow">Gültig (Tage)<input className="inp" id="idays" type="number" min={0} max={365} value={days} onChange={(e) => setDays(+e.target.value)} /></label>
        </div>
        <label className="switch"><span>Foto-Erkennung mit deinem Claude-Schlüssel erlauben <span className="muted small">(nur eigene Kinder)</span></span><input type="checkbox" id="iai" checked={ai} onChange={(e) => setAi(e.target.checked)} /></label>
        <button className="btn primary" onClick={newInvite}>Code erstellen und Text kopieren</button>
        <p className="hint">Den kopierten Text schickst du per WhatsApp oder Mail. Eine Mail-Adresse braucht das Kind nicht.</p>
      </section>

      {invites.length > 0 && (
        <section className="solid">
          <h2 style={{ padding: '16px 16px 4px' }}>Offene Einladungen</h2>
          <ul className="list">
            {invites.map((i) => (
              <li key={i.code}>
                <div className="row"><span className="code grow">{i.code}</span>
                  <button className="ib" aria-label="Text kopieren" onClick={() => copyText(shareText(i.code))}><ICopy /></button>
                  <button className="ib" aria-label="Einladung löschen" onClick={async () => { await deleteInvite(i.code); reload(); }}><ITrash /></button>
                </div>
                <span className="muted small">{i.note || 'ohne Notiz'} · noch {i.uses_left} {i.uses_left === 1 ? 'Konto' : 'Konten'}{i.expires_at ? ` · bis ${new Date(i.expires_at).toLocaleDateString('de-CH')}` : ''}{i.ai_access === 'owner' ? ' · mit Claude' : ''}{i.role === 'admin' ? ' · Admin' : ''}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="solid">
        <h2 style={{ padding: '16px 16px 4px' }}>Konten <span className="muted small">{users.length}</span></h2>
        <ul className="list">
          {users.map((u) => (
            <li key={u.id}>
              <div className="row"><div className="grow"><b>{u.display_name || u.username}</b> <span className="muted small">@{u.username}{u.role === 'admin' ? ' · Admin' : ''}</span></div></div>
              {u.parent_email && <span className="muted small">Eltern: {u.parent_email}</span>}
              <label className="switch small"><span>Foto-Erkennung mit deinem Claude-Schlüssel</span><input type="checkbox" checked={u.ai_access === 'owner'} onChange={(e) => setUser(u, { ai_access: e.target.checked ? 'owner' : 'none' })} /></label>
              {u.id !== me.id && <label className="switch small"><span>Admin</span><input type="checkbox" checked={u.role === 'admin'} onChange={(e) => setUser(u, { role: e.target.checked ? 'admin' : 'member' })} /></label>}
              <div className="row wrap">
                <button className="btn sm" onClick={() => { setPwFor(pwFor === u.id ? null : u.id); setPw(''); }}>Passwort zurücksetzen</button>
                {u.id !== me.id && <button className="btn sm danger" onClick={() => setDelFor(delFor === u.id ? null : u.id)}>Konto löschen</button>}
              </div>
              {pwFor === u.id && <div className="row"><input className="inp grow" type="text" placeholder="Neues Passwort (mind. 8 Zeichen)" value={pw} onChange={(e) => setPw(e.target.value)} /><button className="btn" onClick={() => resetPw(u.id)}>Setzen</button></div>}
              {delFor === u.id && <div className="note err stack"><b>Konto „{u.username}“ mit allen Units löschen?</b><div className="row"><button className="btn danger" onClick={() => delUser(u.id)}>Ja, löschen</button><button className="btn" onClick={() => setDelFor(null)}>Abbrechen</button></div></div>}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
