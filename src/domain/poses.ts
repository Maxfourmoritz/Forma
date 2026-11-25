/**
 * Parametrische Bewegungsanimationen (2D-Seitenansicht).
 * Koordinaten: Boden y=0, y nach oben, Figur blickt nach +x. Einheiten ≈ cm (Figur ≈ 185).
 * Gliedmaßen werden per 2-Segment-IK gelöst; Posen definieren nur Rumpf und Endpunkte.
 */
export type V = [number, number];

export const L = { torso: 52, neck: 13, head: 9, thigh: 44, shin: 44, upper: 30, fore: 28, foot: 11 };

export interface Pose {
  hip: V;
  /** Rumpfwinkel in Grad von der Senkrechten (+ = nach vorn/+x) */
  torso?: number;
  /** alternativ: Richtungspunkt für die Schulter (Länge wird normiert) */
  sh?: V;
  /** zusätzliche Kopfneigung relativ zum Rumpf (Grad, + = Richtung Brust/vorn) */
  head?: number;
  hn: V; // Hand nah
  hf?: V; // Hand fern
  fn: V; // Fuß (Knöchel) nah
  ff?: V; // Fuß fern
  kn?: 1 | -1; // Kniebeugerichtung nah
  kf?: 1 | -1;
  en?: 1 | -1; // Ellbogenrichtung
  ef?: 1 | -1;
  toe?: 1 | -1; // Fußrichtung umkehren
  toeDir?: V; // feste Fußrichtung (z. B. Wadenheben)
  eyes?: 'closed';
  /** Blickrichtung: 1 = Gesicht nach vorn/unten (Standard), -1 = Rückenlage (Gesicht nach oben) */
  face?: 1 | -1;
}

export type Prop =
  | { t: 'wall'; x: number; h?: number }
  | { t: 'box'; x: number; y: number; w: number; h: number }
  | { t: 'chair'; x: number; h: number; dir?: 1 | -1 }
  | { t: 'bar'; x: number; y: number }
  | { t: 'band'; from: V; to: 'hn' };

export interface Anim {
  frames: Pose[];
  props?: Prop[];
  /** ms pro Übergang */
  seg: number;
  /** Rückweg A→B→A (true) oder Zyklus A→B→C→A (false) */
  pingpong?: boolean;
  hold?: number; // ms Pause an Keyframes
}

export interface Skeleton {
  hip: V;
  sh: V;
  headC: V;
  neckTop: V;
  elbowN: V; handN: V; elbowF: V; handF: V;
  kneeN: V; footN: V; kneeF: V; footF: V;
  toeN: V; toeF: V;
  eyes?: 'closed';
  face: 1 | -1;
}

const rad = (d: number) => (d * Math.PI) / 180;
const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1]];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1]];
const mul = (a: V, k: number): V => [a[0] * k, a[1] * k];
const len = (a: V) => Math.hypot(a[0], a[1]);
const norm = (a: V): V => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l];
};

/** Zwei-Segment-IK. bend = +1 dreht das Gelenk gegen den Uhrzeigersinn von der Wurzel-Ziel-Linie. */
export function ik(root: V, target: V, l1: number, l2: number, bend: 1 | -1): { joint: V; end: V } {
  const d0 = sub(target, root);
  let d = len(d0);
  const maxD = l1 + l2 - 0.001;
  const minD = Math.abs(l1 - l2) + 0.001;
  d = Math.min(maxD, Math.max(minD, d));
  const base = Math.atan2(d0[1], d0[0]);
  const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const a = Math.acos(Math.max(-1, Math.min(1, cosA)));
  const ang = base + bend * a;
  const joint: V = add(root, [Math.cos(ang) * l1, Math.sin(ang) * l1]);
  const end: V = add(root, mul([Math.cos(base), Math.sin(base)], d));
  return { joint, end };
}

export function solve(p: Pose): Skeleton {
  let dir: V;
  if (p.sh) dir = norm(sub(p.sh, p.hip));
  else dir = [Math.sin(rad(p.torso ?? 0)), Math.cos(rad(p.torso ?? 0))];
  const sh = add(p.hip, mul(dir, L.torso));
  const hd = rot(dir, -(p.head ?? 0));
  const neckTop = add(sh, mul(hd, L.neck - L.head + 2));
  const headC = add(sh, mul(hd, L.neck));
  const an = ik(sh, p.hn, L.upper, L.fore, p.en ?? -1);
  const af = ik(sh, p.hf ?? p.hn, L.upper, L.fore, p.ef ?? p.en ?? -1);
  const ln = ik(p.hip, p.fn, L.thigh, L.shin, p.kn ?? 1);
  const lf = ik(p.hip, p.ff ?? p.fn, L.thigh, L.shin, p.kf ?? p.kn ?? 1);
  const toe = (knee: V, foot: V): V => {
    if (p.toeDir) return add(foot, mul(norm(p.toeDir), L.foot));
    const s = norm(sub(foot, knee));
    const r: V = [-s[1], s[0]];
    return add(foot, mul(r, L.foot * (p.toe ?? 1)));
  };
  return {
    hip: p.hip, sh, headC, neckTop,
    elbowN: an.joint, handN: an.end, elbowF: af.joint, handF: af.end,
    kneeN: ln.joint, footN: ln.end, kneeF: lf.joint, footF: lf.end,
    toeN: toe(ln.joint, ln.end), toeF: toe(lf.joint, lf.end),
    eyes: p.eyes,
    face: p.face ?? 1,
  };
}

