import { useState } from 'preact/hooks';
import { data, nav, toast, useStore } from '../state';
import { repo } from '../db/repo';
import { JOINT_LABEL } from '../domain/exercises';
import { WARNINGS, evaluateCheckIn } from '../domain/safety';
import { profileRules } from '../domain/conditions';
import type { CheckIn, Joint } from '../domain/types';
import { dayKey } from '../domain/util';
import { Check, Field, NumInput, Scale, Sheet } from '../ui/kit';

export function CheckInSheet() {
  const d = useStore(data);
  const today = dayKey();
  const existing = d.checkins.find((c) => c.date === today);
  const prev = d.checkins[0];
  const [c, setC] = useState<CheckIn>(existing ?? { date: today, sleepQuality: prev?.sleepQuality ?? 3, energy: 3, soreness: 0, pains: [], warnings: [], sleepHours: undefined });
  const [showPain, setShowPain] = useState(c.pains.length > 0);
  const [showWarn, setShowWarn] = useState(c.warnings.length > 0);
  const [more, setMore] = useState(false);

  const setPain = (j: Joint, v: number) => {
    const others = c.pains.filter((p) => p.joint !== j);
    setC({ ...c, pains: v > 0 ? [...others, { joint: j, intensity: v }] : others });
  };
  const save = async () => {
    await repo.saveCheckin(c);
    const ev = evaluateCheckIn(c);
    nav.sheet(undefined);
    toast(ev.status === 'ok' ? 'Tagesform gespeichert – Plan angepasst' : 'Gespeichert – bitte Hinweis auf der Startseite beachten');
  };

  return (
    <Sheet title="Tagesform" onClose={() => nav.sheet(undefined)} action={<button class="btn plain" onClick={save}>Fertig</button>}>
      <div class="stack" style={{ gap: 18 }}>
        <Field label="Wie hast du geschlafen?"><Scale value={c.sleepQuality} onChange={(v) => setC({ ...c, sleepQuality: v })} labels={['schlecht', 'sehr gut']} /></Field>
        <Field label="Energie"><Scale value={c.energy} onChange={(v) => setC({ ...c, energy: v })} labels={['leer', 'voller Energie']} /></Field>
        <Field label="Muskelkater"><Scale value={c.soreness} min={0} max={4} onChange={(v) => setC({ ...c, soreness: v })} labels={['keiner', 'stark']} /></Field>

        <div class="list">
          <Check on={showPain} onChange={(v) => { setShowPain(v); if (!v) setC({ ...c, pains: [] }); }}>Schmerzen oder Beschwerden</Check>
          <Check on={showWarn} onChange={(v) => { setShowWarn(v); if (!v) setC({ ...c, warnings: [] }); }}>Warnsymptome (Brust, Atmung, Schwindel …)</Check>
        </div>

        {showPain && (
          <div class="card tight">
            <div class="label">Wo und wie stark? (0–10)</div>
            {(Object.keys(JOINT_LABEL) as Joint[]).map((j) => {
              const v = c.pains.find((p) => p.joint === j)?.intensity ?? 0;
              return (
                <div key={j} class="row" style={{ marginTop: 8 }}>
                  <span style={{ width: 120 }} class="small">{JOINT_LABEL[j]}</span>
                  <input type="range" min={0} max={10} value={v} aria-label={`${JOINT_LABEL[j]} Schmerz`} onInput={(e) => setPain(j, Number((e.target as HTMLInputElement).value))} />
                  <span class="num small" style={{ width: 28, textAlign: 'right', color: v >= 4 ? 'var(--warn)' : undefined }}>{v}</span>
                </div>
              );
            })}
          </div>
        )}
        {showWarn && (
          <div class="list">
            {WARNINGS.map((w) => (
              <Check key={w.id} on={c.warnings.includes(w.id)} onChange={(on) => setC({ ...c, warnings: on ? [...c.warnings, w.id] : c.warnings.filter((x) => x !== w.id) })}>{w.label}</Check>
            ))}
          </div>
        )}
        {c.warnings.includes('brustschmerz') && <div class="card danger small"><strong>Bei akuten Brustschmerzen, Atemnot in Ruhe oder Ohnmachtsgefühl: Notruf 112.</strong></div>}

        <button class="btn plain small" onClick={() => setMore(!more)}>{more ? 'Weniger' : 'Mehr erfassen (Schlafdauer, Ruhepuls, HRV, Stress)'}</button>
        {more && (
          <div class="stack">
            <p class="xs faint" style={{ margin: 0 }}>Werte von Apple Watch oder Oura bitte manuell übernehmen – eine automatische Anbindung ist in der Web-Version nicht möglich.</p>
            <div class="grid2">
              <Field label="Schlafdauer"><NumInput value={c.sleepHours} suffix="h" onChange={(v) => setC({ ...c, sleepHours: v })} /></Field>
              <Field label="Ruhepuls"><NumInput value={c.restingHR} suffix="/min" onChange={(v) => setC({ ...c, restingHR: v })} /></Field>
              <Field label="HRV"><NumInput value={c.hrv} suffix="ms" onChange={(v) => setC({ ...c, hrv: v })} /></Field>
            </div>
            <Field label="Stress"><Scale value={c.stress} onChange={(v) => setC({ ...c, stress: v })} labels={['entspannt', 'sehr hoch']} /></Field>
            <Field label="Notiz"><textarea class="input" value={c.note ?? ''} onInput={(e) => setC({ ...c, note: (e.target as HTMLTextAreaElement).value || undefined })} /></Field>
          </div>
        )}
        <button class="btn primary block xl" onClick={save}>Speichern</button>
      </div>
    </Sheet>
  );
}

export function QuickAddSheet() {
  const d = useStore(data);
  const showMeals = !!d.profile?.nutrition.enabled && !profileRules(d.profile).noCalories;
  const go = (fn: () => void) => { nav.sheet(undefined); fn(); };
  return (
    <Sheet title="Hinzufügen" onClose={() => nav.sheet(undefined)}>
      <div class="list">
        <button class="list-row" onClick={() => go(() => nav.push({ name: 'activity' }))}><span class="icon-dot" style={{ background: 'var(--c-cardio)' }}>↗</span>Aktivität (Laufen, Rad, Yoga …)</button>
        <button class="list-row" onClick={() => go(() => nav.push({ name: 'manualSession' }))}><span class="icon-dot">+</span>Krafttraining nachtragen</button>
        <button class="list-row" onClick={() => go(() => nav.push({ name: 'measurement' }))}><span class="icon-dot" style={{ background: 'var(--c-other)' }}>⚖</span>Messung (Gewicht, Bauchumfang)</button>
        {showMeals && <button class="list-row" onClick={() => go(() => nav.push({ name: 'meals' }))}><span class="icon-dot" style={{ background: 'var(--c-mobility)' }}>◒</span>Mahlzeit</button>}
        <button class="list-row" onClick={() => go(() => nav.push({ name: 'photos' }))}><span class="icon-dot" style={{ background: 'var(--c-other)' }}>◐</span>Fortschrittsfoto</button>
      </div>
    </Sheet>
  );
}
