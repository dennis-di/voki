// Erkannte Wörter (Text + Position) in Vokabelzeilen umwandeln. Erwartet: links Fremdsprache (evtl. mit [Lautschrift]), rechts Deutsch.
/* OCR-Wörter (Text + Position) -> Vokabelzeilen. Erwartet: links Französisch (evtl. mit [Lautschrift]), rechts Deutsch. */
export function parseOcrWords(words){
  const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
  const hasL = t => /[\p{L}]/u.test(t);
  const alnum = t => (t.match(/[\p{L}\d]/gu) || []).length;
  const ws = words.filter(w => w.t && w.t.trim()).map(w => ({ ...w, t: w.t.trim(), cy: (w.y0 + w.y1) / 2, h: w.y1 - w.y0 }));
  if (!ws.length) return [];
  const h = med(ws.filter(w => hasL(w.t) && w.c >= 60 && alnum(w.t) >= 3).map(w => w.h)) || med(ws.map(w => w.h)) || 20;
  /* Zeilen bilden */
  ws.sort((a, b) => a.cy - b.cy);
  const rows = []; let cur = [], cy = null;
  for (const w of ws){
    if (cy !== null && Math.abs(w.cy - cy) > h * 0.75){ rows.push(cur); cur = []; }
    cur.push(w); cy = cur.reduce((s, k) => s + k.cy, 0) / cur.length;
  }
  if (cur.length) rows.push(cur);
  rows.forEach(r => r.sort((a, b) => a.x0 - b.x0));
  const rowY = r => r.reduce((s, k) => s + k.cy, 0) / r.length;
  const isBr = w => /^[\[{(]?\[/.test(w.t) || (/^\[/.test(w.t.replace(/^[^\p{L}\[]+/u, '')));
  /* Spalten bestimmen */
  let frX, deX;
  const anchors = [];
  for (const r of rows){
    const bi = r.findIndex(isBr); if (bi < 1) continue;
    const before = r.slice(0, bi).filter(w => hasL(w.t) && w.c >= 40);
    const after = r.slice(bi + 1).filter(w => hasL(w.t) && w.c >= 40);
    if (before.length && after.length) anchors.push({ fr: before[0].x0, de: after[0].x0, y: rowY(r) });
  }
  let y0 = -Infinity, y1 = Infinity;
  if (anchors.length >= 3){
    frX = med(anchors.map(a => a.fr)); deX = med(anchors.map(a => a.de));
    const brRows = rows.filter(r => r.some(isBr)).map(rowY);
    y0 = Math.min(...brRows) - h * 0.8; y1 = Math.max(...brRows) + h * 2.6;
  } else {
    /* ohne Lautschrift: breiteste Lücke in der Mitte suchen */
    const good = ws.filter(w => hasL(w.t) && w.c >= 50);
    if (good.length < 4) return [];
    const minX = Math.min(...good.map(w => w.x0)), maxX = Math.max(...good.map(w => w.x1));
    const step = Math.max(2, h / 4), n = Math.ceil((maxX - minX) / step) + 1, cov = new Array(n).fill(0);
    for (const w of good) for (let i = Math.floor((w.x0 - minX) / step); i <= Math.floor((w.x1 - minX) / step); i++) cov[i]++;
    const lim = Math.max(1, Math.round(rows.length * 0.06));
    let best = null, s = -1;
    for (let i = Math.floor(n * 0.2); i <= Math.ceil(n * 0.85); i++){
      if (cov[i] <= lim){ if (s < 0) s = i; }
      else if (s >= 0){ if (!best || i - s > best[1] - best[0]) best = [s, i]; s = -1; }
    }
    if (!best) return [];
    frX = minX; deX = minX + best[1] * step;
  }
  const split = anchors.length >= 3 ? deX - 4 * h : deX - 0.5 * h;
  const tidy = t => t.replace(/^[“”„‚‘’'"`´|:;,.+\-_=~*#<>{}\\]+(?=[\p{L}(«\[])/u, '').replace(/[|_=~*#<>{}\\“”„‚‘`´]+$/u, '');
  const join = toks => toks.map(w => tidy(w.t)).filter(Boolean).join(' ')
    .replace(/\s+([!?;,.:])/g, '$1').replace(/\/\s*/g, '/ ').replace(/\s*\/ /g, ' / ').replace(/’/g, "'").replace(/(\p{L})\((?=\p{L})/gu, '$1 (').replace(/\s+/g, ' ').replace(/^[\/;,\s]+|[\/,\s]+$/g, '').trim();
  const DE_STOP = /^(mit|kann|man|und|oder|nicht|sich|den|dann|sagt|auch|einer|einem|eine|wenn|gibt|wird|für|bei|zu|der|die|das|ist|sind|kennt|gut|so)$/;
  const sections = [{ name: '', items: [] }];
  let last = null, lastY = -Infinity;
  for (const r of rows){
    const y = rowY(r); if (y < y0 || y > y1) continue;
    const toks = r.filter(w => w.x0 >= frX - 5 * h);
    /* Fließtext über beide Spalten (Infokasten) überspringen */
    if (!toks.some(isBr)){
      const lt = toks.filter(w => hasL(w.t) && w.x0 < split && w.x0 >= frX - 2 * h);
      const rt = toks.filter(w => hasL(w.t) && w.x0 >= split);
      const deWords = lt.filter(w => DE_STOP.test(w.t.toLowerCase().replace(/[^\p{L}]/gu, ''))).length;
      if (deWords >= 2 || lt.some(w => /[«»]/.test(w.t))) continue;
      if (lt.length >= 4 && rt.length && rt[0].x0 - lt[lt.length - 1].x1 < h * 1.5) continue;
    }
    /* Abschnittsnummer am Rand */
    const mark = toks.find(w => /^\d{1,2}$/.test(w.t) && w.x0 < frX - 0.7 * h && w.x0 >= frX - 4 * h && w.c >= 60 && w.h >= h * 0.9);
    /* links: Französisch bis zur Lautschrift */
    const left = []; let hitBr = false;
    for (const w of toks){
      if (w.x0 >= split) break;
      if (isBr(w)){ hitBr = true; break; }
      if (w.x0 < frX - 2 * h) continue;
      if (left.length && /\]$/.test(w.t)) break;
      const bi = w.t.indexOf('[');
      if (bi > 1){ left.push({ ...w, t: w.t.slice(0, bi) }); break; }
      if (/^[!?]+$/.test(w.t)){ if (left.length) left.push(w); continue; }
      if (!hasL(w.t)) continue;
      if (alnum(w.t) <= 2 && w.c < 30) continue;
      if (alnum(w.t) <= 3 && w.c < 10) continue;
      left.push(w);
    }
    if (hitBr && left.length > 1 && left[left.length - 1].c < 45) left.pop();
    /* rechts: Deutsch, bis eine große Lücke kommt */
    const right = []; let prev = null;
    for (const w of toks){
      if (w.x0 < split) continue;
      if (prev && w.x0 - prev.x1 > h * 3) break;
      if (!prev && w.x0 > deX + h * 3) break;
      if (isBr(w)) continue;
      const punct = /^[\/;]+$/.test(w.t);
      if (!punct){
        if (!hasL(w.t)) continue;
        if (alnum(w.t) <= 2 && w.c < 60) continue;
        if (alnum(w.t) <= 4 && w.c < 15) continue;
      } else if (!right.length) continue;
      right.push(w); prev = w;
    }
    const fr = join(left), de = join(right);
    if (mark && fr){ if (sections[sections.length - 1].items.length) sections.push({ name: mark.t, items: [] }); else sections[sections.length - 1].name = mark.t; }
    if (fr){ last = { fr, ipa: '', de }; sections[sections.length - 1].items.push(last); lastY = y; }
    else if (de && last && y - lastY < h * 2.6){ last.de = (last.de + ' ' + de).replace(/\s+([;,])/g, '$1').trim(); lastY = y; }
  }
  for (const s of sections) s.items = s.items.filter(it => it.fr && it.de);
  return sections.filter(s => s.items.length);
}