function rot(v: V, deg: number): V {
  const a = rad(deg);
  return [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];
}

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const lv = (x: V | undefined, y: V | undefined, fb: V): V => {
    const p = x ?? fb, q = y ?? fb;
    return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  };
  const lt = (x?: number, y?: number) => (x ?? 0) + ((y ?? 0) - (x ?? 0)) * t;
  const out: Pose = {
    hip: lv(a.hip, b.hip, a.hip),
    hn: lv(a.hn, b.hn, a.hn),
    hf: lv(a.hf ?? a.hn, b.hf ?? b.hn, a.hn),
    fn: lv(a.fn, b.fn, a.fn),
    ff: lv(a.ff ?? a.fn, b.ff ?? b.fn, a.fn),
    head: lt(a.head, b.head),
    kn: t < 0.5 ? a.kn : b.kn, kf: t < 0.5 ? a.kf : b.kf, en: t < 0.5 ? a.en : b.en, ef: t < 0.5 ? a.ef : b.ef,
    toe: t < 0.5 ? a.toe : b.toe,
    eyes: t < 0.5 ? a.eyes : b.eyes,
    face: t < 0.5 ? a.face : b.face,
  };
  if (a.sh || b.sh) {
    const da = a.sh ? norm(sub(a.sh, a.hip)) : [Math.sin(rad(a.torso ?? 0)), Math.cos(rad(a.torso ?? 0))] as V;
    const db = b.sh ? norm(sub(b.sh, b.hip)) : [Math.sin(rad(b.torso ?? 0)), Math.cos(rad(b.torso ?? 0))] as V;
    const angA = Math.atan2(da[0], da[1]);
    let angB = Math.atan2(db[0], db[1]);
    if (angB - angA > Math.PI) angB -= 2 * Math.PI;
    if (angA - angB > Math.PI) angB += 2 * Math.PI;
    out.torso = ((angA + (angB - angA) * t) * 180) / Math.PI;
  } else out.torso = lt(a.torso, b.torso);
  if (a.toeDir || b.toeDir) out.toeDir = lv(a.toeDir, b.toeDir, [1, 0]);
  return out;
}

// ─────────────────────────── Posen-Bibliothek ───────────────────────────

const STAND: Pose = { hip: [0, 88], torso: 0, hn: [3, 30], hf: [-3, 30], fn: [3, 0], ff: [-3, 0], kn: 1, en: -1 };
const with_ = (p: Pose, o: Partial<Pose>): Pose => ({ ...p, ...o });
const BODY = L.thigh + L.shin + L.torso; // Fuß→Schulter bei gestrecktem Körper
const ARM = L.upper + L.fore;

/** Brett-Körper vom Drehpunkt P mit Winkel phi (Grad über der Horizontalen) nach +x */
function plankLine(P: V, phi: number, bodyLen = BODY): { sh: V; hip: V } {
  const d: V = [Math.cos(rad(phi)), Math.sin(rad(phi))];
  const sh = add(P, mul(d, bodyLen));
  const hip = add(P, mul(d, bodyLen - L.torso));
  return { sh, hip };
}

function pushupAnim(handY: number, footY: number, props: Prop[], slow = false): Anim {
  // Winkel finden, bei dem die gestreckten Arme die Stütze (handY) senkrecht zum Körper erreichen
  const F: V = [0, footY];
  // Armrichtung: bei steiler Haltung (Wand) senkrecht zum Körper, am Boden senkrecht nach unten
  const armDir = (phi: number): V => {
    const w = Math.max(0, Math.min(1, phi / 75));
    return norm(add(mul([Math.sin(rad(phi)), -Math.cos(rad(phi))], w), mul([0, -1], 1 - w)));
  };
  let phiTop = 0;
  for (let phi = -40; phi < 89; phi += 0.25) {
    const { sh } = plankLine(F, phi);
    const H = add(sh, mul(armDir(phi), ARM - 2));
    if (H[1] <= handY) phiTop = phi;
    else break;
  }
  const top = plankLine(F, phiTop);
  const H = add(top.sh, mul(armDir(phiTop), ARM - 2));
  let phiBot = phiTop;
  for (let phi = phiTop; phi > phiTop - 40; phi -= 0.25) {
    phiBot = phi;
    const sh = plankLine(F, phi).sh;
    if (len(sub(sh, H)) < 28 || sh[1] - H[1] < 27) break;
  }
  const bot = plankLine(F, phiBot);
  const mk = (b: { sh: V; hip: V }, head = 0): Pose => ({
    hip: b.hip, sh: b.sh, hn: H, hf: add(H, [-2, 0]), fn: F, ff: add(F, [-2, 0]), kn: 1, en: -1, head,
  });
  const ps = props.map((p) => (p.t === 'wall' ? { ...p, x: H[0] + 1 } : p.t === 'box' ? { ...p, x: H[0] - 6 } : p));
  return { frames: [mk(top), mk(bot)], props: ps, seg: slow ? 1900 : 1100, pingpong: true, hold: 250 };
}

