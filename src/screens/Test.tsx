import { useEffect, useMemo, useRef, useState } from 'react';
import type { Go } from '../App';
import { loadSubject, recordAnswer } from '../lib/data';
import { setSettings, useSettings } from '../lib/settings';
import { speakOnce, stopOnce, unlockAudio } from '../lib/speech';
import { grade, shuffle, type Grade } from '../lib/text';
import { SUBJECTS, type Stat, type Subject, type Unit, type Vocab } from '../lib/types';
import { IBack, ISpeaker } from '../ui/icons';
import { SettingsButton } from '../ui/common';
import { SubjectSwitch } from './Home';

type Mode = 'mc' | 'write' | 'listen';
type Dir = 'to-de' | 'from-de';
interface Wrong { v: Vocab; you: string }
interface Run { mode: Mode; dir: Dir; list: Vocab[]; i: number; score: number; wrong: Wrong[] }

/** Laufender Test je Fach – bleibt beim Wechsel ins Menü und beim Neuladen erhalten */
const RUN_KEY = 'vw:test-run';
let saved: Partial<Record<Subject, Run>> = {};
try { saved = JSON.parse(localStorage.getItem(RUN_KEY) || '{}'); } catch { /* privat */ }
function saveRun(subject: Subject, run: Run | null) {
  if (run) saved[subject] = run; else delete saved[subject];
  try { localStorage.setItem(RUN_KEY, JSON.stringify(saved)); } catch { /* privat */ }
}

const ACCENTS: Record<Subject | 'de', string[]> = {
  fr: ['é', 'è', 'ê', 'à', 'â', 'ç', 'î', 'ï', 'ô', 'û', 'ù', 'ë', 'œ', "'"],
  en: ["'"],
  de: ['ä', 'ö', 'ü', 'ß'],
};

