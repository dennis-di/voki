// Fotos einlesen: entweder über Claude (Server-Funktion) oder kostenlos im Browser (Tesseract).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { callFn } from './supabase';
import type { Subject } from './types';
import { parseOcrWords } from './parseOcr.js';

export interface OcrRow { section: string; term: string; ipa: string; translation: string }
import type { OcrWord as Word } from './parseOcr.js';

/* OCR-Wörter (Text + Position) -> Vokabelzeilen. Erwartet: links Französisch (evtl. mit [Lautschrift]), rechts Deutsch. */
/* Bild vorbereiten: Grösse angleichen und Schatten herausrechnen */
function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('image')); };
    img.src = url;
  });
}
function toCanvas(img: HTMLImageElement, side: number, allowUp: boolean) {
  const k = Math.min(allowUp ? 2 : 1, side / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, c.width, c.height);
  return c;
}
function flattenLight(c: HTMLCanvasElement) {
  const g = c.getContext('2d', { willReadFrequently: true })!, w = c.width, h = c.height;
  const s = document.createElement('canvas'); s.width = Math.max(8, Math.round(w / 24)); s.height = Math.max(8, Math.round(h / 24));
  const sg = s.getContext('2d')!; sg.imageSmoothingQuality = 'high'; try { sg.filter = 'blur(2px)'; } catch { /* alt */ }
  sg.drawImage(c, 0, 0, s.width, s.height);
  const b = document.createElement('canvas'); b.width = w; b.height = h;
  const bg = b.getContext('2d', { willReadFrequently: true })!; bg.imageSmoothingQuality = 'high'; bg.drawImage(s, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h), p = d.data, q = bg.getImageData(0, 0, w, h).data;
  for (let i = 0; i < p.length; i += 4) {
    const v = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2], m = Math.max(40, 0.299 * q[i] + 0.587 * q[i + 1] + 0.114 * q[i + 2]);
    let o = (255 * v) / m; o = o > 235 ? 255 : ((o - 40) * 255) / 195;
    p[i] = p[i + 1] = p[i + 2] = o < 0 ? 0 : o;
  }
  g.putImageData(d, 0, 0);
}

const toRows = (sections: any[]): OcrRow[] => sections.flatMap((s) => s.items.map((it: any) => ({
  section: s.name || '', term: it.fr ?? it.term ?? '', ipa: it.ipa || '', translation: it.de ?? it.translation ?? '',
})));

/** Kostenlos im Browser */
export async function readWithTesseract(file: Blob, subject: Subject, onStatus: (t: string) => void): Promise<OcrRow[]> {
  onStatus('Texterkennung wird geladen …');
  const { createWorker } = await import('tesseract.js');
  const img = await loadImage(file);
  const canvas = toCanvas(img, 2800, true);
  try { flattenLight(canvas); } catch { /* ohne Vorbereitung weiter */ }
  const base = new URL('/ocr/', location.href).href;
  const worker = await createWorker([subject === 'fr' ? 'fra' : 'eng', 'deu'], 1, {
    workerPath: base + 'worker.min.js', corePath: base, langPath: base, gzip: true,
    logger: (m: any) => { if (m.status === 'recognizing text') onStatus(`Seite wird gelesen … ${Math.round((m.progress || 0) * 100)} %`); },
  });
  try {
    const r: any = await worker.recognize(canvas, { rotateAuto: true }, { blocks: true, text: false });
    const words: Word[] = [];
    for (const b of r.data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) for (const w of l.words || [])
      words.push({ t: w.text, x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1, c: w.confidence });
    return toRows(parseOcrWords(words));
  } finally { worker.terminate().catch(() => { /* egal */ }); }
}

/** Über Claude (Server). Fehlercodes: no_key, daily_limit, bad_key, no_credit, unreadable, … */
export async function readWithClaude(file: Blob, subject: Subject): Promise<{ rows?: OcrRow[]; title?: string; error?: string }> {
  const img = await loadImage(file);
  const c = toCanvas(img, 2000, false);
  const dataUrl = c.toDataURL('image/jpeg', 0.85);
  const { data, error } = await callFn<{ title: string; subtitle: string; sections: any[] }>('read-photo', {
    subject, media_type: 'image/jpeg', image: dataUrl.split(',')[1],
  });
  if (error || !data) return { error: error || 'failed' };
  return { rows: toRows(data.sections), title: [data.title, data.subtitle].filter(Boolean).join(' · ') };
}
