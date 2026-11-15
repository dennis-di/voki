import { useEffect, useRef, useState } from 'react';
import type { Go } from '../App';
import { deleteUnit, hasOwnKey, loadUnit, saveUnit } from '../lib/data';
import { readWithClaude, readWithTesseract, type OcrRow } from '../lib/ocr';
import { useSettings } from '../lib/settings';
import { guessGender, parseLines } from '../lib/text';
import { SUBJECTS, type Example, type Profile, type Row, type Subject } from '../lib/types';
import { toast } from '../ui/common';
import { IBack, ICamera, IPlus, ITrash } from '../ui/icons';
import { SubjectSwitch } from './Home';

let keySeq = 0;
const newKey = () => 'n' + ++keySeq;
const blank = (page = '', section = '', kind: Row['kind'] = 'word'): Row => ({ key: newKey(), kind, page, section, term: '', ipa: '', translation: '', gender: '', plural: '', note: '', examples: [] });

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
  const [page, setPage] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (profile.ai_access !== 'owner') hasOwnKey().then((k) => k && setCanClaude(true)).catch(() => { /* egal */ }); }, [profile.ai_access]);
  useEffect(() => {
    if (!id) return;
    loadUnit(id).then(({ unit, vocab }) => {
      setSubject(unit.subject); setTitle(unit.title); setSubtitle(unit.subtitle || '');
      setRows(vocab.length ? vocab.map((v): Row => ({
        key: v.id, id: v.id, kind: v.kind || 'word', page: v.page || '', section: v.section || '', term: v.term, ipa: v.ipa || '', translation: v.translation,
        gender: v.gender || '', plural: v.plural || '', note: v.note || '', examples: v.examples || [],
      })) : [blank()]);
      setLoading(false);
    }).catch(() => { setErr('Die Unit konnte nicht geladen werden.'); setLoading(false); });
  }, [id]);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url); }, [photo]);

  const filled = rows.filter((r) => r.kind === 'word' && (r.term.trim() || r.translation.trim()));
  const addRows = (list: OcrRow[], pg = page) => {
    const add = list.map((r): Row => ({ ...r, page: r.page || pg, key: newKey() }));
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
          if (r.page) setPage(r.page);
          addRows(r.rows, r.page || page);
          if (!title.trim() && r.title) { const [t, ...rest] = r.title.split(' · '); setTitle(t); if (!subtitle && rest.length) setSubtitle(rest.join(' · ')); }
          const nw = r.rows.filter((x) => x.kind === 'word').length, nr = r.rows.length - nw, ne = r.rows.reduce((n, x) => n + x.examples.length, 0);
          setOcr({ kind: 'ok', text: `${nw} Vokabeln${ne ? `, ${ne} Beispielsätze` : ''}${nr ? `, ${nr} Merk-Regeln` : ''} erkannt${r.page ? ` (Seite ${r.page})` : ''}. Bitte kurz mit dem Foto vergleichen, dann speichern.`, busy: false });
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
    const half = rows.find((r) => r.kind === 'word' && ((r.term.trim() && !r.translation.trim()) || (!r.term.trim() && r.translation.trim())));
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
        <label className="f">Seite im Buch <span className="hint">für die neuen Zeilen; Claude erkennt sie meist selbst</span>
          <input className="inp" id="upage" inputMode="numeric" value={page} onChange={(e) => setPage(e.target.value.slice(0, 20))} placeholder="z. B. 163" />
        </label>
        <p className="hint">
          {canClaude ? 'Claude liest die Seite ab: Lautschrift, Abschnitte, männlich/weiblich, Beispielsätze und die orangen Merk-Kästen.' : 'Die Seite wird direkt auf dem Gerät gelesen, kostenlos (nur Wort und Übersetzung).'} Weitere Seiten derselben Unit einfach nacheinander fotografieren. Das Foto wird nicht gespeichert.
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
            <p className="hint">Eine Vokabel pro Zeile: <b>{subject === 'fr' ? 'la danse' : 'hello'} = {subject === 'fr' ? 'der Tanz' : 'hallo'}</b>. Zeilen mit <b>@ 163</b> setzen die Seite, <b># A1</b> den Abschnitt, <b>! Text</b> ist eine Merk-Regel, <b>&gt; Satz = Übersetzung</b> ein Beispiel zur Vokabel davor.</p>
            <textarea className="inp" id="paste" value={paste} onChange={(e) => setPaste(e.target.value)} spellCheck={false} />
            <button className="btn" onClick={() => { const r = parseLines(paste, subject).map((x) => ({ ...x, page: x.page || page })); if (!r.length) { toast('Keine Zeile mit „=“ gefunden'); return; } addRows(r); setPaste(null); toast(`${r.length} Zeilen übernommen`); }}>Übernehmen</button>
          </div>
        )}
        <div className="erow" style={{ paddingBlock: 6, borderTop: 0 }}>
          <span className="eyebrow">{L.name}</span><span className="eyebrow">Deutsch</span><span style={{ width: 42 }} />
        </div>
        {rows.map((r, idx) => {
          const prev = rows[idx - 1];
          const head = idx === 0 || prev.page !== r.page || prev.section !== r.section;
          const headLine = head && (r.page || r.section) ? <div className="ehead">{[r.page && `Seite ${r.page}`, r.section && `Abschnitt ${r.section}`].filter(Boolean).join(' · ')}</div> : null;
          if (r.kind === 'rule') return (
            <div key={r.key}>
              {headLine}
              <div className="erow rule">
                <textarea className="inp" aria-label="Merk-Regel" value={r.term} onChange={(e) => update(r.key, { term: e.target.value })} rows={2} placeholder="Merk-Regel, z. B. Un jeu / des jeux: im Plural ein -x" />
                <button className="ib" aria-label="Regel löschen" onClick={() => remove(r)}><ITrash /></button>
                <div className="sub"><input className="inp" aria-label="Seite" placeholder="Seite" value={r.page} onChange={(e) => update(r.key, { page: e.target.value })} /><input className="inp" aria-label="Abschnitt" placeholder="Abschnitt" value={r.section} onChange={(e) => update(r.key, { section: e.target.value })} /></div>
              </div>
            </div>
          );
          const more = open === r.key;
          const setEx = (examples: Example[]) => update(r.key, { examples });
          return (
            <div key={r.key}>
              {headLine}
              <div className={'erow' + (r.gender ? ' g-' + r.gender : '')}>
                <input className="inp" aria-label={`${L.name}es Wort`} lang={subject} value={r.term}
                  onChange={(e) => update(r.key, { term: e.target.value, ...(r.gender ? {} : { gender: guessGender(e.target.value, subject) }) })} autoCapitalize="off" spellCheck={false} />
                <input className="inp" aria-label="Deutsche Übersetzung" lang="de" value={r.translation} onChange={(e) => update(r.key, { translation: e.target.value })} />
                <button className="ib" aria-label="Zeile löschen" onClick={() => remove(r)}><ITrash /></button>
                <div className="sub sub3">
                  <input className="inp" aria-label="Seite" placeholder="Seite" value={r.page} onChange={(e) => update(r.key, { page: e.target.value })} />
                  <input className="inp" aria-label="Abschnitt" placeholder="Abschnitt" value={r.section} onChange={(e) => update(r.key, { section: e.target.value })} />
                  <input className="inp" aria-label="Lautschrift" placeholder="Lautschrift" value={r.ipa} onChange={(e) => update(r.key, { ipa: e.target.value })} style={{ fontFamily: 'var(--f-ipa)' }} />
                </div>
                <div className="sub row wrap" style={{ gap: 6 }}>
                  <div className="gsel" role="group" aria-label="Geschlecht">
                    <button type="button" aria-pressed={r.gender === 'm'} className="gm" onClick={() => update(r.key, { gender: r.gender === 'm' ? '' : 'm' })}>m</button>
                    <button type="button" aria-pressed={r.gender === 'f'} className="gf" onClick={() => update(r.key, { gender: r.gender === 'f' ? '' : 'f' })}>f</button>
                  </div>
                  <button type="button" className="btn sm" aria-expanded={more} onClick={() => setOpen(more ? null : r.key)}>
                    {more ? 'Weniger' : `Mehr${r.examples.length ? ` · ${r.examples.length} Beispiel${r.examples.length > 1 ? 'e' : ''}` : ''}${r.note || r.plural ? ' · Hinweis' : ''}`}
                  </button>
                </div>
                {more && (
                  <div className="sub stack" style={{ gap: 8 }}>
                    <input className="inp" aria-label="Mehrzahl, wenn unregelmässig" placeholder="Mehrzahl, wenn unregelmässig (z. B. des jeux vidéo)" value={r.plural} onChange={(e) => update(r.key, { plural: e.target.value })} lang={subject} />
                    <input className="inp" aria-label="Hinweis" placeholder="Hinweis (z. B. englisch: dance)" value={r.note} onChange={(e) => update(r.key, { note: e.target.value })} />
                    {r.examples.map((ex, k) => (
                      <div key={k} className="exrow">
                        <input className="inp" aria-label="Beispielsatz" placeholder="Beispielsatz" lang={subject} value={ex.fr} onChange={(e) => setEx(r.examples.map((x, n) => (n === k ? { ...x, fr: e.target.value } : x)))} />
                        <input className="inp" aria-label="Übersetzung des Beispiels" placeholder="Übersetzung" lang="de" value={ex.de} onChange={(e) => setEx(r.examples.map((x, n) => (n === k ? { ...x, de: e.target.value } : x)))} />
                        <button type="button" className="ib" aria-label="Beispiel löschen" onClick={() => setEx(r.examples.filter((_, n) => n !== k))}><ITrash /></button>
                      </div>
                    ))}
                    <button type="button" className="btn sm" onClick={() => setEx([...r.examples, { fr: '', de: '' }])}><IPlus />Beispielsatz</button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div className="row" style={{ padding: 12 }}>
          <button className="btn grow" onClick={() => setRows((cur) => [...cur, blank(cur[cur.length - 1]?.page || page, cur[cur.length - 1]?.section || '')])}><IPlus />Vokabel</button>
          <button className="btn grow rulebtn" onClick={() => setRows((cur) => [...cur, blank(cur[cur.length - 1]?.page || page, cur[cur.length - 1]?.section || '', 'rule')])}><IPlus />Merk-Regel</button>
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