export default function Test({ go, onActive }: { go: Go; onActive: (active: boolean) => void }) {
  const s = useSettings();
  const subject = s.subject;
  const [data, setData] = useState<{ units: Unit[]; vocab: Vocab[]; stats: Stat[] } | null>(null);
  const [sel, setSel] = useState<Set<string> | null>(null);
  const [mode, setMode] = useState<Mode>('mc');
  const [dir, setDir] = useState<Dir>('to-de');
  const [onlyWrong, setOnlyWrong] = useState(false);
  const [run, setRunState] = useState<Run | null>(() => saved[subject] || null);
  const [playing, setPlaying] = useState(false);
  const [done, setDone] = useState(false);
  const setRun = (r: Run | null) => { setRunState(r); saveRun(subject, r); };

  useEffect(() => { setData(null); setSel(null); setRunState(saved[subject] || null); setPlaying(false); setDone(false); loadSubject(subject).then(setData).catch(() => setData({ units: [], vocab: [], stats: [] })); }, [subject]);
  useEffect(() => () => { stopOnce(); onActive(false); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { onActive(!!run && playing && !done); }, [run, playing, done]); // eslint-disable-line react-hooks/exhaustive-deps

  const units = data?.units || [];
  const chosen = sel ?? new Set(units.map((u) => u.id));
  const statBy = useMemo(() => new Map((data?.stats || []).map((x) => [x.vocab_id, x])), [data]);
  const pool = (data?.vocab || []).filter((v) => chosen.has(v.unit_id) && (!onlyWrong || statBy.get(v.id)?.last_correct === false));
  const wrongCount = (data?.vocab || []).filter((v) => chosen.has(v.unit_id) && statBy.get(v.id)?.last_correct === false).length;
  const allSel = chosen.size === units.length && units.length > 0;
  const toggleUnit = (id: string) => {
    const n = new Set(allSel ? [] : chosen);
    if (n.has(id)) n.delete(id); else n.add(id);
    setSel(n.size ? n : new Set(units.map((u) => u.id)));
  };

  function start(list: Vocab[], m: Mode = mode, d: Dir = dir) { unlockAudio(); setRun({ mode: m, dir: d, list: shuffle(list), i: 0, score: 0, wrong: [] }); setDone(false); setPlaying(true); window.scrollTo({ top: 0 }); }
  function resume() { unlockAudio(); setPlaying(true); window.scrollTo({ top: 0 }); }
  function next(r: Run) {
    if (r.i < r.list.length - 1) { setRun({ ...r, i: r.i + 1 }); return true; }
    setDone(true); saveRun(subject, null); return false;
  }

  if (run && playing && !done) return <Question key={run.i} subject={subject} mode={run.mode} dir={run.dir} run={run} all={data?.vocab || run.list}
    onAnswer={(ok, you) => {
      recordAnswer(run.list[run.i].id, ok).catch(() => { /* offline: nicht schlimm */ });
      setRun({ ...run, score: run.score + (ok ? 1 : 0), wrong: ok ? run.wrong : [...run.wrong, { v: run.list[run.i], you }] });
    }}
    onNext={() => { stopOnce(); next(run); window.scrollTo({ top: 0 }); }}
    onBack={(answered) => {
      stopOnce();
      // Bereits beantwortete Frage nicht doppelt zählen: beim Fortsetzen geht es mit der nächsten weiter
      if (answered && !next(run)) return;
      setPlaying(false); window.scrollTo({ top: 0 });
    }} />;

  if (run && done) {
    const n = run.list.length, r = run.score / n;
    return (
      <main className="app">
        <section className="glass pad stack center">
          <span className="eyebrow">Ergebnis</span>
          <div className="result gradtext">{run.score} / {n}</div>
          <h2>{r >= 0.9 ? (subject === 'fr' ? 'Très bien !' : 'Brilliant!') : r >= 0.7 ? (subject === 'fr' ? 'Bien joué !' : 'Well done!') : (subject === 'fr' ? 'Encore un peu !' : 'Keep going!')}</h2>
          <p className="muted" style={{ margin: 0 }}>{run.wrong.length ? `${run.wrong.length} Vokabeln zum Üben` : 'Alles richtig.'}</p>
        </section>
        {run.wrong.length > 0 && (
          <ul className="list solid">
            {run.wrong.map((w, i) => <li key={i}><b lang={subject}>{w.v.term} = {w.v.translation}</b><span className="muted small">Deine Antwort: {w.you || '–'}</span></li>)}
          </ul>
        )}
        <div className="row wrap">
          {run.wrong.length > 0 && <button className="btn primary" onClick={() => start(run.wrong.map((w) => w.v), run.mode, run.dir)}>Nur Fehler wiederholen</button>}
          <button className="btn" onClick={() => { setRun(null); setDone(false); setPlaying(false); loadSubject(subject).then(setData); }}>Neuer Test</button>
        </div>
      </main>
    );
  }

  return (
    <main className="app">
      <header className="row" style={{ alignItems: 'flex-start' }}>
        <div className="stack grow" style={{ gap: 4 }}><span className="eyebrow">Vokabeltest</span><h1>Was <span className="gradtext">sitzt</span> schon?</h1></div>
        <SettingsButton onClick={() => go({ n: 'settings' })} />
      </header>
      <SubjectSwitch value={subject} onChange={(x) => setSettings({ subject: x })} />
      {run && !done && (
        <section className="glass pad stack">
          <div className="row"><h3 className="grow">Test unterbrochen</h3><span className="muted small">Frage {run.i + 1} von {run.list.length} · {run.score} richtig</span></div>
          <div className="qbar"><span style={{ width: `${(run.i / run.list.length) * 100}%` }} /></div>
          <div className="row wrap">
            <button className={'btn primary grow ' + subject} onClick={resume}>Test fortsetzen</button>
            <button className="btn" onClick={() => setRun(null)}>Verwerfen</button>
          </div>
        </section>
      )}
      {!data && <div className="glass pad muted">Lädt …</div>}
      {data && units.length === 0 && (
        <div className="glass empty"><p className="muted" style={{ margin: 0 }}>Für {SUBJECTS[subject].name} gibt es noch keine Unit.</p><button className="btn primary" onClick={() => go({ n: 'edit' })}>Unit anlegen</button></div>
      )}
      {data && units.length > 0 && (<>
        <section className="glass pad stack">
          <h3>Units</h3>
          <div className="chips">
            <button className="chip" aria-pressed={allSel} onClick={() => setSel(new Set(units.map((u) => u.id)))}>Alle</button>
            {units.map((u) => <button key={u.id} className="chip" aria-pressed={!allSel && chosen.has(u.id)} onClick={() => toggleUnit(u.id)}>{u.title}</button>)}
          </div>
          <p className="hint">Tippe mehrere Units an, um sie zusammen abzufragen.</p>
        </section>
        <section className="glass pad stack">
          <h3>Art</h3>
          <div className="seg" role="group" aria-label="Art des Tests">
            <button aria-pressed={mode === 'mc'} onClick={() => setMode('mc')}>Auswahl</button>
            <button aria-pressed={mode === 'write'} onClick={() => setMode('write')}>Schreiben</button>
            <button aria-pressed={mode === 'listen'} onClick={() => setMode('listen')}>Diktat</button>
          </div>
          <p className="hint">{mode === 'mc' ? 'Vier Antworten, eine stimmt.' : mode === 'write' ? 'Die Übersetzung selbst schreiben.' : 'Das Wort wird nur vorgelesen. Du schreibst es so, wie es geschrieben wird.'}</p>
          {mode !== 'listen' && (
            <div className="seg" role="group" aria-label="Richtung">
              <button aria-pressed={dir === 'to-de'} onClick={() => setDir('to-de')}>{SUBJECTS[subject].name} → Deutsch</button>
              <button aria-pressed={dir === 'from-de'} onClick={() => setDir('from-de')}>Deutsch → {SUBJECTS[subject].name}</button>
            </div>
          )}
          <label className="switch"><span>Nur Fehler üben <span className="muted small">({wrongCount})</span></span><input type="checkbox" id="onlywrong" checked={onlyWrong} onChange={(e) => setOnlyWrong(e.target.checked)} disabled={!wrongCount} /></label>
        </section>
        <button className={'btn block ' + subject + (run && !done ? ' ghost' : '')} disabled={!pool.length || (mode === 'mc' && (data.vocab.length < 4))} onClick={() => start(pool)}>
          {pool.length ? `${run && !done ? 'Neuen Test starten' : 'Test starten'} · ${pool.length} Vokabeln` : 'Keine Vokabeln ausgewählt'}
        </button>
        {mode === 'mc' && data.vocab.length < 4 && <p className="hint center">Für Auswahl-Fragen braucht es mindestens 4 Vokabeln.</p>}
      </>)}
    </main>
  );
}

function Question({ subject, mode, dir, run, all, onAnswer, onNext, onBack }: {
  subject: Subject; mode: Mode; dir: Dir; run: Run; all: Vocab[];
  onAnswer: (ok: boolean, you: string) => void; onNext: () => void; onBack: (answered: boolean) => void;
}) {
  const v = run.list[run.i];
  const toDe = mode === 'listen' ? false : dir === 'to-de';
  const prompt = toDe ? v.term : v.translation;
  const answer = mode === 'listen' ? v.term : toDe ? v.translation : v.term;
  const [picked, setPicked] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [g, setG] = useState<Grade | null>(null);
  const inp = useRef<HTMLInputElement>(null);
  const auto = useSettings().autoNext;
  // Immer die aktuelle onNext verwenden (nach onAnswer hat der Elternteil neu gerendert)
  const nextRef = useRef(onNext); nextRef.current = onNext;
  const gone = useRef(false);
  useEffect(() => () => { gone.current = true; }, []);
  const [autoing, setAutoing] = useState(false);
  /** Richtige Antwort: Vorlesen abwarten, kurz stehen lassen, dann selbst weiter */
  function autoAdvance(spoken: Promise<void>) {
    setAutoing(true);
    const t0 = Date.now();
    Promise.race([spoken, new Promise((r) => setTimeout(r, 4000))]).then(() => {
      setTimeout(() => { if (!gone.current) { gone.current = true; nextRef.current(); } }, Math.max(600, 1300 - (Date.now() - t0)));
    });
  }
  const options = useMemo(() => {
    if (mode !== 'mc') return [];
    const key = (t: string) => t.toLowerCase().replace(/\([^)]*\)/g, '').replace(/[^\p{L}\d]+/gu, '');
    const seen = new Set([key(answer)]);
    const others: string[] = [];
    for (const o of shuffle(all.map((x) => (toDe ? x.translation : x.term)))) {
      if (others.length === 3) break;
      if (seen.has(key(o))) continue;
      seen.add(key(o)); others.push(o);
    }
    return shuffle([answer, ...others]);
  }, [mode, all, toDe, answer]);

  const speakPrompt = () => (mode === 'listen' || toDe ? speakOnce(v.term, subject) : speakOnce(v.translation, 'de'));
  useEffect(() => { speakPrompt(); if (mode !== 'mc') setTimeout(() => inp.current?.focus({ preventScroll: true }), 60); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const answered = picked !== null || g !== null;
  function pick(o: string) {
    if (answered) return;
    setPicked(o); onAnswer(o === answer, o);
    const spoken = speakOnce(v.term, subject);
    if (auto && o === answer) autoAdvance(spoken);
  }
  function check(e: React.FormEvent) {
    e.preventDefault();
    if (answered) { onNext(); return; }
    if (!typed.trim()) return;
    const r = grade(typed, answer);
    setG(r); onAnswer(r === 'ok', typed);
    const spoken = speakOnce(v.term, subject, r !== 'ok' && (mode === 'listen' || !toDe));
    if (auto && r === 'ok') autoAdvance(spoken);
  }
  const keys = ACCENTS[toDe ? 'de' : subject];
  const insert = (k: string) => {
    const el = inp.current; if (!el) return;
    const a = el.selectionStart ?? typed.length, b = el.selectionEnd ?? a;
    const nv = typed.slice(0, a) + k + typed.slice(b);
    setTyped(nv);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + k.length, a + k.length); });
  };
  const ok = picked !== null ? picked === answer : g === 'ok';
  const fbKind = ok ? 'ok' : g === 'accent' || g === 'almost' ? 'almost' : 'bad';
  const fbTitle = ok ? 'Richtig!' : g === 'accent' ? 'Fast! Achte auf Akzente und Apostrophe.' : g === 'almost' ? 'Knapp daneben, ein Buchstabe stimmt nicht.' : 'Leider falsch. Richtig ist:';

  return (
    <main className="app">
      <div className="row"><span className="muted small grow">Frage {run.i + 1} von {run.list.length} · {run.score} richtig</span><button className="btn sm" onClick={() => onBack(answered)}><IBack />Zurück</button></div>
      <div className="qbar"><span style={{ width: `${(run.i / run.list.length) * 100}%` }} /></div>
      <section className="glass pad stack">
        <span className="eyebrow">{mode === 'listen' ? 'Hör zu und schreib es auf' : toDe ? 'Was heißt das auf Deutsch?' : `Wie heißt das auf ${SUBJECTS[subject].name}?`}</span>
        {mode !== 'listen' && <div className="qword" lang={toDe ? subject : 'de'}>{prompt}</div>}
        <div><button className="btn" onClick={speakPrompt}><ISpeaker />{mode === 'listen' ? 'Nochmal anhören' : 'Anhören'}</button></div>
      </section>

      {mode === 'mc' ? (
        <div className="stack">
          {options.map((o) => (
            <button key={o} className={'qopt' + (answered && o === answer ? ' right' : '') + (answered && o === picked && o !== answer ? ' wrong' : '')} disabled={answered} onClick={() => pick(o)} lang={toDe ? 'de' : subject}>{o}</button>
          ))}
        </div>
      ) : (
        <form className="stack" onSubmit={check} autoComplete="off">
          <input ref={inp} className="inp" style={{ fontSize: '1.2rem', padding: 15 }} id="answer" value={typed} onChange={(e) => setTyped(e.target.value)} disabled={answered}
            lang={toDe ? 'de' : subject} autoCapitalize="off" autoCorrect="off" spellCheck={false} placeholder={toDe ? 'Auf Deutsch …' : `Auf ${SUBJECTS[subject].name} …`} aria-label="Deine Antwort" />
          {!answered && keys.length > 0 && <div className="acc">{keys.map((k) => <button type="button" key={k} onClick={() => insert(k)} aria-label={`${k} einfügen`}>{k}</button>)}</div>}
          {!answered && <button className="btn primary block">Prüfen</button>}
        </form>
      )}

      {answered && (
        <div className={'fb ' + fbKind} role="status">
          <b>{fbTitle}{autoing && <span className="small" style={{ fontWeight: 600, opacity: .8 }}> · gleich geht's weiter</span>}</b>
          <span className="sol" lang={subject}>{v.term} = {v.translation}</span>
          {!ok && mode !== 'mc' && <span className="small">Du hast geschrieben: {typed}</span>}
          <div className="row wrap">
            <button className="btn sm" onClick={() => speakOnce(v.term, subject)}>Anhören</button>
            <button className="btn sm" onClick={() => speakOnce(v.term, subject, true)}>Buchstabieren</button>
          </div>
        </div>
      )}
      {answered && !autoing && (
        <div className="dock">
          <button className="btn primary block nextbtn" onClick={onNext}>{run.i < run.list.length - 1 ? 'Weiter' : 'Ergebnis ansehen'}</button>
        </div>
      )}
    </main>
  );
}
