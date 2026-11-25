import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { bounds, frameAt, getAnim, type Prop, type Skeleton, type V } from '../domain/poses';
import type { Muscle } from '../domain/types';

/* ───────────────── Geometrie ───────────────── */
// Skelett-Koordinaten: y nach oben. Gezeichnet wird in SVG-Koordinaten (y nach unten).
const S = (p: V): V => [p[0], -p[1]];
const f1 = (x: number) => x.toFixed(1);
const at = (a: V, b: V, t: number): V => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const unit = (a: V, b: V): V => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  return [dx / l, dy / l];
};
const add = (a: V, b: V, k = 1): V => [a[0] + b[0] * k, a[1] + b[1] * k];

/** Konisches Glied (Kapsel mit zwei Radien) von a nach b als einzelner Pfad. */
function seg(a: V, b: V, ra: number, rb: number): string {
  const A = S(a), B = S(b);
  let dx = B[0] - A[0], dy = B[1] - A[1];
  const l = Math.hypot(dx, dy) || 1;
  dx /= l; dy /= l;
  const nx = -dy, ny = dx;
  const p1 = `${f1(A[0] + nx * ra)},${f1(A[1] + ny * ra)}`;
  const p2 = `${f1(B[0] + nx * rb)},${f1(B[1] + ny * rb)}`;
  const p3 = `${f1(B[0] - nx * rb)},${f1(B[1] - ny * rb)}`;
  const p4 = `${f1(A[0] - nx * ra)},${f1(A[1] - ny * ra)}`;
  return `M${p1}L${p2}A${f1(rb)},${f1(rb)} 0 0 0 ${p3}L${p4}A${f1(ra)},${f1(ra)} 0 0 0 ${p1}Z`;
}

type Kind = 'skin' | 'shirt' | 'shorts' | 'shoe';
interface Part { d: string; kind: Kind; hl?: Muscle[]; }

const TORSO_LOW: Muscle[] = ['bauch', 'unterer_ruecken', 'seitlicher_rumpf'];
const TORSO_MID: Muscle[] = ['bauch', 'seitlicher_rumpf', 'oberer_ruecken', 'latissimus', 'brust'];
const TORSO_HIGH: Muscle[] = ['brust', 'oberer_ruecken', 'schultern'];

function legParts(hip: V, knee: V, foot: V, toe: V): Part[] {
  const calfA = at(knee, foot, 0.14), calfB = at(knee, foot, 0.58);
  return [
    { d: seg(hip, knee, 10.6, 6.7), kind: 'skin', hl: ['quadrizeps', 'beinbeuger', 'adduktoren'] },
    { d: seg(knee, foot, 6.7, 3.9), kind: 'skin', hl: ['waden', 'fuss_sprunggelenk'] },
    { d: seg(calfA, calfB, 6.5, 5.8), kind: 'skin', hl: ['waden'] },
    { d: seg(hip, at(hip, knee, 0.22), 11.2, 9.6), kind: 'skin', hl: ['gesaess', 'hueftbeuger'] },
    { d: seg(foot, toe, 4.7, 3.5), kind: 'shoe' },
    { d: seg(hip, at(hip, knee, 0.6), 11.5, 8.4), kind: 'shorts' },
  ];
}

function armParts(sh: V, elbow: V, hand: V): Part[] {
  const dir = unit(elbow, hand);
  const tip = add(hand, dir, 3.2);
  return [
    { d: seg(sh, elbow, 6.3, 4.6), kind: 'skin', hl: ['bizeps', 'trizeps', 'schultern'] },
    { d: seg(elbow, hand, 4.5, 3.3), kind: 'skin' },
    { d: seg(hand, tip, 3.6, 3.2), kind: 'skin' },
    { d: seg(sh, at(sh, elbow, 0.5), 7.2, 5.8), kind: 'shirt', hl: ['bizeps', 'trizeps', 'schultern'] },
  ];
}

