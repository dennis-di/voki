import { useEffect, useMemo, useState } from 'react';
import type { Go } from '../App';
import { loadUnit } from '../lib/data';
import { setSettings, useSettings } from '../lib/settings';
import { speakOnce, startPlayer, stepPlayer, togglePlayer, usePlayer } from '../lib/speech';
import { splitArticle } from '../lib/text';
import { SUBJECTS, isWord, type Subject, type Unit, type Vocab } from '../lib/types';
import { IBack, IEdit, ILetters, ILoop, INext, IPause, IPlay, IPrev, ISpeaker } from '../ui/icons';

interface Sec { name: string; items: Vocab[] }
interface Page { name: string; sections: Sec[] }
/** Unit → Seite → Abschnitt, in der Reihenfolge des Buchs */
export function groupUnit(vocab: Vocab[]): Page[] {
  const pages = new Map<string, Map<string, Vocab[]>>();
  for (const v of vocab) {
    const p = v.page || '', s = v.section || '';
    if (!pages.has(p)) pages.set(p, new Map());
    const secs = pages.get(p)!;
    if (!secs.has(s)) secs.set(s, []);
    secs.get(s)!.push(v);
  }
  return [...pages].map(([name, secs]) => ({ name, sections: [...secs].map(([n, items]) => ({ name: n, items })) }));
}

/** Wort mit eingefärbtem Artikel und m/f-Kennzeichen */
export function Term({ v, subject }: { v: Vocab; subject: Subject }) {
  const { article, rest } = splitArticle(v.term);
  const g = v.gender;
  return (
    <span lang={subject}>
      {article && <span className={'art' + (g ? ' g-' + g : '')}>{article}{article.endsWith("'") ? '' : ' '}</span>}{rest}
      {g && <span className={'gbadge g-' + g} title={g === 'm' ? 'männlich' : 'weiblich'} aria-label={g === 'm' ? 'männlich' : 'weiblich'}>{g}</span>}
    </span>
  );
}

export function RuleCard({ text }: { text: string }) {
  return <div className="rulecard" role="note"><span className="bang" aria-hidden="true">!</span><span>{text}</span></div>;
}

