import { useEffect, useState } from 'react';
import type { Go } from '../App';
import { deleteExam, leagueWeek, loadActivity, loadExams, loadSubject, saveExam, saveUnit } from '../lib/data';
import { ACCESSORIES, daysBetween, examPlan, homeMood, levelOf, localDay, masteredUnits, streakInfo, unlockedAccessories } from '../lib/progress';
import { SAMPLE_FR } from '../lib/sample';
import { setSettings, useSettings } from '../lib/settings';
import { SUBJECTS, isWord, type Activity, type Exam, type Profile, type Stat, type Subject, type Unit, type Vocab } from '../lib/types';
import { Logo, SettingsButton, toast } from '../ui/common';
import { ICamera, ITrash } from '../ui/icons';
import { Voki } from '../ui/Voki';

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

const pagesLabel = (vs: Vocab[]) => {
  const ps = [...new Set(vs.map((v) => v.page).filter(Boolean))] as string[];
  if (!ps.length) return '';
  const nums = ps.map(Number).filter((n) => !isNaN(n)).sort((a, b) => a - b);
  if (nums.length === ps.length && nums.length > 1 && nums[nums.length - 1] - nums[0] === nums.length - 1) return `Seiten ${nums[0]}–${nums[nums.length - 1]}`;
  return (ps.length > 1 ? 'Seiten ' : 'Seite ') + ps.join(', ');
};
const dayWord = (n: number) => (n === 0 ? 'heute' : n === 1 ? 'morgen' : `in ${n} Tagen`);