function torsoParts(s: Skeleton): Part[] {
  const W = at(s.hip, s.sh, 0.38), C = at(s.hip, s.sh, 0.78), L = at(s.hip, s.sh, 0.14);
  return [
    { d: seg(s.hip, W, 10.2, 8.8), kind: 'skin' },
    { d: seg(W, C, 8.8, 11.6), kind: 'skin' },
    { d: seg(C, s.sh, 11.6, 8.4), kind: 'skin' },
    { d: seg(L, W, 9.9, 9.6), kind: 'shirt', hl: TORSO_LOW },
    { d: seg(W, C, 9.6, 12.5), kind: 'shirt', hl: TORSO_MID },
    { d: seg(C, s.sh, 12.5, 9.2), kind: 'shirt', hl: TORSO_HIGH },
    { d: seg(s.hip, L, 11.2, 10.6), kind: 'shorts' },
  ];
}

function Group({ parts, muscles, cls }: { parts: Part[]; muscles?: Muscle[]; cls?: string }) {
  const hl = muscles && muscles.length ? parts.filter((p) => p.hl?.some((m) => muscles.includes(m))) : [];
  const order: Kind[] = ['skin', 'shoe', 'shirt', 'shorts'];
  return (
    <g class={cls}>
      {parts.map((p, i) => <path key={`o${i}`} class="fg-outline" d={p.d} />)}
      {order.flatMap((k) => parts.filter((p) => p.kind === k).map((p, i) => <path key={`${k}${i}`} class={`fg-${k}`} d={p.d} />))}
      {hl.map((p, i) => <path key={`h${i}`} class="fg-muscle" d={p.d} />)}
    </g>
  );
}

function Head({ s }: { s: Skeleton }) {
  const nd = unit(s.sh, s.headC);
  // Blickrichtung: Halsrichtung um 90° im Uhrzeigersinn (face = 1) bzw. dagegen (face = -1)
  const fm: V = s.face === 1 ? [nd[1], -nd[0]] : [-nd[1], nd[0]];
  const fs: V = [fm[0], -fm[1]];
  const C = S(s.headC);
  const faceC = add(C, fs, 1.5);
  const nose = add(C, fs, 8.9);
  const ear = add(C, fs, -1.8);
  return (
    <g>
      <path class="fg-outline" d={seg(s.sh, s.neckTop, 4.3, 3.9)} />
      <path class="fg-skin" d={seg(s.sh, s.neckTop, 4.3, 3.9)} />
      <circle class="fg-outline" cx={C[0]} cy={C[1]} r={10.4} />
      <circle class="fg-hair" cx={C[0]} cy={C[1]} r={9.7} />
      <circle class="fg-skin" cx={faceC[0]} cy={faceC[1]} r={8.3} />
      <circle class="fg-skin" cx={nose[0]} cy={nose[1]} r={1.9} />
      <circle class="fg-ear" cx={ear[0]} cy={ear[1]} r={2} />
    </g>
  );
}

function Shadow({ s }: { s: Skeleton }) {
  const pts = [s.footN, s.footF, s.toeN, s.toeF, s.handN, s.handF, s.hip, s.sh, s.kneeN, s.kneeF].filter((p) => p[1] < 12);
  if (!pts.length) return <ellipse class="shadow" cx={s.hip[0]} cy={2} rx={26} ry={3.5} />;
  const xs = pts.map((p) => p[0]);
  const lo = Math.min(...xs), hi = Math.max(...xs);
  return <ellipse class="shadow" cx={(lo + hi) / 2} cy={2} rx={Math.max(26, (hi - lo) / 2 + 16)} ry={4} />;
}

