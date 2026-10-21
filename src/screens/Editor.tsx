import { useEffect, useRef, useState } from 'react';
import type { Go } from '../App';
import { deleteUnit, hasOwnKey, loadUnit, saveUnit } from '../lib/data';
import { readWithClaude, readWithTesseract, type OcrRow } from '../lib/ocr';
import { useSettings } from '../lib/settings';
import { parseLines } from '../lib/text';
import { SUBJECTS, type Profile, type Row, type Subject } from '../lib/types';
import { toast } from '../ui/common';
import { IBack, ICamera, IPlus, ITrash } from '../ui/icons';
import { SubjectSwitch } from './Home';

let keySeq = 0;
const newKey = () => 'n' + ++keySeq;
const blank = (section = ''): Row => ({ key: newKey(), section, term: '', ipa: '', translation: '' });

const CLAUDE_ERR: Record<string, string> = {
  daily_limit: 'Für heute ist das Limit an Foto-Erkennungen erreicht.',
  bad_key: 'Der gespeicherte Claude-Schlüssel funktioniert nicht.',
  no_credit: 'Auf dem Claude-Konto ist kein Guthaben mehr.',
  rate_limited: 'Claude ist gerade ausgelastet.',
  unreadable: 'Claude konnte auf dem Foto keine Vokabelliste erkennen.',
  network: 'Keine Verbindung zum Server.',
};

