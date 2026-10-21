import { useEffect, useMemo, useState } from 'react';
import type { Go } from '../App';
import { loadUnit } from '../lib/data';
import { setSettings, useSettings } from '../lib/settings';
import { startPlayer, stepPlayer, togglePlayer, usePlayer } from '../lib/speech';
import { SUBJECTS, type Unit, type Vocab } from '../lib/types';
import { IBack, IEdit, ILetters, ILoop, INext, IPause, IPlay, IPrev } from '../ui/icons';

export default function UnitView({ id, go }: { id: string; go: Go }) {
  const s = useSettings();
  const p = usePlayer();
  const [data, setData] = useState<{ unit: Unit; vocab: Vocab[] } | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => { loadUnit(id).then(setData).catch(() => setErr('Die Unit konnte nicht geladen werden.')); }, [id]);

  const sections = useMemo(() => {
    const out: { name: string; items: Vocab[] }[] = [];
    for (const v of data?.vocab || []) {
      const n = v.section || '';
      if (!out.length || out[out.length - 1].name !== n) out.push({ name: n, items: [] });
      out[out.length - 1].items.push(v);
    }
    return out;
  }, [data]);

  useEffect(() => {
    if (!p.activeId) return;
    document.getElementById('v-' + p.activeId)?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [p.activeId, p.pos]);

  if (err) return <main className="app"><button className="btn" onClick={() => go({ n: 'home' })}><IBack />Zurück</button><div className="note err">{err}</div></main>;
  if (!data) return <main className="app"><p className="muted">Lädt …</p></main>;
  const { unit, vocab } = data;
  const subj = unit.subject;
  const playAll = () => startPlayer(vocab, 0, subj, { scope: 'Alle Abschnitte' });
  const current = p.queue[p.pos];
  const inThisUnit = p.queue.length > 0 && vocab.some((v) => v.id === current?.id);

  return (
    <main className="app" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 190px)' }}>
      <header className="subhead">
        <button className="ib" onClick={() => go({ n: 'home' })} aria-label="Zurück"><IBack /></button>
        <div className="grow"><span className="eyebrow">{SUBJECTS[subj].name}{unit.subtitle ? ` · ${unit.subtitle}` : ''}</span><h1>{unit.title}</h1></div>
        <button className="ib" onClick={() => go({ n: 'edit', id: unit.id })} aria-label="Unit bearbeiten"><IEdit /></button>
      </header>
      <div className="row wrap">
        <button className={'btn ' + subj} onClick={playAll}><IPlay />Alle Abschnitte abspielen</button>
        <span className="muted small">{vocab.length} Vokabeln</span>
      </div>
      {vocab.length === 0 && <div className="glass empty"><p className="muted">Diese Unit ist noch leer.</p><button className="btn" onClick={() => go({ n: 'edit', id: unit.id })}><IEdit />Vokabeln hinzufügen</button></div>}
      {sections.map((sec, si) => (
        <section key={si} className="solid" style={{ overflow: 'hidden' }}>
          {(sec.name || sections.length > 1) && (
            <div className="row" style={{ padding: '10px 12px 0 0' }}>
              <div className="vsec grow">{sec.name ? `Abschnitt ${sec.name}` : 'Ohne Abschnitt'}</div>
              <button className="btn sm" onClick={() => startPlayer(sec.items, 0, subj, { scope: sec.name ? `Abschnitt ${sec.name}` : 'Abschnitt' })}><IPlay />Abschnitt</button>
            </div>
          )}
          <ol className="vlist">
            {sec.items.map((v, i) => {
              const active = p.activeId === v.id && inThisUnit;
              const sp = p.spell && p.spell.id === v.id ? p.spell : null;
              return (
                <li key={v.id} id={'v-' + v.id} className={'vrow' + (active ? ' active' : '')} tabIndex={0}
                  onClick={() => startPlayer(sec.items, i, subj, { single: true })}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startPlayer(sec.items, i, subj, { single: true }); } }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="vterm" lang={subj}>{v.term}{v.ipa && <span className="vipa">[{v.ipa}]</span>}</div>
                    <div className="vtr" lang="de">{v.translation}</div>
                  </div>
                  <div className="vacts">
                    <button className="ib" aria-label={`${v.term} vorlesen`} onClick={(e) => { e.stopPropagation(); startPlayer(sec.items, i, subj, { single: true }); }}><IPlay /></button>
                    <button className="ib" aria-label={`${v.term} buchstabieren`} onClick={(e) => { e.stopPropagation(); startPlayer(sec.items, i, subj, { single: true, only: 'spell' }); }}>Abc</button>
                  </div>
                  {sp && (
                    <div className="tiles" aria-hidden="true" lang={subj}>
                      {sp.chars.map((c, j) => <span key={j} className={/\s/.test(c) ? 'gap' : j === sp.idx ? 'now' : j < sp.idx ? 'done' : ''}>{/\s/.test(c) ? '' : c}</span>)}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      ))}

      <div className="dock">
        <div className="player glass">
          <div className="now"><b>{inThisUnit && current ? `${current.term} · ${current.translation}` : 'Tippe eine Vokabel an'}</b><span>{inThisUnit && p.queue.length > 1 ? `${p.pos + 1} / ${p.queue.length}` : ''}</span></div>
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
