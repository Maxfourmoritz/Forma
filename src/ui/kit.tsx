import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { nav } from '../state';

export function Card({ children, class: c, onClick }: { children: ComponentChildren; class?: string; onClick?: () => void }) {
  return onClick ? (
    <button class={`card ${c ?? ''}`} style={{ width: '100%', textAlign: 'left', display: 'block' }} onClick={onClick}>{children}</button>
  ) : (
    <div class={`card ${c ?? ''}`}>{children}</div>
  );
}

export function SecTitle({ children, action, onAction }: { children: ComponentChildren; action?: string; onAction?: () => void }) {
  return (
    <h2 class="sec-title">
      <span>{children}</span>
      {action && <button class="link" onClick={onAction}>{action}</button>}
    </h2>
  );
}

export function Row({ title, sub, value, onClick, icon, iconBg, right, chevron = !!onClick }: {
  title: ComponentChildren; sub?: ComponentChildren; value?: ComponentChildren; onClick?: () => void; icon?: ComponentChildren; iconBg?: string; right?: ComponentChildren; chevron?: boolean;
}) {
  const inner = (
    <>
      {icon && <span class="icon-dot" style={{ background: iconBg ?? 'var(--accent)' }}>{icon}</span>}
      <div class="grow">
        <div>{title}</div>
        {sub && <div class="small muted">{sub}</div>}
      </div>
      {value !== undefined && <span class="val num">{value}</span>}
      {right}
      {chevron && <span class="chev">›</span>}
    </>
  );
  return onClick ? <button class="list-row" onClick={onClick}>{inner}</button> : <div class="list-row">{inner}</div>;
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div class="seg" role="tablist">
      {options.map(([v, l]) => (
        <button key={v} role="tab" aria-selected={v === value} class={v === value ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}

export function Chips<T extends string | number>({ value, options, onChange, accent, wrap }: { value: T | T[]; options: [T, string][]; onChange: (v: T) => void; accent?: boolean; wrap?: boolean }) {
  const on = (v: T) => (Array.isArray(value) ? value.includes(v) : value === v);
  return (
    <div class={`chips ${wrap ? 'wrap' : ''}`}>
      {options.map(([v, l]) => (
        <button key={String(v)} class={`chip ${accent ? 'accent' : ''} ${on(v) ? 'on' : ''}`} aria-pressed={on(v)} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}

export function Scale({ value, onChange, min = 1, max = 5, labels }: { value?: number; onChange: (v: number) => void; min?: number; max?: number; labels?: [string, string] }) {
  const vals = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <div>
      <div class="scale">
        {vals.map((v) => <button key={v} class={value === v ? 'on' : ''} aria-pressed={value === v} onClick={() => onChange(v)}>{v}</button>)}
      </div>
      {labels && <div class="scale-labels"><span>{labels[0]}</span><span>{labels[1]}</span></div>}
    </div>
  );
}

export function Stepper({ value, onChange, step = 1, min = 0, max = 999, suffix, big, format }: { value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; suffix?: string; big?: boolean; format?: (v: number) => string }) {
  const set = (v: number) => onChange(Math.round(Math.min(max, Math.max(min, v)) * 100) / 100);
  return (
    <div class={`stepper ${big ? 'big' : ''}`}>
      <button aria-label="weniger" onClick={() => set(value - step)}>−</button>
      <div class="v num">{format ? format(value) : value}{suffix && <span class="small muted"> {suffix}</span>}</div>
      <button aria-label="mehr" onClick={() => set(value + step)}>+</button>
    </div>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return <button class={`toggle ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />;
}

export function Check({ on, onChange, children }: { on: boolean; onChange: (v: boolean) => void; children: ComponentChildren }) {
  return (
    <button class="list-row" onClick={() => onChange(!on)} role="checkbox" aria-checked={on}>
      <span class={`check ${on ? 'on' : ''}`}>{on ? '✓' : ''}</span>
      <div class="grow">{children}</div>
    </button>
  );
}

export function Field({ label, children }: { label: string; children: ComponentChildren }) {
  return <div class="field"><label>{label}</label>{children}</div>;
}

export function NumInput({ value, onChange, placeholder, step = 'any', suffix }: { value?: number; onChange: (v: number | undefined) => void; placeholder?: string; step?: string; suffix?: string }) {
  const [txt, setTxt] = useState(value === undefined ? '' : String(value).replace('.', ','));
  useEffect(() => { setTxt(value === undefined ? '' : String(value).replace('.', ',')); }, [value]);
  return (
    <div class="row" style={{ gap: 8 }}>
      <input class="input num" inputMode="decimal" step={step} placeholder={placeholder} value={txt}
        onInput={(e) => {
          const t = (e.target as HTMLInputElement).value;
          setTxt(t);
          const n = Number(t.replace(',', '.'));
          onChange(t.trim() === '' || Number.isNaN(n) ? undefined : n);
        }} />
      {suffix && <span class="muted">{suffix}</span>}
    </div>
  );
}

export function Tag({ kind }: { kind: 'gemessen' | 'erfasst' | 'subjektiv' | 'geschätzt' }) {
  const cls = kind === 'geschätzt' ? 'geschaetzt' : kind;
  const label = { gemessen: 'Gemessen', erfasst: 'Erfasst', subjektiv: 'Subjektiv', geschätzt: 'Geschätzt' }[kind];
  return <span class={`tag ${cls}`}>{label}</span>;
}

export function NavBar({ title, right, onBack, backLabel = 'Zurück' }: { title?: string; right?: ComponentChildren; onBack?: () => void; backLabel?: string }) {
  return (
    <div class="navbar">
      <div class="nb-side"><button class="back" onClick={onBack ?? (() => nav.pop())}>‹ {backLabel}</button></div>
      <div class="nb-title">{title}</div>
      <div class="nb-side r">{right}</div>
    </div>
  );
}

export function SubPage({ title, children, right, onBack }: { title: string; children: ComponentChildren; right?: ComponentChildren; onBack?: () => void }) {
  return (
    <div class="overlay">
      <NavBar title={title} right={right} onBack={onBack} />
      <div class="page sub" style={{ paddingTop: 4 }}>{children}</div>
    </div>
  );
}

export function Sheet({ title, onClose, children, action }: { title?: string; onClose: () => void; children: ComponentChildren; action?: ComponentChildren }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div class="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div class="grabber" />
        <div class="sheet-head">
          <button class="btn plain" onClick={onClose}>Abbrechen</button>
          <div class="title-m">{title}</div>
          <div style={{ minWidth: 86, display: 'flex', justifyContent: 'flex-end' }}>{action}</div>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Empty({ title, text, action }: { title: string; text?: string; action?: JSX.Element }) {
  return (
    <div class="card center" style={{ padding: '28px 20px' }}>
      <div class="title-m">{title}</div>
      {text && <p class="muted small" style={{ margin: '6px 0 0' }}>{text}</p>}
      {action && <div class="mt">{action}</div>}
    </div>
  );
}

export function LevelDots({ level, total }: { level: number; total: number }) {
  return <div class="level-dots" aria-label={`Stufe ${level + 1} von ${total}`}>{Array.from({ length: total }, (_, i) => <i key={i} class={i <= level ? 'on' : ''} />)}</div>;
}

export function Spinner() {
  return <div class="spinner" role="status" aria-label="lädt" />;
}
