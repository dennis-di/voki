import { useEffect, useState } from 'react';
import type { Go } from '../App';
import { loadSubject, saveUnit } from '../lib/data';
import { SAMPLE_FR } from '../lib/sample';
import { setSettings, useSettings } from '../lib/settings';
import { SUBJECTS, type Profile, type Stat, type Subject, type Unit, type Vocab } from '../lib/types';
import { Logo, SettingsButton, toast } from '../ui/common';
import { ICamera } from '../ui/icons';

export function SubjectSwitch({ value, onChange }: { value: Subject; onChange: (s: Subject) => void }) {
  return (
    <div className="subjects" role="group" aria-label="Fach">
      {(['fr', 'en'] as Subject[]).map((s) => (
        <button key={s} className={'subj ' + s} aria-pressed={value === s} onClick={() => onChange(s)}>
          <span className="tag">{SUBJECTS[s].short}</span>
          <b>{SUBJECTS[s].name}</b>
          <small>{SUBJECTS[s].hello}!</small>
        </button>
      ))}
    </div>
  );
}

export default function Home({ profile, go }: { profile: Profile; go: Go }) {
  const s = useSettings();
  const [data, setData] = useState<{ units: Unit[]; vocab: Vocab[]; stats: Stat[] } | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    setData(null); setErr('');
    loadSubject(s.subject).then((d) => live && setData(d)).catch(() => live && setErr('Die Units konnten nicht geladen werden. Bist du online?'));
    return () => { live = false; };
  }, [s.subject]);

  const statBy = new Map((data?.stats || []).map((x) => [x.vocab_id, x]));
  const toPractice = (data?.vocab || []).filter((v) => statBy.get(v.id)?.last_correct === false).length;
  const known = (data?.vocab || []).filter((v) => statBy.get(v.id)?.last_correct === true).length;

  async function addSample() {
    setBusy(true);
    try { const id = await saveUnit({ subject: 'fr', title: SAMPLE_FR.title, subtitle: SAMPLE_FR.subtitle, rows: SAMPLE_FR.rows, removed: [] }); go({ n: 'unit', id }); }
    catch { toast('Das hat nicht geklappt. Bitte nochmal versuchen.'); }
    finally { setBusy(false); }
  }

  return (
    <main className="app">
      <header className="stack" style={{ gap: 22, paddingTop: 6 }}>
        <div className="row"><span className="grow"><Logo height={30} /></span><SettingsButton onClick={() => go({ n: 'settings' })} /></div>
        <h1>Hallo <span className="gradtext">{profile.display_name || profile.username}</span></h1>
      </header>
      <SubjectSwitch value={s.subject} onChange={(subject) => setSettings({ subject })} />

      {err && <div className="note err">{err}</div>}
      {data && (
        <div className="stats">
          <div className="stat glass"><b>{data.units.length}</b><span>Units</span></div>
          <div className="stat glass"><b>{data.vocab.length}</b><span>Vokabeln</span></div>
          <button className="stat glass" style={{ border: 0, color: 'inherit' }} onClick={() => go({ n: 'test' })} aria-label={`${toPractice} Vokabeln zum Üben, Test öffnen`}>
            <b className={toPractice ? 'gradtext' : ''}>{toPractice}</b><span>zum Üben</span>
          </button>
        </div>
      )}

      <section className="stack">
        <div className="row"><h2 className="grow">Deine Units</h2>{data && data.vocab.length > 0 && <span className="muted small">{known} von {data.vocab.length} sitzen</span>}</div>
        {!data && !err && <div className="glass pad muted">Lädt …</div>}
        {data && data.units.length === 0 && (
          <div className="glass empty">
            <h3>Noch keine {SUBJECTS[s.subject].name}-Unit</h3>
            <p className="muted" style={{ margin: 0 }}>Fotografiere eine Vokabelseite aus dem Buch. Die App liest sie ab, du prüfst und speicherst.</p>
            <button className={'btn ' + s.subject} onClick={() => go({ n: 'edit' })}><ICamera />Unit per Foto anlegen</button>
            {s.subject === 'fr' && <button className="link" disabled={busy} onClick={addSample}>Beispiel „Au début“ hinzufügen</button>}
          </div>
        )}
        {data && data.units.length > 0 && (
          <div className="units">
            {data.units.map((u) => {
              const vs = data.vocab.filter((v) => v.unit_id === u.id);
              const k = vs.filter((v) => statBy.get(v.id)?.last_correct === true).length;
              return (
                <button key={u.id} className="ucard glass" onClick={() => go({ n: 'unit', id: u.id })}>
                  <h3>{u.title}</h3>
                  {u.subtitle && <span className="muted small">{u.subtitle}</span>}
                  <span className="meta">{vs.length} Vokabeln · {k} sitzen</span>
                  <div className={'bar ' + u.subject}><span style={{ width: `${vs.length ? (k / vs.length) * 100 : 0}%` }} /></div>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