function pikeAnim(handY: number, footY: number, props: Prop[]): Anim {
  const beta = 58;
  const F: V = [-60, footY];
  const hip = add(F, mul([Math.cos(rad(beta)), Math.sin(rad(beta))], L.thigh + L.shin - 1));
  const s = (hip[1] - handY) / (L.torso + ARM);
  const gamma = Math.asin(Math.min(0.99, Math.max(-0.99, s)));
  const H = add(hip, mul([Math.cos(gamma), -Math.sin(gamma)], L.torso + ARM - 2));
  const shTop = add(hip, mul([Math.cos(gamma), -Math.sin(gamma)], L.torso));
  const hip2 = add(hip, [8, -8]);
  const shBot = add(hip2, mul(norm([Math.cos(gamma) * 0.75, -Math.sin(gamma) * 1.15]), L.torso));
  const mk = (h: V, sh: V, head: number): Pose => ({ hip: h, sh, hn: H, hf: add(H, [-2, 0]), fn: F, ff: add(F, [-3, 0]), kn: 1, kf: 1, en: -1, head });
  const ps = props.map((p) => (p.t === 'box' && p.y === 0 && handY > 0 ? { ...p, x: H[0] - 14 } : p));
  return { frames: [mk(hip, shTop, 0), mk(hip2, shBot, 0)], props: ps, seg: 1200, pingpong: true, hold: 200 };
}

function rowAnim(phi: number, kind: 'stand' | 'bent' | 'straight', props: Prop[]): Anim {
  if (kind === 'stand') {
    const a = with_(STAND, { hn: [60, 138], hf: [58, 138], en: -1 });
    const b = with_(STAND, { hn: [18, 132], hf: [16, 132], en: -1 });
    return { frames: [a, b], props: [{ t: 'band', from: [110, 138], to: 'hn' }], seg: 1000, pingpong: true, hold: 300 };
  }
  // Drehpunkt: Füße (gestreckt) oder Knie (gebeugt)
  const footX = 0;
  const bodyLen = kind === 'bent' ? L.thigh + L.torso : BODY;
  const pivotY = kind === 'bent' ? 0 : 0;
  const knee: V = kind === 'bent' ? [footX - 0, L.shin] : [0, 0];
  const P: V = kind === 'bent' ? knee : [footX, pivotY];
  const line = (ph: number) => {
    const d: V = [-Math.cos(rad(ph)), Math.sin(rad(ph))];
    return { sh: add(P, mul(d, bodyLen)), hip: add(P, mul(d, bodyLen - L.torso)), d };
  };
  const low = line(phi);
  const perp: V = [low.d[1], -low.d[0]];
  const H = add(low.sh, mul(perp, ARM - 2));
  const handle: V = H;
  let phTop = phi;
  for (let ph = phi; ph < phi + 45; ph += 0.25) {
    phTop = ph;
    if (len(sub(line(ph).sh, handle)) < 26) break;
  }
  const top = line(phTop);
  const foot: V = kind === 'bent' ? [footX + 10, 0] : [footX, 0];
  const mk = (b: { sh: V; hip: V }): Pose => ({
    hip: b.hip, sh: b.sh, hn: handle, hf: add(handle, [-1, 0]), fn: foot, ff: add(foot, [-2, 0]),
    kn: 1, en: 1,
  });
  return { frames: [mk(low), mk(top)], props: props.map((p) => (p.t === 'wall' ? { ...p, x: handle[0] + 2 } : p.t === 'box' ? { ...p, x: handle[0] - 40, y: handle[1] } : p)), seg: 1100, pingpong: true, hold: 300 };
}

function squatAnim(depth: 'box' | 'half' | 'par', slow = false): Anim {
  const bottoms: Record<string, Pose> = {
    box: { hip: [-30, 50], torso: 32, hn: [42, 112], hf: [40, 112], fn: [4, 0], ff: [0, 0], kn: 1, en: -1 },
    half: { hip: [-16, 66], torso: 20, hn: [36, 118], hf: [34, 118], fn: [4, 0], ff: [0, 0], kn: 1, en: -1 },
    par: { hip: [-28, 46], torso: 36, hn: [44, 110], hf: [42, 110], fn: [4, 0], ff: [0, 0], kn: 1, en: -1 },
  };
  const top = with_(STAND, { hn: [40, 120], hf: [38, 120] });
  const props: Prop[] = depth === 'box' ? [{ t: 'chair', x: -42, h: 46, dir: -1 }] : [];
  return { frames: [top, bottoms[depth]], props, seg: slow ? 1800 : 1100, pingpong: true, hold: 200 };
}

