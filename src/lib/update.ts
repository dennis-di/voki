// Neue Version automatisch laden – auch in der App auf dem Home-Bildschirm.
// Beim Öffnen/Zurückkehren wird geprüft, ob Vercel eine neuere Version ausliefert. Wenn ja: neu laden.
// Ein laufender Test bleibt erhalten (wird lokal gespeichert).

const currentScript = () => (document.querySelector('script[type="module"][src*="/assets/"]') as HTMLScriptElement | null)?.getAttribute('src') || '';
let checking = false, lastCheck = 0;

async function check() {
  if (checking || Date.now() - lastCheck < 20_000) return;
  checking = true; lastCheck = Date.now();
  try {
    const r = await fetch('/?v=' + Date.now(), { cache: 'no-store', headers: { 'cache-control': 'no-cache' } });
    if (!r.ok) return;
    const html = await r.text();
    const m = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/) || html.match(/<script[^>]+src="([^"]*\/assets\/[^"]+)"/);
    const cur = currentScript();
    if (m && cur && m[1] !== cur) {
      try { sessionStorage.setItem('vw:updated', '1'); } catch { /* egal */ }
      location.reload();
    }
  } catch { /* offline: nichts tun */ }
  finally { checking = false; }
}

export function setupUpdates() {
  if (!import.meta.env.PROD) return;
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then((reg) => {
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => { /* egal */ }); });
    }).catch(() => { /* egal */ });
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  window.addEventListener('focus', check);
  setInterval(check, 10 * 60_000);
  check();
}
/** Nach einem automatischen Update einmal „Aktualisiert“ anzeigen */
export function justUpdated() {
  try { const v = sessionStorage.getItem('vw:updated'); sessionStorage.removeItem('vw:updated'); return !!v; } catch { return false; }
}