function Body({ s, muscles }: { s: Skeleton; muscles?: Muscle[] }) {
  return (
    <g>
      <Shadow s={s} />
      <Group cls="fg-far" parts={[...legParts(s.hip, s.kneeF, s.footF, s.toeF), ...armParts(s.sh, s.elbowF, s.handF)]} muscles={muscles} />
      <Group parts={torsoParts(s)} muscles={muscles} />
      <Head s={s} />
      <Group parts={[...legParts(s.hip, s.kneeN, s.footN, s.toeN), ...armParts(s.sh, s.elbowN, s.handN)]} muscles={muscles} />
    </g>
  );
}

function PropShape({ p, s }: { p: Prop; s: Skeleton }) {
  switch (p.t) {
    case 'wall':
      return <rect class="prop" x={p.x} y={-(p.h ?? 200)} width={6} height={p.h ?? 200} rx={1} />;
    case 'box':
      return <rect class="prop" x={p.x} y={-(p.y + p.h)} width={p.w} height={p.h} rx={3} />;
    case 'chair': {
      const d = p.dir ?? 1;
      const x0 = p.x - 20, x1 = p.x + 20;
      const back = d === 1 ? x1 : x0;
      return (
        <g class="prop-line">
          <line x1={x0} y1={-p.h} x2={x1} y2={-p.h} />
          <line x1={x0 + 3} y1={-p.h} x2={x0 + 3} y2={0} />
          <line x1={x1 - 3} y1={-p.h} x2={x1 - 3} y2={0} />
          <line x1={back} y1={-p.h} x2={back} y2={-(p.h + 42)} />
        </g>
      );
    }
    case 'bar':
      return <line class="prop-line" x1={p.x - 34} y1={-p.y} x2={p.x + 34} y2={-p.y} />;
    case 'band':
      return <line class="band" x1={p.from[0]} y1={-p.from[1]} x2={s.handN[0]} y2={-s.handN[1]} />;
  }
}

interface Props {
  anim: string;
  playing?: boolean;
  class?: string;
  label?: string;
  muscles?: Muscle[];
  /** Feste Zeit in ms (Standbild, z. B. für Galerie/Tests) */
  at?: number;
}

export function Figure({ anim, playing = true, class: cls, label, muscles, at: fixedAt }: Props) {
  const a = useMemo(() => getAnim(anim), [anim]);
  const b = useMemo(() => bounds(a), [a]);
  const [t, setT] = useState(0);
  const ref = useRef<SVGSVGElement>(null);
  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (!playing || reduced || fixedAt !== undefined) return;
    let raf = 0;
    let visible = true;
    const start = performance.now();
    const io = typeof IntersectionObserver !== 'undefined' && ref.current
      ? new IntersectionObserver(([e]) => { visible = e.isIntersecting; })
      : null;
    if (io && ref.current) io.observe(ref.current);
    const loop = (now: number) => {
      if (visible && document.visibilityState === 'visible') setT(now - start);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      io?.disconnect();
    };
  }, [a, playing, reduced, fixedAt]);

  const time = fixedAt ?? (reduced ? a.seg * 0.5 + (a.hold ?? 0) : t);
  const s = frameAt(a, time);
  const w = b.maxX - b.minX, h = b.maxY - b.minY;
  const vbH = Math.max(120, h + 40);
  const vbW = Math.max(vbH * 1.25, w + 44);
  const cx = (b.minX + b.maxX) / 2;
  const top = -(b.maxY + (vbH - h) / 2);
  return (
    <svg
      ref={ref}
      class={`figure ${cls ?? ''}`}
      viewBox={`${(cx - vbW / 2).toFixed(1)} ${top.toFixed(1)} ${vbW.toFixed(1)} ${vbH.toFixed(1)}`}
      role="img"
      aria-label={label ?? 'Bewegungsdarstellung'}
    >
      <line class="ground" x1={cx - vbW} y1={0} x2={cx + vbW} y2={0} />
      {(a.props ?? []).map((p, i) => <PropShape key={i} p={p} s={s} />)}
      <Body s={s} muscles={muscles} />
    </svg>
  );
}