function splitAnim(rear: 'floor' | 'chair'): Anim {
  const ff: V = rear === 'chair' ? [-62, 46] : [-42, 0];
  const top: Pose = { hip: [-4, 84], torso: 4, hn: [0, 82], hf: [-6, 82], fn: [36, 0], ff, kn: 1, kf: 1, en: -1, toe: 1 };
  const bot: Pose = { hip: [-6, rear === 'chair' ? 48 : 50], torso: 10, hn: [0, 46], hf: [-6, 46], fn: [36, 0], ff, kn: 1, kf: 1, en: -1 };
  const props: Prop[] = rear === 'chair' ? [{ t: 'chair', x: -80, h: 44, dir: -1 }] : [];
  return { frames: [top, bot], props, seg: 1200, pingpong: true, hold: 200 };
}

function bridgeAnim(variant: '' | 'single' | 'march'): Anim {
  const shTarget: V = [52, 6];
  const down: Pose = { face: -1, hip: [0, 10], sh: shTarget, head: 0, hn: [-10, 0], hf: [-12, 0], fn: [-34, 0], ff: [-36, 0], kn: -1, kf: -1, en: -1, toe: -1 };
  const up: Pose = { ...down, hip: [2, 40] };
  if (variant === 'single') {
    const ffUp: V = [-70, 62];
    return { frames: [{ ...down, ff: [-62, 30] }, { ...up, ff: ffUp }], seg: 1100, pingpong: true, hold: 300 };
  }
  if (variant === 'march') {
    return { frames: [up, { ...up, ff: [-8, 64], kf: -1 }, up, { ...up, fn: [-8, 64] }], seg: 700, pingpong: false };
  }
  return { frames: [down, up], seg: 1100, pingpong: true, hold: 350 };
}

function thrustAnim(single: boolean): Anim {
  const down: Pose = { face: -1, hip: [-4, 14], sh: [44, 42], hn: [30, 40], hf: [28, 40], fn: [-40, 0], ff: [-42, 0], kn: -1, kf: -1, en: 1, toe: -1, head: 20 };
  const up: Pose = { ...down, hip: [0, 44], sh: [52, 44], head: 25 };
  const props: Prop[] = [{ t: 'box', x: 32, y: 0, w: 46, h: 38 }];
  if (single) return { frames: [{ ...down, ff: [-70, 40] }, { ...up, ff: [-80, 60] }], props, seg: 1100, pingpong: true, hold: 300 };
  return { frames: [down, up], props, seg: 1100, pingpong: true, hold: 300 };
}

function plankAnim(opts: { knees?: boolean; high?: boolean; tap?: boolean; saw?: boolean }): Anim {
  if (opts.high) {
    const sh: V = [40, ARM - 1];
    const F: V = [sh[0] - Math.sqrt(BODY * BODY - sh[1] * sh[1]), 0];
    const b = plankLine(F, Math.asin(sh[1] / BODY) * (180 / Math.PI));
    const base: Pose = { hip: b.hip, sh: b.sh, hn: [42, 0], hf: [38, 0], fn: F, ff: add(F, [-3, 0]), kn: 1, en: -1 };
    if (opts.tap) return { frames: [base, { ...base, hn: [30, 50], en: -1 }, base, { ...base, hf: [30, 50] }], seg: 600, pingpong: false };
    return { frames: [base, base], seg: 1000 };
  }
  const shY = 30;
  if (opts.knees) {
    const kLen = L.thigh + L.torso;
    const phi = (Math.asin(shY / kLen) * 180) / Math.PI;
    const K: V = [40 - Math.sqrt(kLen * kLen - shY * shY), 0];
    const b = plankLine(K, phi, kLen);
    const p: Pose = { hip: b.hip, sh: b.sh, hn: [68, 0], hf: [66, 0], fn: [K[0] - 42, 6], ff: [K[0] - 44, 6], kn: 1, en: -1 };
    const p2: Pose = { ...p, hip: add(p.hip, [0, -2]) };
    return { frames: [p, p2], seg: 1500, pingpong: true };
  }
  const phi = (Math.asin(shY / BODY) * 180) / Math.PI;
  const F: V = [40 - Math.sqrt(BODY * BODY - shY * shY), 0];
  const mk = (dx: number): Pose => {
    const b = plankLine(add(F, [dx, 0]), phi);
    return { hip: b.hip, sh: b.sh, hn: [68, 0], hf: [66, 0], fn: add(F, [dx, 0]), ff: add(F, [dx - 3, 0]), kn: 1, en: -1 };
  };
  if (opts.saw) return { frames: [mk(0), mk(-12)], seg: 1100, pingpong: true };
  const a = mk(0);
  return { frames: [a, { ...a, hip: add(a.hip, [0, -1.5]) }], seg: 1600, pingpong: true };
}