export default function Editor({ id, profile, go }: { id?: string; profile: Profile; go: Go }) {
  const s = useSettings();
  const [subject, setSubject] = useState<Subject>(s.subject);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [rows, setRows] = useState<Row[]>(id ? [] : [blank()]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null);
  const [ocr, setOcr] = useState<{ kind: '' | 'ok' | 'err' | 'warn'; text: string; busy: boolean }>({ kind: '', text: '', busy: false });
  const [canClaude, setCanClaude] = useState(profile.ai_access === 'owner');
  const [paste, setPaste] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (profile.ai_access !== 'owner') hasOwnKey().then((k) => k && setCanClaude(true)).catch(() => { /* egal */ }); }, [profile.ai_access]);
  useEffect(() => {
    if (!id) return;
    loadUnit(id).then(({ unit, vocab }) => {
      setSubject(unit.subject); setTitle(unit.title); setSubtitle(unit.subtitle || '');
      setRows(vocab.length ? vocab.map((v) => ({ key: v.id, id: v.id, section: v.section || '', term: v.term, ipa: v.ipa || '', translation: v.translation })) : [blank()]);
      setLoading(false);
    }).catch(() => { setErr('Die Unit konnte nicht geladen werden.'); setLoading(false); });
  }, [id]);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url); }, [photo]);

  const filled = rows.filter((r) => r.term.trim() || r.translation.trim());
  const addRows = (list: OcrRow[]) => {
    const add = list.map((r) => ({ ...r, key: newKey() }));
    setRows((cur) => {
      const keep = cur.filter((r) => r.id || r.term.trim() || r.translation.trim());
      return [...keep, ...add];
    });
  };

  async function recognize(file: File, mode: 'auto' | 'free') {
    setOcr({ kind: '', text: 'Foto wird gelesen …', busy: true });
    const status = (t: string) => setOcr({ kind: '', text: t, busy: true });
    try {
      if (mode === 'auto' && canClaude) {
        status('Claude liest die Seite … meist 15 bis 40 Sekunden.');
        const r = await readWithClaude(file, subject);
        if (r.rows?.length) {
          addRows(r.rows);
          if (!title.trim() && r.title) { const [t, ...rest] = r.title.split(' · '); setTitle(t); if (!subtitle && rest.length) setSubtitle(rest.join(' · ')); }
          setOcr({ kind: 'ok', text: `${r.rows.length} Vokabeln erkannt. Bitte kurz mit dem Foto vergleichen, dann speichern.`, busy: false });
          return;
        }
        if (r.error && r.error !== 'no_key') {
          setOcr({ kind: 'warn', text: `${CLAUDE_ERR[r.error] || 'Claude hat die Seite nicht gelesen.'} Ich versuche es mit der kostenlosen Erkennung.`, busy: true });
        }
      }
      const list = await readWithTesseract(file, subject, status);
      if (!list.length) { setOcr({ kind: 'err', text: 'Keine Vokabeln gefunden. Fotografiere die Liste gerade von oben, bei gutem Licht, mit beiden Spalten ganz im Bild.', busy: false }); return; }
      addRows(list);
      setOcr({ kind: 'warn', text: `${list.length} Vokabeln erkannt. Bitte Zeile für Zeile prüfen: Akzente, Apostrophe und Leerzeichen liest die kostenlose Erkennung öfter falsch.`, busy: false });
    } catch {
      setOcr({ kind: 'err', text: 'Das Lesen hat nicht geklappt. Versuch ein schärferes Foto oder tippe die Vokabeln ein.', busy: false });
    }
  }
  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    setPhoto({ file: f, url: URL.createObjectURL(f) });
    recognize(f, 'auto');
  }
  const update = (key: string, patch: Partial<Row>) => setRows((cur) => cur.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (r: Row) => { setRows((cur) => cur.filter((x) => x.key !== r.key)); if (r.id) setRemoved((x) => [...x, r.id!]); };

  async function save() {
    setErr('');
    if (!title.trim()) { setErr('Gib der Unit einen Namen, z. B. „Unité 1“ oder „Unit 3 · Seite 42“.'); return; }
    const half = rows.find((r) => (r.term.trim() && !r.translation.trim()) || (!r.term.trim() && r.translation.trim()));
    if (half) { setErr('Bei einer Zeile fehlt das Wort oder die Übersetzung. Ergänze sie oder lösche die Zeile.'); return; }
    setSaving(true);
    try {
      const uid = await saveUnit({ id, subject, title: title.trim(), subtitle: subtitle.trim(), rows, removed });
      toast('Gespeichert');
      go({ n: 'unit', id: uid });
    } catch { setErr('Speichern hat nicht geklappt. Bist du online?'); }
    finally { setSaving(false); }
  }
  async function del() {
    if (!id) return;
    try { await deleteUnit(id); toast('Unit gelöscht'); go({ n: 'home' }); }
    catch { setErr('Löschen hat nicht geklappt.'); }
  }

  if (loading) return <main className="app"><p className="muted">Lädt …</p></main>;
  const L = SUBJECTS[subject];

  return (
    <main className="app">
      <header className="subhead">
        {id && <button className="ib" onClick={() => go({ n: 'unit', id })} aria-label="Zurück"><IBack /></button>}
        <div className="grow"><span className="eyebrow">{id ? 'Unit bearbeiten' : 'Neue Unit'}</span><h1>{id ? title || 'Unit' : `${L.name}-Vokabeln`}</h1></div>
      </header>

      {!id && <SubjectSwitch value={subject} onChange={setSubject} />}

      <section className="glass pad stack">
        <h2>Vom Foto übernehmen</h2>
        <button className={'btn block ' + subject} disabled={ocr.busy} onClick={() => fileRef.current?.click()}><ICamera />Foto aufnehmen oder auswählen</button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
        <p className="hint">
          {canClaude ? 'Claude liest die Seite ab, inklusive Lautschrift und Abschnitten.' : 'Die Seite wird direkt auf dem Gerät gelesen, kostenlos.'} Das Foto wird nicht gespeichert.
        </p>
        {ocr.text && <div className={'note ' + ocr.kind} role="status">{ocr.text}</div>}
        {photo && <img className="photo" src={photo.url} alt="Foto der Vokabelseite zum Vergleichen" />}
        {photo && !ocr.busy && (
          <div className="row wrap">
            <button className="btn sm" onClick={() => recognize(photo.file, 'auto')}>Nochmal lesen</button>
            {canClaude && <button className="btn sm" onClick={() => recognize(photo.file, 'free')}>Kostenlose Erkennung</button>}
          </div>
        )}
      </section>

      <section className="glass pad stack">
        <label className="f">Name der Unit
          <input className="inp" id="utitle" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder={subject === 'fr' ? 'z. B. Unité 1 · Au début' : 'z. B. Unit 2 · At school'} />
        </label>
        <label className="f">Zusatz <span className="hint">freiwillig, z. B. Seitenzahl</span>
          <input className="inp" id="usub" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} maxLength={80} placeholder="Seite 158" />
        </label>
      </section>

      <section className="solid" style={{ overflow: 'hidden' }}>
        <div className="row" style={{ padding: '14px 16px 4px' }}>
          <h2 className="grow">Vokabeln <span className="muted small">{filled.length}</span></h2>
          <button className="btn sm" onClick={() => setPaste(paste === null ? '' : null)}>{paste === null ? 'Text einfügen' : 'Schliessen'}</button>
        </div>
        {paste !== null && (
          <div className="stack" style={{ padding: '6px 16px 12px' }}>
            <p className="hint">Eine Vokabel pro Zeile: <b>{subject === 'fr' ? 'bonjour' : 'hello'} = {subject === 'fr' ? 'guten Tag' : 'hallo'}</b>. Eine Zeile mit # beginnt einen Abschnitt.</p>
            <textarea className="inp" id="paste" value={paste} onChange={(e) => setPaste(e.target.value)} spellCheck={false} />
            <button className="btn" onClick={() => { const r = parseLines(paste); if (!r.length) { toast('Keine Zeile mit „=“ gefunden'); return; } addRows(r); setPaste(null); toast(`${r.length} Vokabeln übernommen`); }}>Übernehmen</button>
          </div>
        )}
        <div className="erow" style={{ paddingBlock: 6, borderTop: 0 }}>
          <span className="eyebrow">{L.name}</span><span className="eyebrow">Deutsch</span><span style={{ width: 42 }} />
        </div>
        {rows.map((r) => (
          <div key={r.key} className="erow">
            <input className="inp" aria-label={`${L.name}es Wort`} lang={subject} value={r.term} onChange={(e) => update(r.key, { term: e.target.value })} autoCapitalize="off" spellCheck={false} />
            <input className="inp" aria-label="Deutsche Übersetzung" lang="de" value={r.translation} onChange={(e) => update(r.key, { translation: e.target.value })} />
            <button className="ib" aria-label="Zeile löschen" onClick={() => remove(r)}><ITrash /></button>
            <div className="sub">
              <input className="inp" aria-label="Abschnitt" placeholder="Abschnitt" value={r.section} onChange={(e) => update(r.key, { section: e.target.value })} />
              <input className="inp" aria-label="Lautschrift" placeholder="Lautschrift (freiwillig)" value={r.ipa} onChange={(e) => update(r.key, { ipa: e.target.value })} style={{ fontFamily: 'var(--f-ipa)' }} />
            </div>
          </div>
        ))}
        <div style={{ padding: 12 }}>
          <button className="btn block" onClick={() => setRows((cur) => [...cur, blank(cur[cur.length - 1]?.section || '')])}><IPlus />Zeile hinzufügen</button>
        </div>
      </section>

      {err && <div className="note err" role="alert">{err}</div>}
      <button className="btn primary block" disabled={saving || ocr.busy} onClick={save}>{saving ? 'Speichert …' : 'Unit speichern'}</button>
      {id && (!confirmDel
        ? <button className="btn danger block" onClick={() => setConfirmDel(true)}><ITrash />Unit löschen</button>
        : <div className="note err stack"><b>Die ganze Unit mit allen Vokabeln löschen?</b><div className="row"><button className="btn danger" onClick={del}>Ja, löschen</button><button className="btn" onClick={() => setConfirmDel(false)}>Abbrechen</button></div></div>)}
    </main>
  );
}