export default function UnitView({ id, go }: { id: string; go: Go }) {
  const s = useSettings();
  const p = usePlayer();
  const [data, setData] = useState<{ unit: Unit; vocab: Vocab[] } | null>(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => { loadUnit(id).then(setData).catch(() => setErr('Die Unit konnte nicht geladen werden.')); }, [id]);
  const pages = useMemo(() => groupUnit(data?.vocab || []), [data]);

  useEffect(() => {
    if (!p.activeId) return;
    document.getElementById('v-' + p.activeId)?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [p.activeId, p.pos]);

  if (err) return <main className="app"><button className="btn" onClick={() => go({ n: 'home' })}><IBack />Zurück</button><div className="note err">{err}</div></main>;
  if (!data) return <main className="app"><p className="muted">Lädt …</p></main>;
  const { unit, vocab } = data;
  const subj = unit.subject;
  const words = vocab.filter(isWord);
  const playAll = (swing = false) => startPlayer(words, 0, subj, { scope: 'Ganze Unit', swing });
  const current = p.queue[p.pos];
  const inThisUnit = p.queue.length > 0 && words.some((v) => v.id === current?.id);
  const multiPage = pages.length > 1 || (pages[0]?.name ?? '') !== '';

  return (
    <main className="app" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 190px)' }}>
      <header className="subhead">
        <button className="ib" onClick={() => go({ n: 'home' })} aria-label="Zurück"><IBack /></button>
        <div className="grow"><span className="eyebrow">{SUBJECTS[subj].name}{unit.subtitle ? ` · ${unit.subtitle}` : ''}</span><h1>{unit.title}</h1></div>
        <button className="ib" onClick={() => go({ n: 'edit', id: unit.id })} aria-label="Unit bearbeiten"><IEdit /></button>
      </header>
      <div className="row wrap">
        <button className={'btn ' + subj} onClick={() => playAll()}><IPlay />Alles abspielen</button>
        <button className="btn" onClick={() => playAll(true)} title="Wort – Pause zum Mitsagen – Übersetzung. Ohne Bildschirm nutzbar."><ISpeaker />Schaukel-Modus</button>
        <span className="muted small">{words.length} Vokabeln</span>
      </div>
      <p className="hint legend"><span className="gbadge g-m">m</span> männlich <span className="gbadge g-f">f</span> weiblich · Tippe eine Vokabel an für Beispiele.</p>
      {vocab.length === 0 && <div className="glass empty"><p className="muted">Diese Unit ist noch leer.</p><button className="btn" onClick={() => go({ n: 'edit', id: unit.id })}><IEdit />Vokabeln hinzufügen</button></div>}

      {pages.map((pg) => (
        <section key={pg.name} className="stack" style={{ gap: 10 }}>
          {multiPage && <h2 className="pagehead">{pg.name ? `Seite ${pg.name}` : 'Ohne Seite'}</h2>}
          {pg.sections.map((sec) => {
            const secWords = sec.items.filter(isWord);
            return (
              <div key={sec.name} className="solid" style={{ overflow: 'hidden' }}>
                {(sec.name || pg.sections.length > 1) && (
                  <div className="row" style={{ padding: '10px 12px 0 0' }}>
                    <div className="vsec grow">{sec.name ? `Abschnitt ${sec.name}` : 'Ohne Abschnitt'}</div>
                    {secWords.length > 0 && <button className="btn sm" onClick={() => startPlayer(secWords, 0, subj, { scope: sec.name ? `Abschnitt ${sec.name}` : 'Abschnitt' })}><IPlay />Abschnitt</button>}
                  </div>
                )}
                <ol className="vlist">
                  {sec.items.map((v) => {
                    if (!isWord(v)) return <li key={v.id} className="vrule"><RuleCard text={v.term} /></li>;
                    const i = secWords.indexOf(v);
                    const active = p.activeId === v.id && inThisUnit;
                    const sp = p.spell && p.spell.id === v.id ? p.spell : null;
                    const extra = !!(v.examples?.length || v.note || v.plural);
                    const isOpen = open === v.id;
                    const tap = () => { setOpen(isOpen ? null : v.id); startPlayer(secWords, i, subj, { single: true }); };
                    return (
                      <li key={v.id} id={'v-' + v.id} className={'vrow' + (active ? ' active' : '') + (v.gender ? ' g-' + v.gender : '')} tabIndex={0} aria-expanded={extra ? isOpen : undefined}
                        onClick={tap} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap(); } }}>
                        <div style={{ minWidth: 0 }}>
                          <div className="vterm"><Term v={v} subject={subj} />{v.ipa && <span className="vipa">[{v.ipa}]</span>}</div>
                          <div className="vtr" lang="de">{v.translation}</div>
                          {extra && !isOpen && <div className="vmore">{v.examples?.length ? `${v.examples.length} Beispiel${v.examples.length > 1 ? 'e' : ''}` : 'Hinweis'} ›</div>}
                        </div>
                        <div className="vacts">
                          <button className="ib" aria-label={`${v.term} vorlesen`} onClick={(e) => { e.stopPropagation(); startPlayer(secWords, i, subj, { single: true }); }}><IPlay /></button>
                          <button className="ib" aria-label={`${v.term} buchstabieren`} onClick={(e) => { e.stopPropagation(); startPlayer(secWords, i, subj, { single: true, only: 'spell' }); }}>Abc</button>
                        </div>
                        {sp && (
                          <div className="tiles" aria-hidden="true" lang={subj}>
                            {sp.chars.map((c, j) => <span key={j} className={/\s/.test(c) ? 'gap' : j === sp.idx ? 'now' : j < sp.idx ? 'done' : ''}>{/\s/.test(c) ? '' : c}</span>)}
                          </div>
                        )}
                        {isOpen && extra && (
                          <div className="vdetail" onClick={(e) => e.stopPropagation()}>
                            {v.plural && <div><span className="eyebrow">Mehrzahl</span> <b lang={subj}>{v.plural}</b></div>}
                            {v.note && <div className="vnote">{v.note}</div>}
                            {(v.examples || []).map((ex, k) => (
                              <button key={k} className="vex" onClick={() => speakOnce(ex.fr, subj)} aria-label={`Beispiel vorlesen: ${ex.fr}`}>
                                <ISpeaker /><span><b lang={subj}>{ex.fr}</b>{ex.de && <span lang="de">{ex.de}</span>}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </div>
            );
          })}
        </section>
      ))}

      <div className="dock">
        <div className="player glass">
          <div className="now"><b>{inThisUnit && current ? `${current.term} · ${current.translation}` : 'Tippe eine Vokabel an'}</b><span>{inThisUnit && p.queue.length > 1 ? `${p.swing ? 'Schaukeln · ' : ''}${p.pos + 1} / ${p.queue.length}` : ''}</span></div>
          <div className="pctrl">
            <button className="toggle" aria-pressed={s.loop} onClick={() => setSettings({ loop: !s.loop })}><ILoop /><span>Dauerschleife<small>{s.loop ? 'an' : 'aus'}</small></span></button>
            <button className="toggle" aria-pressed={s.spell} onClick={() => setSettings({ spell: !s.spell })}><ILetters /><span>Buchstabieren<small>{s.spell ? 'an' : 'aus'}</small></span></button>
          </div>
          <div className="pctrl" style={{ justifyContent: 'center', gap: 18 }}>
            <button className="ib" aria-label="Vorherige" onClick={() => (inThisUnit ? stepPlayer(-1) : playAll())}><IPrev /></button>
            <button className="ib big" aria-label={p.playing ? 'Anhalten' : 'Abspielen'} onClick={() => (inThisUnit ? togglePlayer() : playAll())}>{p.playing ? <IPause /> : <IPlay />}</button>
            <button className="ib" aria-label="Nächste" onClick={() => (inThisUnit ? stepPlayer(1) : playAll())}><INext /></button>
          </div>
        </div>
      </div>
    </main>
  );
}
