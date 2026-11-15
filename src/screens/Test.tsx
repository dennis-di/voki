import { useEffect, useMemo, useRef, useState } from 'react';
import type { Go, TestPreset } from '../App';
import { loadActivity, loadSubject, recordAnswer, type AnswerMode } from '../lib/data';
import { levelOf, streakInfo } from '../lib/progress';
import { setSettings, useSettings } from '../lib/settings';
import { speakOnce, stopOnce, unlockAudio } from '../lib/speech';
import { grade, letterDiff, shuffle, splitArticle, type Grade } from '../lib/text';
import { LEVELS, SUBJECTS, isWord, type Stat, type Subject, type Unit, type Vocab } from '../lib/types';
import { IBack, ISpeaker } from '../ui/icons';
import { SettingsButton, toast } from '../ui/common';
import { Voki } from '../ui/Voki';
import { SubjectSwitch } from './Home';
import { RuleCard, Term, groupUnit } from './UnitView';

/** Art einer einzelnen Frage */
type Kind = 'mc-to-de' | 'mc-from-de' | 'write' | 'write-to-de' | 'listen' | 'puzzle';
/** Art des ganzen Tests */
type Mode = 'auto' | 'mc' | 'write' | 'listen' | 'puzzle' | 'rehearsal';
type Dir = 'to-de' | 'from-de';
interface Wrong { v: Vocab; you: string }
interface Run {
  mode: Mode; list: Vocab[]; kinds: Kind[]; ex: number[]; i: number; score: number; wrong: Wrong[];
  combo: number; best: number; xp: number; ups: number; requeued: string[]; shownRules: string[]; title?: string;
}

const RUN_KEY = 'vw:test-run2';
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
const ANSWER_MODE: Record<Kind, AnswerMode> = { 'mc-to-de': 'mc-to-de', 'mc-from-de': 'mc-from-de', write: 'write', 'write-to-de': 'mc-to-de', listen: 'listen', puzzle: 'puzzle' };
const BASE_XP: Record<Kind, number> = { 'mc-to-de': 1, 'mc-from-de': 1, write: 3, 'write-to-de': 2, listen: 3, puzzle: 2 };
const comboMult = (c: number) => (c >= 10 ? 3 : c >= 5 ? 2 : 1);
const REHEARSAL_SECONDS = 30;

/** Lernweg: die Stufe bestimmt die Frageart */
const kindForLevel = (lvl: number): Kind => (lvl <= 0 ? 'mc-to-de' : lvl === 1 ? 'mc-from-de' : 'write');

/* ───────── Auswahl: Unit → Seite → Abschnitt ───────── */
const key = (v: Vocab) => [`u:${v.unit_id}`, `u:${v.unit_id}|p:${v.page || ''}`, `u:${v.unit_id}|p:${v.page || ''}|s:${v.section || ''}`];
function inSel(v: Vocab, sel: Set<string>) { return sel.size === 0 || key(v).some((k) => sel.has(k)); }
function toggleKey(sel: Set<string>, k: string) {
  const n = new Set(sel);
  if (n.has(k)) { n.delete(k); return n; }
  for (const x of [...n]) if (x.startsWith(k + '|') || k.startsWith(x + '|')) n.delete(x);
  n.add(k);
  return n;
}

