/** Akustische Signale (Web Audio) und optionale Sprachausgabe. Auf iOS erst nach einer Nutzerinteraktion möglich. */
let ctx: AudioContext | null = null;
let enabled = true;
let voice = false;

export function configureAudio(o: { sound: boolean; voice: boolean }) {
  enabled = o.sound;
  voice = o.voice;
}

/** Muss aus einem Tap-Handler aufgerufen werden (iOS-Audio-Freigabe). */
export function unlockAudio() {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!ctx && AC) ctx = new AC();
    if (ctx?.state === 'suspended') void ctx.resume();
    // stummer Ton zur Freigabe
    if (ctx) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      g.gain.value = 0.0001; o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.02);
    }
  } catch { /* ohne Ton weiter */ }
}

export function beep(kind: 'tick' | 'go' | 'done' = 'tick') {
  if (!enabled || !ctx) return;
  try {
    const t = ctx.currentTime;
    const tones = kind === 'tick' ? [[880, 0.09]] : kind === 'go' ? [[1175, 0.18]] : [[784, 0.12], [1047, 0.22]];
    let off = 0;
    for (const [f, d] of tones) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + off);
      g.gain.exponentialRampToValueAtTime(0.35, t + off + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + off + d);
      o.connect(g).connect(ctx.destination);
      o.start(t + off); o.stop(t + off + d + 0.02);
      off += d + 0.04;
    }
  } catch { /* ignorieren */ }
}

export function say(text: string) {
  if (!voice || !('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'de-DE'; u.rate = 1.02;
    const v = speechSynthesis.getVoices().find((x) => x.lang.startsWith('de'));
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  } catch { /* ignorieren */ }
}

let lock: { release: () => Promise<void> } | null = null;
export async function keepAwake(on: boolean) {
  try {
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock;
    if (on && wl && !lock) lock = await wl.request('screen');
    if (!on && lock) { await lock.release(); lock = null; }
  } catch { lock = null; }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && lock) { lock = null; void keepAwake(true); } });