function sideAnim(o: { knees?: boolean; dip?: boolean; leg?: boolean }): Anim {
  const elbow: V = [40, 0];
  const sh: V = [40, 30];
  if (o.knees) {
    const kLen = L.thigh + L.torso;
    const K: V = [sh[0] - Math.sqrt(kLen * kLen - sh[1] * sh[1]), 0];
    const b = plankLine(K, (Math.asin(sh[1] / kLen) * 180) / Math.PI, kLen);
    const p: Pose = { hip: b.hip, sh: b.sh, hn: elbow, hf: add(b.hip, [6, 10]), fn: [K[0] - 30, 30], ff: [K[0] - 30, 32], kn: 1, en: -1, ef: 1 };
    return { frames: [p, { ...p, hip: add(p.hip, [0, -2]) }], seg: 1500, pingpong: true };
  }
  const F: V = [sh[0] - Math.sqrt(BODY * BODY - sh[1] * sh[1]), 0];
  const b = plankLine(F, (Math.asin(sh[1] / BODY) * 180) / Math.PI);
  const base: Pose = { hip: b.hip, sh: b.sh, hn: [elbow[0] + 4, 0], hf: add(b.hip, [8, 12]), fn: F, ff: add(F, [0, 4]), kn: 1, en: -1, ef: 1 };
  if (o.dip) return { frames: [base, { ...base, hip: add(base.hip, [0, -12]) }], seg: 1000, pingpong: true, hold: 200 };
  if (o.leg) return { frames: [base, { ...base, ff: add(F, [8, 42]) }], seg: 1000, pingpong: true, hold: 250 };
  return { frames: [base, { ...base, hip: add(base.hip, [0, -1.5]) }], seg: 1600, pingpong: true };
}

function quadruped(o: Partial<Pose> = {}): Pose {
  return { hip: [-8, 46], sh: [44, 58], hn: [44, 0], hf: [41, 0], fn: [-52, 0], ff: [-54, 0], kn: 1, en: -1, toe: -1, ...o };
}

function proneBase(lift = 0): Pose {
  return { hip: [0, 8], sh: [52, 10 + lift], hn: [108, 14 + lift * 1.5], hf: [106, 14 + lift * 1.5], fn: [-86, 6 + lift], ff: [-88, 6 + lift], kn: -1, en: 1, toe: -1, head: -8 };
}

function supine(o: Partial<Pose> = {}): Pose {
  return { face: -1, hip: [0, 8], sh: [52, 8], hn: [-4, 2], hf: [-6, 2], fn: [-86, 4], ff: [-88, 4], kn: -1, kf: -1, en: -1, toe: -1, ...o };
}

function hangAnim(kind: 'hang' | 'scap' | 'pullup' | 'neg'): Anim {
  const barY = 210;
  const hang: Pose = { hip: [0, 101], torso: 0, hn: [6, barY], hf: [2, barY], fn: [-4, 16], ff: [-8, 16], kn: -1, en: 1, toe: 1 };
  const props: Prop[] = [{ t: 'bar', x: 4, y: barY }];
  if (kind === 'hang') return { frames: [hang, { ...hang, hip: [0, 100] }], props, seg: 1600, pingpong: true };
  if (kind === 'scap') return { frames: [hang, { ...hang, hip: [0, 107], fn: [-4, 22], ff: [-8, 22] }], props, seg: 900, pingpong: true, hold: 400 };
  const top: Pose = { hip: [-4, 148], torso: -3, hn: [6, barY], hf: [2, barY], fn: [-12, 64], ff: [-16, 64], kn: -1, en: 1, head: -10 };
  if (kind === 'neg') return { frames: [top, hang], props: [...props, { t: 'chair', x: -30, h: 50, dir: 1 }], seg: 2200, pingpong: false, hold: 500 };
  return { frames: [hang, top], props, seg: 1100, pingpong: true, hold: 250 };
}

function standAnim(o: { tandem?: boolean; single?: boolean; head?: boolean; eyes?: boolean }): Anim {
  const base: Pose = with_(STAND, {
    hn: [18, 66], hf: [-14, 68], ff: o.tandem ? [-16, 0] : o.single ? [-14, 32] : [-3, 0], kf: 1, eyes: o.eyes ? 'closed' : undefined,
  });
  const props: Prop[] = [{ t: 'wall', x: 44 }];
  if (o.head) return { frames: [{ ...base, head: -10 }, { ...base, head: 10 }], props, seg: 1500, pingpong: true };
  return { frames: [base, { ...base, hip: [1.5, 88], torso: -1 }], props, seg: 1800, pingpong: true };
}

