/**
 * Service-Worker-Registrierung mit zuverlässiger Update-Logik.
 * Gespeicherte Daten (IndexedDB) sind von Updates und vom Leeren des App-Caches nie betroffen.
 */
let waiting: ServiceWorker | null = null;
let listener: (() => void) | null = null;
let updating = false;
let registration: ServiceWorkerRegistration | null = null;

export function onUpdate(cb: () => void) {
  listener = cb;
  if (waiting) cb();
}

function setWaiting(w: ServiceWorker) {
  waiting = w;
  listener?.();
}

function track(w: ServiceWorker | null) {
  if (!w) return;
  const check = () => {
    if (w.state === 'installed' && navigator.serviceWorker.controller) setWaiting(w);
  };
  w.addEventListener('statechange', check);
  check(); // Zustand kann bereits „installed“ sein
}

/** Neuen Service Worker aktivieren; die Seite lädt danach automatisch neu. */
export function applyUpdate() {
  if (!waiting) { location.reload(); return; }
  updating = true;
  waiting.postMessage('skipWaiting');
}

export function registerSW() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Nur nach bewusst ausgelöstem Update neu laden (nicht bei der Erstinstallation)
    if (refreshing || !updating) return;
    refreshing = true;
    location.reload();
  });
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    registration = reg;
    // Alle Zustände abdecken – ein Update kann schon laufen oder bereitliegen, bevor wir hier ankommen
    if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
    track(reg.installing);
    reg.addEventListener('updatefound', () => track(reg.installing));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void reg.update().catch(() => {}); });
  }).catch((e) => console.warn('Service Worker nicht registriert', e));
}

export interface VersionInfo { current: string; latest?: string; newer: boolean }

/** Fragt beim Server die aktuelle Build-Kennung ab (ohne Cache). */
export async function checkVersion(): Promise<VersionInfo> {
  const current = __BUILD_ID__;
  try {
    const r = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) throw new Error(String(r.status));
    const j = (await r.json()) as { build?: string };
    return { current, latest: j.build, newer: !!j.build && j.build !== current };
  } catch {
    return { current, newer: false };
  }
}

/**
 * Erzwingt die neueste Version: erst regulärer Update-Weg, bei Misserfolg Cache leeren und neu laden.
 * Die gespeicherten Daten (IndexedDB) bleiben in jedem Fall unberührt.
 */
export async function forceUpdate(): Promise<void> {
  try {
    const reg = registration ?? (await navigator.serviceWorker?.getRegistration()) ?? null;
    if (reg) {
      await reg.update().catch(() => {});
      for (let i = 0; i < 30 && !waiting && !reg.waiting; i++) await new Promise((r) => setTimeout(r, 300));
      const w = waiting ?? reg.waiting;
      if (w) { waiting = w; applyUpdate(); return; }
    }
  } catch { /* weiter zum Fallback */ }
  await hardReload();
}

export async function hardReload(): Promise<void> {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations()) ?? [];
    await Promise.all(regs.map((r) => r.unregister()));
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('forma-')).map((k) => caches.delete(k)));
  } catch { /* trotzdem neu laden */ }
  location.reload();
}
