// Voki: das „o“ aus dem Logo als Maskottchen. Augen zeigen die Stimmung, Accessoires den Fortschritt.
import type { AccessoryId, Mood } from '../lib/progress';

const INK = '#15112a';
const L = { x: 62, y: 78 }, R = { x: 98, y: 78 }, ER = 15;

function Eye({ c, mood, id }: { c: { x: number; y: number }; mood: Mood; id: string }) {
  if (mood === 'happy' || mood === 'proud')
    return <path d={`M${c.x - 11} ${c.y + 5} Q${c.x} ${c.y - 12} ${c.x + 11} ${c.y + 5}`} fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" />;
  if (mood === 'sleepy')
    return <path d={`M${c.x - 11} ${c.y + 1} Q${c.x} ${c.y + 8} ${c.x + 11} ${c.y + 1}`} fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" />;
  // Offene Augen: weisse Scheibe, Pupille, Lid (wie im Logo)
  const left = c.x < 80;
  const pupil = mood === 'wow' ? { x: c.x, y: c.y + 1, r: 5 } : mood === 'sad' ? { x: c.x + (left ? 3 : -3), y: c.y + 6, r: 6.5 } : { x: c.x + 4, y: c.y - 2, r: 6.5 };
  // Lid: neutral leicht schräg, traurig innen tiefer (kritischer Blick)
  const lid = mood === 'wow' ? null
    : mood === 'sad'
      ? (left ? `M${c.x - 18} ${c.y - 8} L${c.x + 18} ${c.y - 1} L${c.x + 18} ${c.y - 22} L${c.x - 18} ${c.y - 22}Z` : `M${c.x - 18} ${c.y - 1} L${c.x + 18} ${c.y - 8} L${c.x + 18} ${c.y - 22} L${c.x - 18} ${c.y - 22}Z`)
      : `M${c.x - 18} ${c.y - 4} L${c.x + 18} ${c.y - 7} L${c.x + 18} ${c.y - 22} L${c.x - 18} ${c.y - 22}Z`;
  return (
    <g>
      <clipPath id={id}><circle cx={c.x} cy={c.y} r={ER} /></clipPath>
      <g clipPath={`url(#${id})`}>
        <circle cx={c.x} cy={c.y} r={ER} fill="#fff" />
        <circle cx={pupil.x} cy={pupil.y} r={pupil.r} fill={INK} />
        {lid && <path d={lid} fill={INK} />}
      </g>
    </g>
  );
}

function Accessory({ id }: { id: AccessoryId }) {
  switch (id) {
    case 'beret': return (
      <g transform="rotate(-14 80 34)">
        <ellipse cx="80" cy="38" rx="34" ry="11" fill="#e8344e" />
        <path d="M50 38 Q80 18 110 38" fill="#e8344e" />
        <circle cx="80" cy="22" r="3.5" fill="#e8344e" />
      </g>);
    case 'crown': return (
      <path d="M58 36 L62 14 L72 28 L80 10 L88 28 L98 14 L102 36 Z" fill="#ffc83d" stroke="#e59a00" strokeWidth="2" strokeLinejoin="round" />);
    case 'scarf': return (
      <g>
        <path d="M44 106 Q80 126 116 106 L118 116 Q80 136 42 116 Z" fill="#3a6dff" />
        <path d="M52 112 L50 122 M66 117 L65 127 M80 119 L80 129 M94 117 L95 127 M108 112 L110 122" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
        <path d="M100 118 L110 138 L120 134 L108 114 Z" fill="#3a6dff" />
      </g>);
    case 'glasses': return (
      <g fill="none" stroke="#ffd23c" strokeWidth="3.5">
        <circle cx={L.x} cy={L.y} r="19" /><circle cx={R.x} cy={R.y} r="19" /><path d="M77 75 Q80 71 83 75" />
      </g>);
    case 'baguette': return (
      <g transform="rotate(-28 136 92)">
        <rect x="128" y="54" width="15" height="72" rx="7.5" fill="#e3a557" stroke="#b9772e" strokeWidth="2" />
        <path d="M131 66 l9 -4 M131 82 l9 -4 M131 98 l9 -4 M131 114 l9 -4" stroke="#b9772e" strokeWidth="2.5" strokeLinecap="round" />
      </g>);
    case 'eiffel': return (
      <g fill="none" stroke="#8d86ad" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round">
        <path d="M20 132 L28 96 L32 64 L34 50 L36 64 L40 96 L48 132" /><path d="M24 114 H44 M29 92 H39 M31 76 H37" /><path d="M28 132 Q34 120 40 132" />
      </g>);
  }
}

export function Voki({ mood = 'neutral', items = [], size = 96, label }: { mood?: Mood; items?: readonly AccessoryId[]; size?: number; label?: string }) {
  const show = items.includes('crown') ? items.filter((i) => i !== 'beret') : items;
  const back = show.filter((i) => i === 'eiffel' || i === 'baguette');
  const front = show.filter((i) => i !== 'eiffel' && i !== 'baguette');
  return (
    <svg className={'voki m-' + mood} viewBox="0 0 160 145" width={size} height={size * 145 / 160} role="img" aria-label={label || `Voki (${MOOD_LABEL[mood]})`}>
      {back.map((i) => <Accessory key={i} id={i} />)}
      <g className="voki-body">
        <circle cx="80" cy="80" r="46" fill={INK} stroke="rgba(255,255,255,.18)" strokeWidth="1.5" />
        <Eye c={L} mood={mood} id={'vl-' + mood + size} />
        <Eye c={R} mood={mood} id={'vr-' + mood + size} />
        {mood === 'proud' && <><circle cx="52" cy="92" r="5" fill="#ff7aa8" opacity=".8" /><circle cx="108" cy="92" r="5" fill="#ff7aa8" opacity=".8" /></>}
        {front.map((i) => <Accessory key={i} id={i} />)}
      </g>
      {mood === 'sleepy' && <g className="voki-z" fill="var(--muted)" fontFamily="var(--f-display)" fontWeight="800"><text x="122" y="44" fontSize="16">z</text><text x="134" y="30" fontSize="12">z</text></g>}
      {mood === 'proud' && <path className="voki-spark" d="M132 30 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3z" fill="#ffc83d" />}
    </svg>
  );
}
const MOOD_LABEL: Record<Mood, string> = { neutral: 'schaut', happy: 'freut sich', proud: 'ist stolz', sad: 'schaut kritisch', sleepy: 'schläft', wow: 'staunt' };