export default function Home({ profile, go }: { profile: Profile; go: Go }) {
  const s = useSettings();
  const [data, setData] = useState<{ units: Unit[]; vocab: Vocab[]; stats: Stat[] } | null>(null);
  const [acts, setActs] = useState<Activity[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [league, setLeague] = useState<{ name: string; xp: number; me: boolean }[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [examForm, setExamForm] = useState<{ id?: string; title: string; day: string; unit_ids: string[] } | null>(null);
  const [showCloset, setShowCloset] = useState(false);

  const reloadExams = () => loadExams(s.subject).then(setExams);
  useEffect(() => {
    let live = true;
    setData(null); setErr('');
    loadSubject(s.subject).then((d) => live && setData(d)).catch(() => live && setErr('Die Units konnten nicht geladen werden. Bist du online?'));
    reloadExams();
    return () => { live = false; };
  }, [s.subject]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadActivity().then(setActs); if (profile.in_league) leagueWeek().then(setLeague); }, [profile.in_league]);

  const statBy = new Map((data?.stats || []).map((x) => [x.vocab_id, x]));
  const words = (data?.vocab || []).filter(isWord);
  const toPractice = words.filter((v) => statBy.get(v.id)?.last_correct === false).length;
  const known = words.filter((v) => levelOf(statBy.get(v.id)) >= 3).length;
  const info = streakInfo(acts, s.dailyGoal);
  const mastered = data ? masteredUnits(data.units, data.vocab, data.stats).length : 0;
  const items = unlockedAccessories(mastered);
  const mood = homeMood(info);
  const goalPct = Math.min(1, info.todayCorrect / s.dailyGoal);
  const name = profile.display_name || profile.username;
  const greeting = mood === 'sleepy' ? `${name}, Voki hat dich vermisst.` : mood === 'proud' ? 'Tagesziel geschafft!' : info.todayCorrect ? 'Weiter so!' : `Hallo ${name}`;

  async function addSample() {
    setBusy(true);
    try { const id = await saveUnit({ subject: 'fr', title: SAMPLE_FR.title, subtitle: SAMPLE_FR.subtitle, rows: SAMPLE_FR.rows, removed: [] }); go({ n: 'unit', id }); }
    catch { toast('Das hat nicht geklappt. Bitte nochmal versuchen.'); }
    finally { setBusy(false); }
  }
  async function submitExam() {
    if (!examForm) return;
    if (!examForm.title.trim() || !examForm.day) { toast('Name und Datum fehlen'); return; }
    if (daysBetween(localDay(), examForm.day) < 0) { toast('Das Datum liegt in der Vergangenheit'); return; }
    try { await saveExam({ ...examForm, title: examForm.title.trim(), subject: s.subject }); setExamForm(null); reloadExams(); toast('Test eingetragen'); }
    catch { toast('Speichern hat nicht geklappt. Ist die Datenbank aktualisiert?'); }
  }

  return (
    <main className="app">
      <header className="stack" style={{ gap: 14, paddingTop: 6 }}>
        <div className="row"><span className="grow"><Logo height={30} /></span><SettingsButton onClick={() => go({ n: 'settings' })} /></div>
        <div className="hero">
          <button className="herovoki" onClick={() => setShowCloset(!showCloset)} aria-expanded={showCloset} aria-label="Vokis Sammlung anzeigen"><Voki mood={mood} items={items} size={104} /></button>
          <div className="stack grow" style={{ gap: 8, minWidth: 0 }}>
            <h1 className="hgreet">{greeting.startsWith('Hallo') ? <>Hallo <span className="gradtext">{name}</span></> : greeting}</h1>
            <div className="goal" aria-label={`Tagesziel: ${info.todayCorrect} von ${s.dailyGoal} richtigen Antworten`}>
              <div className="goalbar"><span style={{ width: `${goalPct * 100}%` }} /></div>
              <span className="small"><b>{Math.min(info.todayCorrect, s.dailyGoal)}/{s.dailyGoal}</b> heute</span>
            </div>
            <div className="row wrap" style={{ gap: 6 }}>
              <span className={'pill' + (info.streak ? ' hot' : '')} title="Tage in Folge mit erreichtem Tagesziel">{info.streak} {info.streak === 1 ? 'Tag' : 'Tage'} in Folge</span>
              <span className="pill" title="Ein Tag pro Woche darf ausfallen, ohne dass die Serie reisst">Joker {info.jokerThisWeek ? 'benutzt' : 'frei'}</span>
              {info.todayXp > 0 && <span className="pill">{info.todayXp} XP</span>}
            </div>
          </div>
        </div>
        {showCloset && (
          <div className="glass pad stack closet">
            <h3>Vokis Sammlung</h3>
            <p className="hint">Für jede Unit, in der alle Wörter sitzen, bekommt Voki etwas Neues. {mastered ? `${mastered} ${mastered === 1 ? 'Unit' : 'Units'} geschafft.` : 'Noch keine Unit komplett.'}</p>
            <div className="closetgrid">
              {ACCESSORIES.map((a, i) => (
                <div key={a.id} className={'citem' + (items.includes(a.id) ? '' : ' locked')}>
                  <Voki mood="neutral" items={[a.id]} size={56} label={items.includes(a.id) ? a.name : `${a.name} (noch gesperrt)`} />
                  <span className="small">{items.includes(a.id) ? a.name : `ab ${i + 1}. Unit`}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </header>
      <SubjectSwitch value={s.subject} onChange={(subject) => setSettings({ subject })} />

      {err && <div className="note err">{err}</div>}

      {/* Test-Countdown */}
      {data && exams.map((ex) => {
        const plan = examPlan(ex, data.vocab, data.stats);
        const ready = plan.words.length - plan.open.length;
        return (
          <section key={ex.id} className="glass pad stack exam">
            <div className="row">
              <div className="grow"><span className="eyebrow">Nächster Test · {new Date(ex.day + 'T12:00:00').toLocaleDateString('de-CH', { weekday: 'short', day: 'numeric', month: 'numeric' })}</span><h2>{ex.title}</h2></div>
              <div className="countdown"><b>{plan.daysLeft}</b><span>{plan.daysLeft === 1 ? 'Tag' : 'Tage'}</span></div>
            </div>
            <div className="bar"><span style={{ width: `${plan.words.length ? (ready / plan.words.length) * 100 : 0}%` }} /></div>
            <span className="small muted">{ready} von {plan.words.length} Wörtern sitzen.{plan.open.length ? ` Heute dran: ${plan.today}.` : ' Alles sitzt!'}</span>
            <div className="row wrap">
              {plan.open.length > 0 && !plan.rehearsal && <button className={'btn grow ' + s.subject} onClick={() => go({ n: 'test', preset: { mode: 'auto', vocabIds: plan.queue.map((v) => v.id), title: `${ex.title} · Tagesportion` } })}>Heute {plan.today} Wörter üben</button>}
              {(plan.rehearsal || plan.open.length === 0) && <button className="btn primary grow" onClick={() => go({ n: 'test', preset: { mode: 'rehearsal', unitIds: ex.unit_ids, title: `Generalprobe · ${ex.title}` } })}>Generalprobe {dayWord(plan.daysLeft) === 'heute' ? '' : `(Test ${dayWord(plan.daysLeft)})`}</button>}
              <button className="btn sm" onClick={() => setExamForm({ id: ex.id, title: ex.title, day: ex.day, unit_ids: ex.unit_ids })}>Ändern</button>
            </div>
          </section>
        );
      })}
      {data && data.units.length > 0 && !examForm && <button className="link" style={{ alignSelf: 'flex-start' }} onClick={() => setExamForm({ title: '', day: '', unit_ids: [] })}>+ Test-Termin eintragen</button>}
      {examForm && data && (
        <section className="glass pad stack">
          <h3>{examForm.id ? 'Test ändern' : 'Test eintragen'}</h3>
          <label className="f">Was?<input className="inp" value={examForm.title} onChange={(e) => setExamForm({ ...examForm, title: e.target.value })} maxLength={80} placeholder="z. B. Vokabeltest Unité 2" /></label>
          <label className="f">Wann?<input className="inp" type="date" min={localDay()} value={examForm.day} onChange={(e) => setExamForm({ ...examForm, day: e.target.value })} /></label>
          <span className="lbl small" style={{ fontWeight: 700 }}>Welche Units? <span className="muted">(keine = alle)</span></span>
          <div className="chips">
            {data.units.map((u) => <button key={u.id} className="chip" aria-pressed={examForm.unit_ids.includes(u.id)} onClick={() => setExamForm({ ...examForm, unit_ids: examForm.unit_ids.includes(u.id) ? examForm.unit_ids.filter((x) => x !== u.id) : [...examForm.unit_ids, u.id] })}>{u.title}</button>)}
          </div>
          <p className="hint">Voki verteilt die Wörter auf die Tage bis zum Test. Am Tag davor gibt es eine Generalprobe.</p>
          <div className="row wrap">
            <button className="btn primary" onClick={submitExam}>Speichern</button>
            <button className="btn" onClick={() => setExamForm(null)}>Abbrechen</button>
            {examForm.id && <button className="btn danger" onClick={async () => { await deleteExam(examForm.id!); setExamForm(null); reloadExams(); }}><ITrash />Löschen</button>}
          </div>
        </section>
      )}

      {data && (
        <div className="stats">
          <div className="stat glass"><b>{words.length}</b><span>Vokabeln</span></div>
          <div className="stat glass"><b>{known}</b><span>sitzen</span></div>
          <button className="stat glass" style={{ border: 0, color: 'inherit' }} onClick={() => go({ n: 'test' })} aria-label={`${toPractice} Vokabeln zum Üben, Test öffnen`}>
            <b className={toPractice ? 'gradtext' : ''}>{toPractice}</b><span>zum Üben</span>
          </button>
        </div>
      )}

      <section className="stack">
        <div className="row"><h2 className="grow">Deine Units</h2>{words.length > 0 && <span className="muted small">{known} von {words.length} sitzen</span>}</div>
        {!data && !err && <div className="glass pad muted">Lädt …</div>}
        {data && data.units.length === 0 && (
          <div className="glass empty">
            <Voki mood="wow" size={80} />
            <h3>Noch keine {SUBJECTS[s.subject].name}-Unit</h3>
            <p className="muted" style={{ margin: 0 }}>Fotografiere eine Vokabelseite aus dem Buch. Die App liest sie ab, du prüfst und speicherst.</p>
            <button className={'btn ' + s.subject} onClick={() => go({ n: 'edit' })}><ICamera />Unit per Foto anlegen</button>
            {s.subject === 'fr' && <button className="link" disabled={busy} onClick={addSample}>Beispiel „Au début“ hinzufügen</button>}
          </div>
        )}
        {data && data.units.length > 0 && (
          <div className="units">
            {data.units.map((u) => {
              const vs = words.filter((v) => v.unit_id === u.id);
              const lv = [0, 1, 2, 3].map((l) => vs.filter((v) => Math.min(3, levelOf(statBy.get(v.id))) === l).length);
              const pl = pagesLabel(vs);
              return (
                <button key={u.id} className="ucard glass" onClick={() => go({ n: 'unit', id: u.id })}>
                  <h3>{u.title}</h3>
                  {(u.subtitle || pl) && <span className="muted small">{[u.subtitle, pl].filter(Boolean).join(' · ')}</span>}
                  <span className="meta">{vs.length} Vokabeln · {lv[3]} sitzen</span>
                  <div className="lbar" aria-hidden="true">{[3, 2, 1].map((l) => <span key={l} className={'l' + l} style={{ width: `${vs.length ? (lv[l] / vs.length) * 100 : 0}%` }} />)}</div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {profile.in_league && league.length > 0 && (
        <section className="solid">
          <h2 style={{ padding: '16px 16px 4px' }}>Wochen-Liga <span className="muted small">zählt Einsatz (XP), nicht Können</span></h2>
          <ol className="list league">
            {league.map((l, i) => <li key={i} className={l.me ? 'me' : ''}><div className="row"><b className="rank">{i + 1}</b><span className="grow">{l.name}</span><b>{l.xp} XP</b></div></li>)}
          </ol>
        </section>
      )}
    </main>
  );
}