export default function Test({ go, onActive, preset }: { go: Go; onActive: (active: boolean) => void; preset?: TestPreset }) {
  const s = useSettings();
  const subject = s.subject;
  const [data, setData] = useState<{ units: Unit[]; vocab: Vocab[]; stats: Stat[] } | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [openUnit, setOpenUnit] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('auto');
  const [dir, setDir] = useState<Dir>('to-de');
  const [onlyWrong, setOnlyWrong] = useState(false);
  const [run, setRunState] = useState<Run | null>(() => saved[subject] || null);
  const [playing, setPlaying] = useState(false);
  const [done, setDone] = useState(false);
  const [goalMsg, setGoalMsg] = useState('');
  const setRun = (r: Run | null) => { setRunState(r); saveRun(subject, r); };
  const presetUsed = useRef(false);

  useEffect(() => { setData(null); setSel(new Set()); setRunState(saved[subject] || null); setPlaying(false); setDone(false); loadSubject(subject).then(setData).catch(() => setData({ units: [], vocab: [], stats: [] })); }, [subject]);
  useEffect(() => () => { stopOnce(); onActive(false); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { onActive(!!run && playing && !done); }, [run, playing, done]); // eslint-disable-line react-hooks/exhaustive-deps

  const units = data?.units || [];
  const allVocab = data?.vocab || [];
  const words = useMemo(() => allVocab.filter(isWord), [allVocab]);
  const statBy = useMemo(() => new Map((data?.stats || []).map((x) => [x.vocab_id, x])), [data]);
  const selected = words.filter((v) => inSel(v, sel));
  const wrongCount = selected.filter((v) => statBy.get(v.id)?.last_correct === false).length;
  const pool = selected.filter((v) => !onlyWrong || statBy.get(v.id)?.last_correct === false)
    .filter((v) => mode !== 'puzzle' || (v.examples?.length ?? 0) > 0);

  /** Merk-Regeln: gehören zur Vokabel direkt davor und direkt danach (gleiche Seite und Abschnitt) */
  const ruleFor = useMemo(() => {
    const m = new Map<string, Vocab>();
    const byUnit = new Map<string, Vocab[]>();
    for (const v of allVocab) { if (!byUnit.has(v.unit_id)) byUnit.set(v.unit_id, []); byUnit.get(v.unit_id)!.push(v); }
    for (const list of byUnit.values()) list.forEach((v, i) => {
      if (isWord(v)) return;
      const same = (x?: Vocab) => x && isWord(x) && (x.page || '') === (v.page || '') && (x.section || '') === (v.section || '');
      const before = list[i - 1], after = list[i + 1];
      if (same(before) && !m.has(before!.id)) m.set(before!.id, v);
      if (same(after) && !m.has(after!.id)) m.set(after!.id, v);
    });
    return m;
  }, [allVocab]);

  function build(list: Vocab[], m: Mode, d: Dir, title?: string): Run {
    const l = m === 'auto' ? [...list].sort((a, b) => levelOf(statBy.get(a.id)) - levelOf(statBy.get(b.id)) || Math.random() - 0.5) : shuffle(list);
    const kinds: Kind[] = l.map((v) => {
      if (m === 'auto') return kindForLevel(levelOf(statBy.get(v.id)));
      if (m === 'mc') return d === 'to-de' ? 'mc-to-de' : 'mc-from-de';
      if (m === 'write') return d === 'to-de' ? 'write-to-de' : 'write';
      if (m === 'listen') return 'listen';
      if (m === 'puzzle') return 'puzzle';
      // Generalprobe: gemischt, Schwerpunkt Schreiben
      const r = Math.random(); return r < 0.5 ? 'write' : r < 0.75 ? 'listen' : 'mc-from-de';
    });
    const ex = l.map((v) => Math.floor(Math.random() * Math.max(1, v.examples?.length || 1)));
    return { mode: m, list: l, kinds, ex, i: 0, score: 0, wrong: [], combo: 0, best: 0, xp: 0, ups: 0, requeued: [], shownRules: [], title };
  }
  function start(list: Vocab[], m: Mode = mode, d: Dir = dir, title?: string) {
    if (!list.length) return;
    unlockAudio(); setRun(build(list, m, d, title)); setDone(false); setPlaying(true); setGoalMsg(''); window.scrollTo({ top: 0 });
  }
  function resume() { unlockAudio(); setPlaying(true); window.scrollTo({ top: 0 }); }
  function next(r: Run) {
    if (r.i < r.list.length - 1) { setRun({ ...r, i: r.i + 1 }); return true; }
    setDone(true); saveRun(subject, null);
    loadActivity().then((a) => { const st = streakInfo(a, s.dailyGoal); setGoalMsg(st.goalReached ? `Tagesziel erreicht · ${st.streak} ${st.streak === 1 ? 'Tag' : 'Tage'} in Folge` : `Heute ${st.todayCorrect} von ${s.dailyGoal} richtig fürs Tagesziel`); });
    return false;
  }

  // Vorgabe aus der Startseite (Test-Countdown): automatisch starten, sobald die Daten da sind
  useEffect(() => {
    if (!preset || !data || presetUsed.current) return;
    presetUsed.current = true;
    const list = preset.vocabIds?.length ? words.filter((v) => preset.vocabIds!.includes(v.id))
      : words.filter((v) => !preset.unitIds?.length || preset.unitIds.includes(v.unit_id));
    if (list.length) start(list, preset.mode, 'from-de', preset.title);
    else toast('Für diesen Test gibt es nichts mehr zu üben.');
  }, [preset, data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (run && playing && !done) {
    const v = run.list[run.i];
    const rule = ruleFor.get(v.id);
    const showRule = rule && !run.shownRules.includes(rule.id) && run.mode !== 'rehearsal' ? rule : undefined;
    return <Question key={run.i} subject={subject} kind={run.kinds[run.i]} run={run} all={words} rule={showRule} exIdx={run.ex[run.i] || 0}
      level={levelOf(statBy.get(v.id))} timed={run.mode === 'rehearsal'}
      onAnswer={async (ok, you) => {
        const k = run.kinds[run.i];
        const combo = ok ? run.combo + 1 : 0;
        const gain = ok ? BASE_XP[k] * comboMult(combo) : 0;
        let nr: Run = {
          ...run, score: run.score + (ok ? 1 : 0), combo, best: Math.max(run.best, combo), xp: run.xp + gain,
          wrong: ok ? run.wrong : [...run.wrong, { v, you }],
          shownRules: showRule ? [...run.shownRules, showRule.id] : run.shownRules,
        };
        // Lernweg: Falsches kommt am Ende nochmal dran (einmal, eine Stufe leichter)
        if (!ok && run.mode === 'auto' && !run.requeued.includes(v.id)) {
          const easier: Kind = k === 'write' ? 'mc-from-de' : 'mc-to-de';
          nr = { ...nr, list: [...nr.list, v], kinds: [...nr.kinds, easier], ex: [...nr.ex, 0], requeued: [...nr.requeued, v.id] };
        }
        setRun(nr);
        const before = levelOf(statBy.get(v.id));
        const r = await recordAnswer(v.id, ok, ANSWER_MODE[k], gain).catch(() => null);
        if (r) {
          statBy.set(v.id, { ...(statBy.get(v.id) || { vocab_id: v.id, correct: 0, wrong: 0, last_correct: null, last_seen: null }), level: r.level, last_correct: ok });
          if (r.level >= 3 && before < 3) { setRunState((cur) => (cur ? { ...cur, ups: cur.ups + 1 } : cur)); toast(`„${v.term}“ sitzt jetzt!`); }
        }
        return r?.level ?? null;
      }}
      onNext={() => { stopOnce(); next(run); window.scrollTo({ top: 0 }); }}
      onBack={(answered) => {
        stopOnce();
        if (answered && !next(run)) return;
        setPlaying(false); window.scrollTo({ top: 0 });
      }} />;
  }

  if (run && done) {
    const n = run.list.length, r = run.score / n;
    const mood = r >= 0.9 ? 'proud' : r >= 0.6 ? 'happy' : 'sad';
    return (
      <main className="app">
        <section className="glass pad stack center" style={{ alignItems: 'center' }}>
          <Voki mood={mood} size={120} />
          <span className="eyebrow">{run.title || 'Ergebnis'}</span>
          <div className="result gradtext">{run.score} / {n}</div>
          <h2>{r >= 0.9 ? (subject === 'fr' ? 'Très bien !' : 'Brilliant!') : r >= 0.7 ? (subject === 'fr' ? 'Bien joué !' : 'Well done!') : (subject === 'fr' ? 'Encore un peu !' : 'Keep going!')}</h2>
          <div className="chips" style={{ justifyContent: 'center' }}>
            <span className="pill">+{run.xp} XP</span>
            {run.best >= 3 && <span className="pill">Beste Serie: {run.best}</span>}
            {run.ups > 0 && <span className="pill ok">{run.ups} {run.ups === 1 ? 'Wort sitzt' : 'Wörter sitzen'} neu</span>}
          </div>
          {goalMsg && <p className="muted small" style={{ margin: 0 }}>{goalMsg}</p>}
          <p className="muted" style={{ margin: 0 }}>{run.wrong.length ? `${run.wrong.length} Fehler zum Üben` : 'Alles richtig.'}</p>
        </section>
        {run.wrong.length > 0 && (
          <ul className="list solid">
            {run.wrong.map((w, i) => <li key={i}><b><Term v={w.v} subject={subject} /> = {w.v.translation}</b><span className="muted small">Deine Antwort: {w.you || '–'}</span></li>)}
          </ul>
        )}
        <div className="row wrap">
          {run.wrong.length > 0 && <button className="btn primary" onClick={() => start([...new Map(run.wrong.map((w) => [w.v.id, w.v])).values()], run.mode === 'rehearsal' ? 'auto' : run.mode, 'from-de')}>Nur Fehler wiederholen</button>}
          <button className="btn" onClick={() => { setRun(null); setDone(false); setPlaying(false); loadSubject(subject).then(setData); }}>Neuer Test</button>
          <button className="btn" onClick={() => go({ n: 'home' })}>Zur Startseite</button>
        </div>
      </main>
    );
  }

  const MODES: { m: Mode; label: string; hint: string }[] = [
    { m: 'auto', label: 'Lernweg', hint: 'Passt sich an: neue Wörter als Auswahl, sichere Wörter zum Schreiben. Zweimal richtig = eine Stufe höher.' },
    { m: 'mc', label: 'Auswahl', hint: 'Vier Antworten, eine stimmt. Gut zum Wiedererkennen.' },
    { m: 'write', label: 'Schreiben', hint: 'Die Übersetzung selbst schreiben. Erst das zählt als „sitzt“.' },
    { m: 'listen', label: 'Diktat', hint: 'Das Wort wird nur vorgelesen. Du schreibst es so, wie es geschrieben wird.' },
    { m: 'puzzle', label: 'Satz-Puzzle', hint: 'Beispielsätze aus dem Buch in die richtige Reihenfolge bringen.' },
    { m: 'rehearsal', label: 'Generalprobe', hint: `Wie im echten Test: gemischt, ohne Hilfen, ${REHEARSAL_SECONDS} Sekunden pro Frage.` },
  ];
  const lvlCounts = [0, 1, 2, 3].map((l) => selected.filter((v) => Math.min(3, levelOf(statBy.get(v.id))) === l).length);

  return (
    <main className="app">
      <header className="row" style={{ alignItems: 'flex-start' }}>
        <div className="stack grow" style={{ gap: 4 }}><span className="eyebrow">Üben &amp; Testen</span><h1>Was <span className="gradtext">sitzt</span> schon?</h1></div>
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
          <div className="row"><h3 className="grow">Was üben?</h3>{sel.size > 0 && <button className="link" onClick={() => setSel(new Set())}>Alles</button>}</div>
          <div className="tree">
            {units.map((u) => {
              const uk = `u:${u.id}`;
              const pages = groupUnit(allVocab.filter((v) => v.unit_id === u.id));
              const opened = openUnit === u.id;
              const hasSub = pages.length > 1 || pages.some((p) => p.name || p.sections.length > 1);
              return (
                <div key={u.id} className="tnode">
                  <div className="row">
                    <button className="chip grow tchip" aria-pressed={sel.has(uk)} onClick={() => setSel(toggleKey(sel, uk))}>{u.title}</button>
                    {hasSub && <button className="ib" aria-expanded={opened} aria-label={`Seiten und Abschnitte von ${u.title}`} onClick={() => setOpenUnit(opened ? null : u.id)}>{opened ? '−' : '+'}</button>}
                  </div>
                  {opened && pages.map((p) => {
                    const pk = `${uk}|p:${p.name}`;
                    return (
                      <div key={p.name} className="tsub">
                        <button className="chip" aria-pressed={sel.has(pk)} data-inherit={sel.has(uk) || undefined} onClick={() => setSel(toggleKey(sel, pk))}>{p.name ? `Seite ${p.name}` : 'Ohne Seite'}</button>
                        <div className="chips">
                          {p.sections.filter((x) => x.items.some(isWord)).map((x) => {
                            const sk = `${pk}|s:${x.name}`;
                            return <button key={x.name} className="chip sm" aria-pressed={sel.has(sk)} data-inherit={sel.has(uk) || sel.has(pk) || undefined} onClick={() => setSel(toggleKey(sel, sk))}>{x.name ? `Abschnitt ${x.name}` : 'ohne Abschnitt'}</button>;
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
          <p className="hint">{sel.size === 0 ? 'Alle Units ausgewählt. ' : ''}Tippe Units, Seiten oder Abschnitte an, um sie zusammen abzufragen.</p>
          {selected.length > 0 && (
            <div className="levels" aria-label="Lernstufen der Auswahl">
              {lvlCounts.map((n, l) => <div key={l} className={'lvl l' + l}><b>{n}</b><span>{LEVELS[l]}</span></div>)}
            </div>
          )}
        </section>
        <section className="glass pad stack">
          <h3>Art</h3>
          <div className="modegrid" role="group" aria-label="Art des Tests">
            {MODES.map((x) => <button key={x.m} aria-pressed={mode === x.m} onClick={() => setMode(x.m)}>{x.label}</button>)}
          </div>
          <p className="hint">{MODES.find((x) => x.m === mode)!.hint}</p>
          {(mode === 'mc' || mode === 'write') && (
            <div className="seg" role="group" aria-label="Richtung">
              <button aria-pressed={dir === 'to-de'} onClick={() => setDir('to-de')}>{SUBJECTS[subject].name} → Deutsch</button>
              <button aria-pressed={dir === 'from-de'} onClick={() => setDir('from-de')}>Deutsch → {SUBJECTS[subject].name}</button>
            </div>
          )}
          <label className="switch"><span>Nur Fehler üben <span className="muted small">({wrongCount})</span></span><input type="checkbox" id="onlywrong" checked={onlyWrong} onChange={(e) => setOnlyWrong(e.target.checked)} disabled={!wrongCount} /></label>
        </section>
        <button className={'btn block ' + subject + (run && !done ? ' ghost' : '')} disabled={!pool.length || (mode !== 'puzzle' && words.length < 4)} onClick={() => start(pool)}>
          {pool.length ? `${run && !done ? 'Neuen Test starten' : 'Los'} · ${pool.length} ${mode === 'puzzle' ? 'Sätze' : 'Vokabeln'}` : mode === 'puzzle' ? 'Keine Beispielsätze in der Auswahl' : 'Keine Vokabeln ausgewählt'}
        </button>
        {mode !== 'puzzle' && words.length < 4 && <p className="hint center">Für Auswahl-Fragen braucht es mindestens 4 Vokabeln.</p>}
      </>)}
    </main>
  );
}

/* ───────── Eine Frage ───────── */
function Question({ subject, kind, run, all, rule, exIdx, level, timed, onAnswer, onNext, onBack }: {
  subject: Subject; kind: Kind; run: Run; all: Vocab[]; rule?: Vocab; exIdx: number; level: number; timed: boolean;
  onAnswer: (ok: boolean, you: string) => Promise<number | null>; onNext: () => void; onBack: (answered: boolean) => void;
}) {
  const v = run.list[run.i];
  const auto = useSettings().autoNext && !timed;
  const toDe = kind === 'mc-to-de' || kind === 'write-to-de';
  const isMc = kind === 'mc-to-de' || kind === 'mc-from-de';
  const example = v.examples?.[exIdx] || v.examples?.[0];
  const answer = kind === 'puzzle' ? example?.fr || v.term : toDe ? v.translation : v.term;
  const prompt = kind === 'puzzle' ? example?.de || v.translation : toDe ? v.term : v.translation;
  const [picked, setPicked] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [g, setG] = useState<Grade | null>(null);
  const [newLevel, setNewLevel] = useState<number | null>(null);
  const [left, setLeft] = useState(REHEARSAL_SECONDS);
  const inp = useRef<HTMLInputElement>(null);
  const nextRef = useRef(onNext); nextRef.current = onNext;
  const gone = useRef(false);
  useEffect(() => () => { gone.current = true; }, []);
  const [autoing, setAutoing] = useState(false);
  function autoAdvance(spoken: Promise<void>) {
    setAutoing(true);
    const t0 = Date.now();
    Promise.race([spoken, new Promise((r) => setTimeout(r, 4000))]).then(() => {
      setTimeout(() => { if (!gone.current) { gone.current = true; nextRef.current(); } }, Math.max(700, 1400 - (Date.now() - t0)));
    });
  }

  /* Puzzle: Wortkacheln */
  const tokens = useMemo(() => (kind === 'puzzle' ? shuffle(answer.split(/\s+/).filter(Boolean).map((t, i) => ({ t, i }))) : []), [kind, answer]);
  const [placed, setPlaced] = useState<number[]>([]);

  /* Auswahl: ähnliche Antworten als Ablenkung (gleicher Artikel, ähnlicher Anfang) */
  const options = useMemo(() => {
    if (!isMc) return [];
    const k = (t: string) => t.toLowerCase().replace(/\([^)]*\)/g, '').replace(/[^\p{L}\d]+/gu, '');
    const field = (x: Vocab) => (toDe ? x.translation : x.term);
    const art = splitArticle(answer).article.toLowerCase(), core = k(splitArticle(answer).rest);
    const score = (o: string) => {
      const a = splitArticle(o); let sc = 0;
      if (!toDe && art && a.article.toLowerCase() === art) sc += 2;
      const c = k(a.rest); let p = 0; while (p < c.length && p < core.length && c[p] === core[p]) p++;
      return sc + Math.min(p, 3) + Math.random() * 1.5;
    };
    const seen = new Set([k(answer)]);
    const cands = [...new Set(all.map(field))].filter((o) => !seen.has(k(o))).sort((a, b) => score(b) - score(a));
    const others: string[] = [];
    for (const o of cands) { if (others.length === 3) break; if (seen.has(k(o))) continue; seen.add(k(o)); others.push(o); }
    return shuffle([answer, ...others]);
  }, [isMc, all, toDe, answer]);

  const speakPrompt = () => (kind === 'puzzle' ? speakOnce(prompt, 'de') : kind === 'listen' || toDe ? speakOnce(v.term, subject) : speakOnce(v.translation, 'de'));
  useEffect(() => { speakPrompt(); if (!isMc && kind !== 'puzzle') setTimeout(() => inp.current?.focus({ preventScroll: true }), 60); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const answered = picked !== null || g !== null;
  // Generalprobe: Zeit läuft
  useEffect(() => {
    if (!timed || answered) return;
    if (left <= 0) { finish(false, typed || '(Zeit abgelaufen)', 'bad'); return; }
    const t = setTimeout(() => setLeft((x) => x - 1), 1000);
    return () => clearTimeout(t);
  }, [timed, left, answered]); // eslint-disable-line react-hooks/exhaustive-deps

  async function finish(ok: boolean, you: string, gr: Grade | null) {
    if (gr) setG(gr);
    const spoken = kind === 'puzzle' ? speakOnce(answer, subject) : speakOnce(v.term, subject, !ok && !timed && (kind === 'listen' || kind === 'write'));
    const lvl = await onAnswer(ok, you);
    if (lvl !== null && lvl !== level) setNewLevel(lvl);
    if (auto && ok) autoAdvance(spoken);
  }
  function pick(o: string) {
    if (answered) return;
    setPicked(o); finish(o === answer, o, null);
  }
  function check(e: React.FormEvent) {
    e.preventDefault();
    if (answered) { onNext(); return; }
    if (!typed.trim()) return;
    const r = grade(typed, answer);
    finish(r === 'ok', typed, r);
  }
  function place(idx: number) {
    if (answered) return;
    const np = [...placed, idx];
    setPlaced(np);
    if (np.length === tokens.length) {
      const built = np.map((j) => tokens[j].t).join(' ');
      const ok = built === answer || np.every((j, n) => tokens[j].t === answer.split(/\s+/).filter(Boolean)[n]);
      setG(ok ? 'ok' : 'bad'); finish(ok, built, null);
    }
  }
  const keys = ACCENTS[toDe ? 'de' : subject];
  const insert = (k: string) => {
    const el = inp.current; if (!el) return;
    const a = el.selectionStart ?? typed.length, b = el.selectionEnd ?? a;
    setTyped(typed.slice(0, a) + k + typed.slice(b));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + k.length, a + k.length); });
  };
  const ok = picked !== null ? picked === answer : g === 'ok';
  const fbKind = ok ? 'ok' : g === 'accent' || g === 'almost' || g === 'article' ? 'almost' : 'bad';
  const fbTitle = ok ? (run.combo >= 5 ? `Richtig! Combo ${run.combo}` : 'Richtig!')
    : g === 'article' ? (subject === 'fr' ? 'Fast! Der Artikel stimmt nicht (le/la, un/une).' : 'Fast! Achte auf den Artikel.')
      : g === 'accent' ? 'Fast! Achte auf Akzente und Apostrophe.'
        : g === 'almost' ? 'Knapp daneben, ein Buchstabe stimmt nicht.' : 'Leider falsch. Richtig ist:';
  const mood = !answered ? (timed && left <= 5 ? 'wow' : 'neutral') : ok ? (newLevel === 3 ? 'proud' : 'happy') : fbKind === 'almost' ? 'neutral' : 'sad';
  const diff = answered && !ok && g && g !== 'bad' && kind !== 'puzzle' ? letterDiff(typed, answer) : null;
  const ask = kind === 'listen' ? 'Hör zu und schreib es auf' : kind === 'puzzle' ? 'Bau den Satz' : toDe ? 'Was heißt das auf Deutsch?' : `Wie heißt das auf ${SUBJECTS[subject].name}?`;
  const mult = comboMult(run.combo + 1);

  return (
    <main className="app">
      <div className="row">
        <span className="muted small grow">Frage {run.i + 1} von {run.list.length} · {run.score} richtig{run.combo >= 2 ? ` · Serie ${run.combo}` : ''}</span>
        {mult > 1 && !answered && <span className="pill hot">×{mult} XP</span>}
        {timed && !answered && <span className={'pill' + (left <= 5 ? ' hot' : '')} aria-live="polite">{left}s</span>}
        <button className="btn sm" onClick={() => onBack(answered)}><IBack />Zurück</button>
      </div>
      <div className="qbar"><span style={{ width: `${(run.i / run.list.length) * 100}%` }} /></div>

      {rule && <div className="stack" style={{ gap: 6 }}><span className="eyebrow">Merk dir</span><RuleCard text={rule.term} /></div>}

      <section className="glass pad stack qcard">
        <div className="qvoki"><Voki mood={mood} size={64} /></div>
        <span className="eyebrow">{ask}{run.mode === 'auto' && <span className="lvltag">Stufe: {LEVELS[Math.min(3, level)]}</span>}</span>
        {kind !== 'listen' && (
          <div className={'qword' + (kind === 'puzzle' ? ' qsent' : '')} lang={toDe ? subject : 'de'}>
            {toDe ? <Term v={v} subject={subject} /> : prompt}
          </div>
        )}
        {!toDe && kind === 'write' && v.gender && <span className="hint">Nomen: mit Artikel schreiben.</span>}
        <div><button className="btn" onClick={speakPrompt}><ISpeaker />{kind === 'listen' ? 'Nochmal anhören' : 'Anhören'}</button></div>
      </section>

      {isMc && (
        <div className="stack">
          {options.map((o) => (
            <button key={o} className={'qopt' + (answered && o === answer ? ' right' : '') + (answered && o === picked && o !== answer ? ' wrong' : '')} disabled={answered} onClick={() => pick(o)} lang={toDe ? 'de' : subject}>{o}</button>
          ))}
        </div>
      )}
      {kind === 'puzzle' && (
        <div className="stack">
          <div className="pzline" aria-label="Dein Satz" lang={subject}>
            {placed.length === 0 && <span className="muted small">Tippe die Wörter in der richtigen Reihenfolge an.</span>}
            {placed.map((j, n) => <button key={n} className="pz on" disabled={answered} onClick={() => setPlaced(placed.filter((_, m) => m !== n))}>{tokens[j].t}</button>)}
          </div>
          <div className="pzbank" lang={subject}>
            {tokens.map((tk, j) => <button key={j} className="pz" disabled={answered || placed.includes(j)} onClick={() => place(j)}>{tk.t}</button>)}
          </div>
        </div>
      )}
      {!isMc && kind !== 'puzzle' && (
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
          {diff ? (
            <span className="diff" lang={subject} aria-label={`Richtig: ${answer}`}>
              {diff.chars.map((c, k) => <span key={k} className={c.ch === ' ' ? 'sp' : c.bad ? 'bad' : ''}>{c.ch}</span>)}
            </span>
          ) : kind === 'puzzle' ? <span className="sol" lang={subject}>{answer}</span> : <span className="sol"><Term v={v} subject={subject} /> = {v.translation}</span>}
          {diff && <span className="small">Du hast geschrieben: {typed}{diff.extra ? ` · ${diff.extra} Buchstabe${diff.extra > 1 ? 'n' : ''} zu viel` : ''}</span>}
          {!diff && !ok && !isMc && kind !== 'puzzle' && typed && <span className="small">Du hast geschrieben: {typed}</span>}
          {newLevel !== null && <span className="small lvlup">{newLevel > level ? `Stufe hoch: ${LEVELS[Math.min(3, newLevel)]}` : `Stufe zurück: ${LEVELS[Math.min(3, newLevel)]}`}</span>}
          {kind !== 'puzzle' && example && !timed && <span className="small exline" lang={subject}>{example.fr}{example.de ? ` · ${example.de}` : ''}</span>}
          <div className="row wrap">
            <button className="btn sm" onClick={() => speakOnce(kind === 'puzzle' ? answer : v.term, subject)}>Anhören</button>
            {kind !== 'puzzle' && <button className="btn sm" onClick={() => speakOnce(v.term, subject, true)}>Buchstabieren</button>}
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
