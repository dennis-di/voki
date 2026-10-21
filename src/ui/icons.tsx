// Schlichte Strich-Icons
const P = (d: string, fill = false) => (props: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={props.size} height={props.size} fill={fill ? 'currentColor' : 'none'} stroke={fill ? 'none' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
export const IPlay = P('M7 4.5v15l13-7.5z', true);
export const IPause = P('M6 4h4v16H6zM14 4h4v16h-4z', true);
export const IPrev = P('M6 5h2v14H6zM20 5v14L9 12z', true);
export const INext = P('M16 5h2v14h-2zM4 5v14l11-7z', true);
export const IBack = P('M15 5l-7 7 7 7');
export const IBook = P('M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 5v16M9 7h6');
export const ICheck = P('M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9');
export const IGear = P('M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z');
export const IShield = P('M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z');
export const IPlus = P('M12 5v14M5 12h14');
export const ICamera = P('M4 8h3l2-3h6l2 3h3v11H4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z');
export const IEdit = P('M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4');
export const ITrash = P('M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3');
export const ILoop = P('M8.5 8.5c-2.5-2.6-6.5-.9-6.5 3.5s4 6.1 6.5 3.5l7-7c2.5-2.6 6.5-.9 6.5 3.5s-4 6.1-6.5 3.5l-7-7');
export const ILetters = P('M3 6h5v12H3zM9.5 6h5v12h-5zM16 6h5v12h-5z');
export const ISpeaker = P('M4 9v6h4l5 4V5L8 9zM16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12');
export const ICopy = P('M8 8h12v12H8zM4 16V4h12');