const A: Record<string, (q: URLSearchParams) => Anim> = {
  pushup: (q) => {
    const inc = Number(q.get('inc') ?? 0);
    const slow = q.get('slow') === '1';
    if (inc >= 60) return pushupAnim(122, 0, [{ t: 'wall', x: 0 }], slow);
    if (inc >= 35) return pushupAnim(88, 0, [{ t: 'box', x: 0, y: 0, w: 50, h: 88 }], slow);
    if (inc >= 15) return pushupAnim(45, 0, [{ t: 'box', x: 0, y: 0, w: 44, h: 45 }], slow);
    if (inc < 0) return pushupAnim(0, 45, [{ t: 'box', x: -26, y: 0, w: 40, h: 45 }], slow);
    return pushupAnim(0, 0, [], slow);
  },
  pike: (q) => {
    const inc = Number(q.get('inc') ?? 0);
    if (inc > 0) return pikeAnim(45, 0, [{ t: 'box', x: 0, y: 0, w: 40, h: 45 }]);
    if (inc < 0) return pikeAnim(0, 45, [{ t: 'box', x: -84, y: 0, w: 40, h: 45 }]);
    return pikeAnim(0, 0, []);
  },
  row: (q) => {
    const inc = Number(q.get('inc') ?? 60);
    if (inc >= 80) return rowAnim(0, 'stand', []);
    if (inc >= 50) return rowAnim(inc, 'straight', [{ t: 'wall', x: 0, h: 210 }]);
    if (inc >= 18) return rowAnim(inc, 'bent', [{ t: 'box', x: 0, y: 0, w: 80, h: 6 }]);
    return rowAnim(inc, 'straight', [{ t: 'box', x: 0, y: 0, w: 80, h: 6 }]);
  },
  squat: (q) => squatAnim((q.get('depth') as 'box' | 'half' | 'par') ?? 'par', q.get('slow') === '1'),
  split: (q) => splitAnim((q.get('rear') as 'floor' | 'chair') ?? 'floor'),
  skater: () => ({
    frames: [
      { hip: [0, 86], torso: 4, hn: [30, 90], hf: [-30, 110], fn: [4, 0], ff: [-24, 40], kn: 1, kf: 1, en: -1 },
      { hip: [-22, 46], torso: 42, hn: [44, 96], hf: [-30, 110], fn: [4, 0], ff: [-50, 6], kn: 1, kf: 1, en: -1 },
    ],
    props: [{ t: 'chair', x: -70, h: 46, dir: 1 }],
    seg: 1300, pingpong: true, hold: 200,
  }),
  bridge: (q) => bridgeAnim(q.get('single') ? 'single' : q.get('march') ? 'march' : ''),
  thrust: (q) => thrustAnim(q.get('single') === '1'),
  deadbug: () => {
    const base = supine({ hn: [56, 66], hf: [54, 66], fn: [-44, 54], ff: [-44, 54], kn: -1, kf: -1, en: 1 });
    return { frames: [base, { ...base, hn: [108, 16], ff: [-86, 14] }, base, { ...base, hf: [108, 16], fn: [-86, 14] }], seg: 1100, pingpong: false };
  },
  plank: (q) => plankAnim({ knees: q.get('knees') === '1', high: q.get('high') === '1', tap: q.get('tap') === '1', saw: q.get('saw') === '1' }),
  side: (q) => sideAnim({ knees: q.get('knees') === '1', dip: q.get('dip') === '1', leg: q.get('leg') === '1' }),
  birddog: () => {
    const b = quadruped();
    return { frames: [b, { ...b, hn: [104, 62], ff: [-96, 52], kf: 1 }, b, { ...b, hf: [104, 62], fn: [-96, 52] }], seg: 1000, pingpong: false, hold: 300 };
  },
  catcow: () => ({ frames: [quadruped({ hip: [-8, 50], sh: [44, 60], head: 25 }), quadruped({ hip: [-8, 44], sh: [44, 56], head: -20 })], seg: 1800, pingpong: true }),
  superman: (q) =>
    q.get('swim') === '1'
      ? { frames: [{ ...proneBase(8), hn: [108, 30], ff: [-86, 22] }, { ...proneBase(8), hf: [108, 30], fn: [-86, 22] }], seg: 500, pingpong: true }
      : { frames: [proneBase(0), proneBase(10)], seg: 1300, pingpong: true, hold: 500 },
  prone_ytw: () => {
    const b = proneBase(4);
    return { frames: [{ ...b, hn: [104, 26], hf: [102, 26] }, { ...b, hn: [56, 40], hf: [54, 40], en: 1 }, { ...b, hn: [42, 18], hf: [40, 18], en: 1 }], seg: 1100, pingpong: false, hold: 500 };
  },
  prone_pull: () => {
    const b = proneBase(6);
    return { frames: [{ ...b, hn: [108, 24], hf: [106, 24] }, { ...b, hn: [58, 34], hf: [56, 34], en: -1 }], seg: 1200, pingpong: true, hold: 300 };
  },
  hollow: () => {
    const p = supine({ hip: [0, 6], sh: [52, 20], hn: [10, 22], hf: [8, 22], fn: [-86, 26], ff: [-88, 26], head: 20 });
    return { frames: [p, { ...p, fn: [-86, 22], ff: [-88, 22] }], seg: 1400, pingpong: true };
  },
  hang: (q) => hangAnim(q.get('scap') === '1' ? 'scap' : 'hang'),
  pullup: (q) => hangAnim(q.get('neg') === '1' ? 'neg' : 'pullup'),
  press: () => ({ frames: [with_(STAND, { hn: [14, 146], hf: [10, 146], en: -1 }), with_(STAND, { hn: [6, 200], hf: [2, 200] })], seg: 1000, pingpong: true, hold: 200 }),
  pulldown: () => ({ frames: [with_(STAND, { hn: [16, 200], hf: [12, 200] }), with_(STAND, { hn: [16, 146], hf: [12, 146], en: -1 })], props: [{ t: 'band', from: [20, 240], to: 'hn' }], seg: 1000, pingpong: true, hold: 200 }),
  stand: (q) => standAnim({ tandem: q.get('tandem') === '1', single: q.get('single') === '1', head: q.get('head') === '1', eyes: q.get('eyes') === '1' }),
  rdl: () => ({
    frames: [
      with_(STAND, { hn: [6, 60], hf: [2, 60], ff: [-6, 4] }),
      { hip: [-6, 84], torso: 78, hn: [50, 40], hf: [46, 40], fn: [4, 0], ff: [-94, 70], kn: 1, kf: 1, en: -1, head: -10 },
    ],
    props: [{ t: 'wall', x: 70 }],
    seg: 1500, pingpong: true, hold: 300,
  }),
  calf: (q) => {
    const single = q.get('single') === '1';
    const a = with_(STAND, { hn: [32, 110], hf: [30, 110], ff: single ? [-12, 30] : [-3, 0], toeDir: [1, 0] });
    const b = { ...a, hip: [0, 96] as V, fn: [-1, 8] as V, ff: single ? ([-14, 36] as V) : ([-5, 8] as V), toeDir: [1, -0.85] as V };
    return { frames: [a, b], props: [{ t: 'wall', x: 46 }], seg: 900, pingpong: true, hold: 400 };
  },
  wgs: () => ({
    frames: [
      { hip: [-8, 44], torso: 60, hn: [48, 0], hf: [44, 0], fn: [40, 0], ff: [-60, 2], kn: 1, kf: 1, en: -1, toe: 1 },
      { hip: [-8, 46], torso: 40, hn: [48, 0], hf: [14, 150], fn: [40, 0], ff: [-60, 2], kn: 1, kf: 1, en: -1, ef: 1, head: -40 },
    ],
    seg: 1500, pingpong: true, hold: 600,
  }),
  openbook: () => {
    const p: Pose = { hip: [0, 10], sh: [52, 12], hn: [62, 50], hf: [62, 48], fn: [-30, 30], ff: [-30, 28], kn: -1, en: 1, head: 0 };
    return { frames: [p, { ...p, hn: [34, 54], head: 0 }, { ...p, hn: [10, 30] }], seg: 1300, pingpong: true, hold: 500 };
  },
  kneel_stretch: () => ({
    frames: [
      { hip: [-10, 46], torso: 0, hn: [8, 50], hf: [-2, 50], fn: [34, 0], ff: [-50, 0], kn: 1, kf: 1, en: -1, toe: 1 },
      { hip: [2, 44], torso: -6, hn: [16, 48], hf: [6, 48], fn: [34, 0], ff: [-50, 0], kn: 1, kf: 1, en: -1, toe: 1 },
    ],
    seg: 2200, pingpong: true, hold: 1200,
  }),
  hip9090: () => ({
    frames: [
      { hip: [0, 4], torso: -18, hn: [-30, 2], hf: [-32, 2], fn: [52, 4], ff: [-56, 4], kn: 1, kf: -1, en: 1 },
      { hip: [0, 4], torso: -18, hn: [-30, 2], hf: [-32, 2], fn: [50, 2], ff: [-58, 2], kn: 1, kf: -1, en: 1 },
    ],
    seg: 1600, pingpong: true, hold: 400,
  }),
  wallslide: () => ({
    frames: [with_(STAND, { hip: [-6, 88], hn: [-4, 150], hf: [-6, 150], en: 1, fn: [12, 0], ff: [9, 0] }), with_(STAND, { hip: [-6, 88], hn: [-6, 206], hf: [-8, 206], fn: [12, 0], ff: [9, 0] })],
    props: [{ t: 'wall', x: -16 }],
    seg: 1500, pingpong: true, hold: 300,
  }),
  dislocate: () => ({
    frames: [with_(STAND, { hn: [56, 120], hf: [54, 120] }), with_(STAND, { hn: [10, 202], hf: [8, 202] }), with_(STAND, { hn: [-50, 128], hf: [-52, 128] })],
    seg: 1300, pingpong: true, hold: 200,
  }),
  ankle: () => ({
    frames: [
      { hip: [-12, 74], torso: 4, hn: [34, 120], hf: [32, 120], fn: [16, 0], ff: [-40, 0], kn: 1, kf: 1, en: -1, toeDir: [1, 0] },
      { hip: [2, 66], torso: 6, hn: [36, 116], hf: [34, 116], fn: [16, 0], ff: [-40, 0], kn: 1, kf: 1, en: -1, toeDir: [1, 0] },
    ],
    props: [{ t: 'wall', x: 42 }],
    seg: 1100, pingpong: true, hold: 300,
  }),
  child: () => ({
    frames: [
      { hip: [-30, 34], sh: [22, 14], hn: [90, 0], hf: [88, 0], fn: [-74, 2], ff: [-76, 2], kn: -1, en: -1, head: 10, toe: -1 },
      { hip: [-36, 26], sh: [14, 8], hn: [86, 0], hf: [84, 0], fn: [-74, 2], ff: [-76, 2], kn: -1, en: -1, head: 10, toe: -1 },
    ],
    seg: 2400, pingpong: true,
  }),
  ham_stretch: () => {
    const p = supine({ fn: [-20, 86], ff: [-86, 4], hn: [-12, 72], hf: [-14, 72], en: -1, kn: 1, toe: 1 });
    return { frames: [p, { ...p, fn: [-4, 88], hn: [0, 74], hf: [-2, 74] }], seg: 2200, pingpong: true, hold: 800 };
  },
  door_stretch: () => ({
    frames: [with_(STAND, { hn: [24, 146], hf: [-2, 60], en: 1 }), with_(STAND, { hip: [6, 88], torso: 4, hn: [24, 146], hf: [4, 60], en: 1, fn: [9, 0] })],
    props: [{ t: 'wall', x: 30, h: 210 }],
    seg: 2000, pingpong: true, hold: 800,
  }),
  chintuck: () => ({ frames: [with_(STAND, { head: 12 }), with_(STAND, { head: -6 })], seg: 1200, pingpong: true, hold: 800 }),
  march: () => ({
    frames: [with_(STAND, { fn: [18, 40], hn: [-10, 66], hf: [16, 68] }), with_(STAND, { ff: [18, 40], hn: [16, 68], hf: [-10, 66] })],
    seg: 600, pingpong: true,
  }),
  armcircle: () => ({
    frames: [
      with_(STAND, { hn: [56, 140], hf: [54, 140] }),
      with_(STAND, { hn: [10, 198], hf: [8, 198] }),
      with_(STAND, { hn: [-54, 140], hf: [-56, 140] }),
      with_(STAND, { hn: [6, 84], hf: [4, 84] }),
    ],
    seg: 500, pingpong: false,
  }),
  hipcircle: () => ({
    frames: [with_(STAND, { hip: [6, 88], torso: -4, hn: [14, 92], hf: [10, 92] }), with_(STAND, { hip: [-6, 88], torso: 4, hn: [8, 92], hf: [4, 92] })],
    seg: 900, pingpong: true,
  }),
  stepjack: () => ({
    frames: [with_(STAND, { hn: [4, 64], hf: [-4, 64] }), with_(STAND, { hn: [26, 196], hf: [-20, 196], fn: [22, 0], ff: [-20, 0] })],
    seg: 600, pingpong: true,
  }),
  goodmorning: () => ({
    frames: [with_(STAND, { hn: [6, 86], hf: [2, 86] }), { hip: [-12, 84], torso: 70, hn: [-2, 84], hf: [-4, 84], fn: [6, 0], ff: [0, 0], kn: 1, en: -1, head: -10 }],
    seg: 1200, pingpong: true, hold: 200,
  }),
};

