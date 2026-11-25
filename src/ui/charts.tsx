import type { Point } from '../domain/analytics';
import { fmtNum } from '../domain/util';

const W = 340, H = 150, PL = 34, PR = 8, PT = 10, PB = 22;

function niceDomain(vals: number[], pad = 0.1): [number, number] {
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (lo === hi) { lo -= 1; hi += 1; }
  const d = (hi - lo) * pad;
  return [lo - d, hi + d];
}

function fmtTick(d: Date, spanDays: number) {
  return spanDays > 120 ? d.toLocaleDateString('de-DE', { month: 'short' }) : d.toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' });
}

/** Linienchart mit Rohwerten (Punkte) und optional geglätteter Linie. */
export function LineChart({ raw, smooth, goal, unit, digits = 1, color, start, end }: { raw: Point[]; smooth?: Point[]; goal?: number; unit?: string; digits?: number; color?: string; start?: Date; end?: Date }) {
  if (!raw.length) return <div class="muted small" style={{ padding: '24px 0', textAlign: 'center' }}>Noch keine Werte in diesem Zeitraum</div>;
  const t0 = (start ?? new Date(raw[0].date)).getTime();
  const t1 = Math.max((end ?? new Date(raw[raw.length - 1].date)).getTime(), t0 + 86_400_000);
  const vals = [...raw.map((p) => p.value), ...(goal !== undefined ? [goal] : [])];
  const [lo, hi] = niceDomain(vals);
  const x = (d: string) => PL + ((new Date(d).getTime() - t0) / (t1 - t0)) * (W - PL - PR);
  const y = (v: number) => PT + (1 - (v - lo) / (hi - lo)) * (H - PT - PB);
  const line = (pts: Point[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
  const ticks = [lo + (hi - lo) * 0.15, (lo + hi) / 2, hi - (hi - lo) * 0.15];
  const spanDays = (t1 - t0) / 86_400_000;
  const xt = [t0, (t0 + t1) / 2, t1];
  const main = smooth ?? raw;
  const last = raw[raw.length - 1];
  return (
    <svg class="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Verlauf, letzter Wert ${fmtNum(last.value, digits)} ${unit ?? ''}`}>
      {ticks.map((t, i) => (
        <g key={i}>
          <line class="grid" x1={PL} x2={W - PR} y1={y(t)} y2={y(t)} />
          <text class="axis" x={PL - 6} y={y(t) + 4} text-anchor="end">{fmtNum(t, digits === 0 ? 0 : t > 50 ? 0 : 1)}</text>
        </g>
      ))}
      {xt.map((t, i) => <text key={i} class="axis" x={PL + (i / 2) * (W - PL - PR)} y={H - 5} text-anchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}>{fmtTick(new Date(t), spanDays)}</text>)}
      {goal !== undefined && <line class="goal" x1={PL} x2={W - PR} y1={y(goal)} y2={y(goal)} />}
      {main.length > 1 && <path class="area" d={`${line(main)}L${x(main[main.length - 1].date).toFixed(1)},${H - PB}L${x(main[0].date).toFixed(1)},${H - PB}Z`} fill="url(#gArea)" style={color ? { fill: color, fillOpacity: 0.14 } : undefined} />}
      {smooth && raw.map((p, i) => <circle key={i} class="raw" cx={x(p.date)} cy={y(p.value)} r={2.2} />)}
      <path class="line" d={line(main)} style={color ? { stroke: color } : { stroke: 'url(#gLine)' }} />
      {!smooth && raw.length > 1 && raw.slice(0, -1).map((p, i) => <circle key={i} cx={x(p.date)} cy={y(p.value)} r={2.6} fill={color ?? 'var(--accent)'} />)}
      <circle class="dot-halo" cx={x(main[main.length - 1].date)} cy={y(main[main.length - 1].value)} r={9} style={color ? { fill: color } : undefined} />
      <circle class="dot" cx={x(main[main.length - 1].date)} cy={y(main[main.length - 1].value)} r={4.5} style={color ? { fill: color } : undefined} />
    </svg>
  );
}

export interface BarSeries { key: string; color: string; label: string }

export function StackedBars({ rows, series, labels, unit, target }: { rows: Record<string, number>[]; series: BarSeries[]; labels: string[]; unit?: string; target?: number }) {
  const totals = rows.map((r) => series.reduce((a, s) => a + (r[s.key] ?? 0), 0));
  const max = Math.max(...totals, target ?? 0, 1) * 1.1;
  const n = rows.length;
  const bw = Math.min(26, ((W - PL - PR) / Math.max(n, 1)) * 0.62);
  const x = (i: number) => PL + ((i + 0.5) / n) * (W - PL - PR);
  const y = (v: number) => PT + (1 - v / max) * (H - PT - PB);
  const every = Math.ceil(n / 6);
  return (
    <div>
      <svg class="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Balkendiagramm ${unit ?? ''}`}>
        {[0.5, 1].map((f) => (
          <g key={f}>
            <line class="grid" x1={PL} x2={W - PR} y1={y((max / 1.1) * f)} y2={y((max / 1.1) * f)} />
            <text class="axis" x={PL - 6} y={y((max / 1.1) * f) + 4} text-anchor="end">{Math.round((max / 1.1) * f)}</text>
          </g>
        ))}
        {target !== undefined && <line class="goal" x1={PL} x2={W - PR} y1={y(target)} y2={y(target)} />}
        {rows.map((r, i) => {
          let acc = 0;
          return (
            <g key={i}>
              {series.map((s) => {
                const v = r[s.key] ?? 0;
                if (v <= 0) return null;
                const y0 = y(acc), y1 = y(acc + v);
                acc += v;
                return <rect key={s.key} x={x(i) - bw / 2} y={y1} width={bw} height={Math.max(0.5, y0 - y1 - 1)} rx={3} fill={s.color} />;
              })}
              {i % every === 0 && <text class="axis" x={x(i)} y={H - 5} text-anchor="middle">{labels[i]}</text>}
            </g>
          );
        })}
      </svg>
      {series.length > 1 && <div class="legend">{series.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.label}</span>)}</div>}
    </div>
  );
}

export function Spark({ values, color = 'var(--accent)', h = 28 }: { values: number[]; color?: string; h?: number }) {
  if (values.length < 2) return <svg width="80" height={h} />;
  const [lo, hi] = niceDomain(values, 0.15);
  const w = 80;
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${((i / (values.length - 1)) * w).toFixed(1)},${(h - ((v - lo) / (hi - lo)) * h).toFixed(1)}`).join('');
  return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true"><path d={`${d}L${w},${h}L0,${h}Z`} fill={color} fill-opacity="0.14" /><path d={d} fill="none" stroke={color} stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" /></svg>;
}

export function Ring({ value, max, size = 64, color = 'var(--accent)', children }: { value: number; max: number; size?: number; color?: string; children?: preact.ComponentChildren }) {
  const r = size / 2 - 5, c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, value / Math.max(max, 1)));
  return (
    <div style={{ width: size, height: size, position: 'relative', flex: 'none' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--fill)" stroke-width="7" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color === 'var(--accent)' ? 'url(#gRing)' : color} stroke-width="7" stroke-linecap="round" stroke-dasharray={`${c * f} ${c}`} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700 }}>{children}</div>
    </div>
  );
}