export function getAnim(key: string): Anim {
  const [name, qs] = key.split('?');
  const fn = A[name];
  if (!fn) return { frames: [STAND, STAND], seg: 1000 };
  return fn(new URLSearchParams(qs ?? ''));
}

export const ANIM_KEYS = Object.keys(A);

/** Liefert die Skelett-Positionen für Zeitpunkt ms. */
export function frameAt(anim: Anim, ms: number): Skeleton {
  const n = anim.frames.length;
  const seq = anim.pingpong && n === 2 ? [0, 1] : anim.frames.map((_, i) => i);
  const segs = anim.pingpong && n === 2 ? 2 : n;
  const hold = anim.hold ?? 0;
  const per = anim.seg + hold;
  const total = per * segs;
  const t = ((ms % total) + total) % total;
  const segIdx = Math.floor(t / per);
  const within = t - segIdx * per;
  const k = within < hold ? 0 : (within - hold) / anim.seg;
  const ease = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  let a: Pose, b: Pose;
  if (anim.pingpong && n === 2) {
    a = segIdx === 0 ? anim.frames[0] : anim.frames[1];
    b = segIdx === 0 ? anim.frames[1] : anim.frames[0];
  } else {
    a = anim.frames[seq[segIdx]];
    b = anim.frames[seq[(segIdx + 1) % n]];
  }
  return solve(lerpPose(a, b, ease));
}

export function bounds(anim: Anim): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity, maxX = -Infinity, minY = 0, maxY = -Infinity;
  for (let ms = 0; ms < 8000; ms += 120) {
    const s = frameAt(anim, ms);
    for (const p of [s.hip, s.sh, s.headC, s.elbowN, s.handN, s.elbowF, s.handF, s.kneeN, s.footN, s.kneeF, s.footF, s.toeN, s.toeF]) {
      minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
      minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
    }
  }
  maxY += L.head;
  for (const pr of anim.props ?? []) {
    if (pr.t === 'box') { minX = Math.min(minX, pr.x); maxX = Math.max(maxX, pr.x + pr.w); maxY = Math.max(maxY, pr.y + pr.h); }
    if (pr.t === 'chair') { minX = Math.min(minX, pr.x - 22); maxX = Math.max(maxX, pr.x + 22); }
    if (pr.t === 'bar') maxY = Math.max(maxY, pr.y + 4);
  }
  return { minX, maxX, minY, maxY };
}
