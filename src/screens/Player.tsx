import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { data, nav, navStore, toast, useStore } from '../state';
import { equipmentFor, flatten, generatePlan, type Plan, type Step } from '../domain/planner';
import { EXERCISE_MAP, PATHS } from '../domain/exercises';
import { hasEquipment, initialTarget, resolve } from '../domain/progression';
import { exerciseAllowed, evaluateCheckIn, STOP_RULES } from '../domain/safety';
import type { Exercise, ExerciseLog, Location, PathId, Session, SessionKind } from '../domain/types';
import { clamp, fmtClock, uid } from '../domain/util';
import { finishSession, type CoachNote } from '../db/repo';
import { Figure } from '../ui/Figure';
import { Scale, Sheet, Stepper } from '../ui/kit';
import { beep, keepAwake, say, unlockAudio, configureAudio } from '../ui/audio';
import { planContext } from './common';
import { ExerciseInfo } from './Library';

const KEY = 'forma.activeWorkout.v1';

interface Active {
  id: string;
  title: string;
  kind: SessionKind;
  minutes: number;
  location: Location;
  startedAt: string;
  steps: Step[];
  idx: number;
  logs: Record<number, ExerciseLog>;
  adjustments: string[];
  restEndsAt?: number;
  holdStartedAt?: number;
  pausedSec?: number;
}

export function loadActive(): Active | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const a = JSON.parse(raw) as Active;
    // Ältere als 12 h verwerfen
    if (Date.now() - new Date(a.startedAt).getTime() > 12 * 3600_000) { localStorage.removeItem(KEY); return null; }
    return a;
  } catch { return null; }
}
function saveActive(a: Active | null) {
  try { a ? localStorage.setItem(KEY, JSON.stringify(a)) : localStorage.removeItem(KEY); } catch { /* Speicher voll/privat – Training läuft trotzdem */ }
}

function newActive(plan: Plan): Active {
  const steps = flatten(plan);
  const logs: Record<number, ExerciseLog> = {};
  let idx = 0;
  for (const b of plan.blocks) for (const it of b.items) {
    const e = EXERCISE_MAP[it.exerciseId];
    const tracked = b.kind === 'main' || b.kind === 'extra' || (b.kind === 'mobility' && e.pattern !== 'mobility');
    logs[idx++] = { exerciseId: it.exerciseId, path: tracked ? it.path : undefined, level: it.level, sets: [] };
  }
  return { id: uid(), title: plan.title, kind: plan.kind as SessionKind, minutes: plan.minutes, location: plan.location, startedAt: new Date().toISOString(), steps, idx: 0, logs, adjustments: [] };
}

const unitOf = (e: Exercise) => (e.mode === 'reps' ? 'Wdh.' : 's');
const sideLabel = (s?: 'L' | 'R') => (s === 'L' ? 'links' : s === 'R' ? 'rechts' : '');

export function Player() {
  const d = useStore(data);
  const navState = useStore(navStore);
  const opts = navState.player!;
  const [a, setA] = useState<Active | null>(() => {
    if (opts.resume) return loadActive();
    const plan = generatePlan(planContext(d), { minutes: opts.minutes, mode: opts.mode, location: opts.location });
    if (plan.kind === 'pause' || !plan.blocks.length) return null;
    return newActive(plan);
  });
  const [now, setNow] = useState(Date.now());
  const [sheet, setSheet] = useState<null | 'info' | 'variant' | 'pain' | 'exit'>(null);
  const [actual, setActual] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const lastBeep = useRef(-1);

  useEffect(() => { configureAudio({ sound: d.settings.sound, voice: d.settings.voice }); unlockAudio(); void keepAwake(true); return () => { void keepAwake(false); }; }, []);
  useEffect(() => { saveActive(done ? null : a); }, [a, done]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 200); return () => clearInterval(t); }, []);

  const update = (f: (x: Active) => Active) => setA((x) => (x ? f(x) : x));
  const step = a && a.idx < a.steps.length ? a.steps[a.idx] : undefined;

  const equipment = useMemo(() => equipmentFor(d.profile!, a?.location ?? 'zuhause'), [d.profile, a?.location]);
  const safety = useMemo(() => evaluateCheckIn(planContext(d).checkin), [d.checkins]);

  // Ansage bei neuer Übung
  useEffect(() => {
    if (!a || !step) return;
    if (step.t === 'work') {
      setActual(null);
      const e = EXERCISE_MAP[step.exerciseId];
      say(`${e.name}. ${step.target} ${e.mode === 'reps' ? 'Wiederholungen' : 'Sekunden'}${step.side ? `, ${sideLabel(step.side)}` : ''}.`);
    } else if (step.t === 'rest' && !a.restEndsAt) {
      update((x) => ({ ...x, restEndsAt: Date.now() + step.sec * 1000 }));
    }
    lastBeep.current = -1;
  }, [a?.idx]);

  // Pausen-Timer & Halte-Timer
  const restLeft = step?.t === 'rest' && a?.restEndsAt ? Math.max(0, (a.restEndsAt - now) / 1000) : 0;
  const holdElapsed = a?.holdStartedAt ? (now - a.holdStartedAt) / 1000 : 0;
  useEffect(() => {
    if (!a || !step) return;
    if (step.t === 'rest' && a.restEndsAt) {
      const s = Math.ceil(restLeft);
      if (s <= 3 && s > 0 && lastBeep.current !== s) { lastBeep.current = s; beep('tick'); }
      if (restLeft <= 0) { beep('go'); next(); }
    }
    if (step.t === 'work' && a.holdStartedAt) {
      const left = step.target - holdElapsed;
      const s = Math.ceil(left);
      if (s <= 3 && s > 0 && lastBeep.current !== s) { lastBeep.current = s; beep('tick'); }
      if (left <= 0) { beep('done'); completeSet(Math.round(step.target)); }
    }
  }, [now]);

  if (!a) {
    return (
      <div class="player">
        <div class="player-main center">
          <div class="title-l">Keine Einheit verfügbar</div>
          <p class="muted">Für heute ist eine Pause empfohlen oder die Einheit wurde beendet.</p>
          <button class="btn primary" onClick={() => nav.endWorkout()}>Zurück</button>
        </div>
      </div>
    );
  }

  function next() {
    update((x) => ({ ...x, idx: x.idx + 1, restEndsAt: undefined, holdStartedAt: undefined }));
  }

  function completeSet(value: number) {
    if (!a || !step || step.t !== 'work') return;
    const e = EXERCISE_MAP[step.exerciseId];
    update((x) => {
      const log = { ...x.logs[step.itemIndex] };
      log.exerciseId = step.exerciseId;
      log.sets = [...log.sets, { target: step.target, side: step.side, ...(e.mode === 'reps' ? { reps: value } : { holdSec: value }) }];
      return { ...x, logs: { ...x.logs, [step.itemIndex]: log }, idx: x.idx + 1, holdStartedAt: undefined, restEndsAt: undefined };
    });
  }

  function skipExercise() {
    if (!step || step.t !== 'work') return;
    const item = step.itemIndex;
    update((x) => {
      const remaining = x.steps.slice(x.idx).filter((s) => !(s.t === 'work' && s.itemIndex === item));
      const cleaned: Step[] = [];
      for (const s of remaining) { if (s.t === 'rest' && (cleaned.length === 0 || cleaned[cleaned.length - 1].t === 'rest')) continue; cleaned.push(s); }
      while (cleaned.length && cleaned[cleaned.length - 1].t === 'rest') cleaned.pop();
      const log = { ...x.logs[item], skipped: x.logs[item].sets.length === 0 };
      return { ...x, steps: [...x.steps.slice(0, x.idx), ...cleaned], logs: { ...x.logs, [item]: log }, adjustments: [...x.adjustments, `${EXERCISE_MAP[step.exerciseId].name} übersprungen`], restEndsAt: undefined, holdStartedAt: undefined };
    });
    setSheet(null);
  }

  function swapTo(ex: Exercise, level: number | undefined, reason: string) {
    if (!step || step.t !== 'work') return;
    const item = step.itemIndex;
    const oldEx = EXERCISE_MAP[step.exerciseId];
    const target = oldEx.mode === ex.mode ? clamp(step.target, ex.range[0], ex.range[1]) : initialTarget(ex);
    update((x) => {
      const out: Step[] = [];
      const seen = new Set<number>();
      for (const s of x.steps.slice(x.idx)) {
        if (s.t === 'work' && s.itemIndex === item) {
          if (seen.has(s.set)) continue;
          seen.add(s.set);
          const base = { ...s, exerciseId: ex.id, target, level, side: undefined };
          if (ex.unilateral) out.push({ ...base, side: 'L' }, { t: 'rest', sec: 10, next: `${ex.name} · rechts` }, { ...base, side: 'R' });
          else out.push(base);
          continue;
        }
        const prev = out[out.length - 1];
        if (s.t === 'rest' && s.sec === 10 && s.next.endsWith('rechts') && prev?.t === 'work' && prev.itemIndex === item) continue;
        out.push(s);
      }
      const log: ExerciseLog = { ...x.logs[item], exerciseId: ex.id, level, swappedFrom: oldEx.id };
      return { ...x, steps: [...x.steps.slice(0, x.idx), ...out], logs: { ...x.logs, [item]: log }, adjustments: [...x.adjustments, `${oldEx.name} → ${ex.name} (${reason})`], holdStartedAt: undefined };
    });
    setSheet(null);
    toast(`Gewechselt zu ${ex.name}`);
  }

  function adjustTarget(delta: number) {
    if (!step || step.t !== 'work') return;
    const e = EXERCISE_MAP[step.exerciseId];
    const item = step.itemIndex;
    update((x) => ({
      ...x,
      steps: x.steps.map((s, i) => (i >= x.idx && s.t === 'work' && s.itemIndex === item ? { ...s, target: clamp(s.target + delta, 1, e.range[1] * 2) } : s)),
    }));
  }

  // ── Fertig: Zusammenfassung ──
  if (done || !step) return <Summary a={a} equipment={equipment} onLog={(item, patch) => update((x) => ({ ...x, logs: { ...x.logs, [item]: { ...x.logs[item], ...patch } } }))} onFinish={() => { setDone(true); }} />;

  const workSteps = a.steps.filter((s) => s.t === 'work').length;
  const doneSteps = a.steps.slice(0, a.idx).filter((s) => s.t === 'work').length;
  const progress = doneSteps / Math.max(1, workSteps);

  // Feedback zur gerade abgeschlossenen Übung (in der Pause)
  const prevWork = [...a.steps.slice(0, a.idx)].reverse().find((s) => s.t === 'work') as Extract<Step, { t: 'work' }> | undefined;
  const prevFinished = prevWork && !a.steps.slice(a.idx).some((s) => s.t === 'work' && s.itemIndex === prevWork.itemIndex);
  const prevLog = prevWork ? a.logs[prevWork.itemIndex] : undefined;

  const top = (
    <div class="player-top">
      <button class="icon-btn" aria-label="Beenden" onClick={() => setSheet('exit')}>✕</button>
      <div class="progress" role="progressbar" aria-valuenow={Math.round(progress * 100)}><div style={{ width: `${progress * 100}%` }} /></div>
      <span class="small muted num">{doneSteps}/{workSteps}</span>
    </div>
  );

  let body;
  if (step.t === 'rest') {
    const nextStep = a.steps[a.idx + 1];
    const nextEx = nextStep?.t === 'work' ? EXERCISE_MAP[nextStep.exerciseId] : undefined;
    const r = 120, c = 2 * Math.PI * r;
    const frac = step.sec ? restLeft / step.sec : 0;
    body = (
      <>
        <div class="player-main">
          <div class="center eyebrow">Pause</div>
          <div class="rest-ring">
            <svg viewBox="0 0 260 260" aria-hidden="true">
              <circle cx="130" cy="130" r={r} stroke="var(--fill)" />
              <circle cx="130" cy="130" r={r} stroke="var(--accent)" stroke-dasharray={`${c * frac} ${c}`} />
            </svg>
            <div class="t num" role="timer" aria-live="off">{fmtClock(restLeft)}</div>
          </div>
          {prevFinished && prevLog?.path && prevWork && (
            <div class="card tight">
              <div class="small" style={{ fontWeight: 600 }}>{EXERCISE_MAP[prevWork.exerciseId].name}: Wie viele Wiederholungen wären noch gegangen?</div>
              <div class="chips mt">
                {[0, 1, 2, 3, 4].map((v) => <button key={v} class={`chip accent ${prevLog.rir === v ? 'on' : ''}`} onClick={() => update((x) => ({ ...x, logs: { ...x.logs, [prevWork.itemIndex]: { ...x.logs[prevWork.itemIndex], rir: v } } }))}>{v === 4 ? '4+' : v}</button>)}
              </div>
              <div class="chips mt">
                {(['sauber', 'unsauber'] as const).map((f) => <button key={f} class={`chip ${prevLog.form === f ? 'on' : ''}`} onClick={() => update((x) => ({ ...x, logs: { ...x.logs, [prevWork.itemIndex]: { ...x.logs[prevWork.itemIndex], form: f } } }))}>Technik {f}</button>)}
              </div>
            </div>
          )}
          {nextEx && (
            <div class="row card tight" style={{ gap: 14 }}>
              <div style={{ width: 96, flex: 'none' }} class="fig-box"><Figure anim={nextEx.anim} /></div>
              <div class="grow">
                <div class="xs muted">Als Nächstes{nextStep?.t === 'work' && nextStep.side ? ` · ${sideLabel(nextStep.side)}` : ''}</div>
                <div class="title-m">{nextEx.name}</div>
                {nextStep?.t === 'work' && <div class="small muted num">{nextStep.target} {unitOf(nextEx)} · Satz {nextStep.set}/{nextStep.sets}</div>}
              </div>
            </div>
          )}
        </div>
        <div class="player-bottom">
          <div class="grid2">
            <button class="btn secondary xl" onClick={() => update((x) => ({ ...x, restEndsAt: (x.restEndsAt ?? Date.now()) + 15000 }))}>+15 s</button>
            <button class="btn primary xl" onClick={() => { unlockAudio(); next(); }}>Weiter</button>
          </div>
        </div>
      </>
    );
  } else {
    const e = EXERCISE_MAP[step.exerciseId];
    const val = actual ?? step.target;
    const running = !!a.holdStartedAt;
    const holdLeft = running ? Math.max(0, step.target - holdElapsed) : step.target;
    body = (
      <>
        <div class="player-main">
          <div class="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <span class="pill">{step.block}</span>
            {step.sets > 1 && <span class="pill num">Satz {step.set}/{step.sets}</span>}
            {step.side && <span class="pill accent">{sideLabel(step.side)}</span>}
            {e.fallRisk && <span class="pill warn">Halt in Griffweite</span>}
          </div>
          <button class="fig-box" onClick={() => setSheet('info')} aria-label="Übungsdetails"><Figure anim={e.anim} label={e.name} muscles={e.muscles.primary} /></button>
          <button style={{ textAlign: 'left' }} onClick={() => setSheet('info')}>
            <div class="player-name">{e.name} <span class="faint" style={{ fontSize: 20 }}>ⓘ</span></div>
            <div class="small muted">{e.steps[1] ?? e.steps[0]}</div>
          </button>
          {e.mode === 'reps' ? (
            <div class="row between">
              <div class="player-target num">{step.target}<small>Wdh.</small></div>
              <div class="row" style={{ gap: 6 }}>
                <button class="icon-btn" aria-label="Ziel verringern" onClick={() => adjustTarget(-1)}>−</button>
                <button class="icon-btn" aria-label="Ziel erhöhen" onClick={() => adjustTarget(1)}>+</button>
              </div>
            </div>
          ) : (
            <div class="row between">
              <div class="player-target num">{fmtClock(holdLeft)}<small>{running ? '' : 'Ziel'}</small></div>
              {!running && (
                <div class="row" style={{ gap: 6 }}>
                  <button class="icon-btn" aria-label="Ziel verringern" onClick={() => adjustTarget(-5)}>−</button>
                  <button class="icon-btn" aria-label="Ziel erhöhen" onClick={() => adjustTarget(5)}>+</button>
                </div>
              )}
            </div>
          )}
        </div>
        <div class="player-tools">
          <button onClick={() => setSheet('info')}><span>ⓘ</span>Info</button>
          <button onClick={() => setSheet('variant')}><span>⇅</span>Variante</button>
          <button onClick={() => setSheet('pain')} style={{ color: 'var(--warn)' }}><span>!</span>Beschwerden</button>
          <button onClick={skipExercise}><span>»</span>Überspringen</button>
        </div>
        <div class="player-bottom">
          {e.mode === 'reps' ? (
            <>
              <Stepper big value={val} min={0} max={200} onChange={setActual} suffix="geschafft" />
              <button class="btn primary xl block" onClick={() => { unlockAudio(); beep('tick'); completeSet(val); }}>Satz fertig</button>
            </>
          ) : running ? (
            <button class="btn secondary xl block" onClick={() => { beep('done'); completeSet(Math.round(holdElapsed)); }}>Beenden bei {Math.round(holdElapsed)} s</button>
          ) : (
            <div class="grid2">
              <button class="btn secondary xl" onClick={() => completeSet(step.target)}>Erledigt</button>
              <button class="btn primary xl" onClick={() => { unlockAudio(); beep('go'); update((x) => ({ ...x, holdStartedAt: Date.now() })); }}>Start</button>
            </div>
          )}
        </div>
      </>
    );
  }

  const curEx = step.t === 'work' ? EXERCISE_MAP[step.exerciseId] : undefined;
  return (
    <div class="player">
      {top}
      {body}
      {sheet === 'info' && curEx && (
        <Sheet title={curEx.name} onClose={() => setSheet(null)}><ExerciseInfo e={curEx} compact /></Sheet>
      )}
      {sheet === 'variant' && curEx && step.t === 'work' && (
        <VariantSheet e={curEx} path={step.path} level={step.level} equipment={equipment} onClose={() => setSheet(null)}
          allowed={(x) => exerciseAllowed(x, d.profile!, safety).ok} onPick={swapTo} />
      )}
      {sheet === 'pain' && curEx && step.t === 'work' && (
        <Sheet title="Beschwerden" onClose={() => setSheet(null)}>
          <p class="muted">Schmerz ist kein Trainingsreiz. Wähle, wie es weitergehen soll:</p>
          <div class="stack">
            {step.path && (() => {
              const r = resolve(step.path, Math.max(0, (step.level ?? 0) - 1), equipment, (x) => x.id !== curEx.id && exerciseAllowed(x, d.profile!, safety).ok);
              return r ? <button class="btn tinted block" onClick={() => { update((x) => ({ ...x, logs: { ...x.logs, [step.itemIndex]: { ...x.logs[step.itemIndex], pain: true } } })); swapTo(r.exercise, r.level, 'Beschwerden'); }}>Leichtere Variante: {r.exercise.name}</button> : null;
            })()}
            <button class="btn secondary block" onClick={() => { update((x) => ({ ...x, logs: { ...x.logs, [step.itemIndex]: { ...x.logs[step.itemIndex], pain: true } } })); skipExercise(); }}>Übung für heute weglassen</button>
            <button class="btn danger block" onClick={() => { update((x) => ({ ...x, logs: { ...x.logs, [step.itemIndex]: { ...x.logs[step.itemIndex], pain: true } }, adjustments: [...x.adjustments, 'Wegen Beschwerden beendet'] })); setSheet(null); setA((x) => (x ? { ...x, idx: x.steps.length } : x)); }}>Training beenden</button>
          </div>
          <div class="card warn mt-l small">
            <strong>Sofort aufhören bei:</strong>
            <ul class="bullets" style={{ color: 'inherit' }}>{STOP_RULES.map((r) => <li key={r}>{r}</li>)}</ul>
          </div>
        </Sheet>
      )}
      {sheet === 'exit' && (
        <Sheet title="Einheit beenden?" onClose={() => setSheet(null)}>
          <div class="stack">
            <button class="btn primary block" onClick={() => { setSheet(null); setA((x) => (x ? { ...x, idx: x.steps.length } : x)); }}>Beenden und speichern</button>
            <button class="btn secondary block" onClick={() => { saveActive(a); nav.endWorkout(); }}>Später fortsetzen</button>
            <button class="btn danger block" onClick={() => { saveActive(null); nav.endWorkout(); }}>Verwerfen</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function VariantSheet({ e, path, level, equipment, onClose, onPick, allowed }: { e: Exercise; path?: PathId; level?: number; equipment: ReturnType<typeof equipmentFor>; onClose: () => void; onPick: (ex: Exercise, level: number | undefined, reason: string) => void; allowed: (e: Exercise) => boolean }) {
  const easier = path && level !== undefined && level > 0 ? resolve(path, level - 1, equipment, allowed) : null;
  const harder = path && level !== undefined ? (() => {
    for (let l = level + 1; l < PATHS[path].levels.length; l++) {
      const r = PATHS[path].levels[l].map((id) => EXERCISE_MAP[id]).find((x) => hasEquipment(x, equipment) && allowed(x) && x.id !== e.id);
      if (r) return { exercise: r, level: l };
    }
    return null;
  })() : null;
  const alts = Object.values(EXERCISE_MAP).filter((x) => x.pattern === e.pattern && x.id !== e.id && hasEquipment(x, equipment) && allowed(x) && x.id !== easier?.exercise.id && x.id !== harder?.exercise.id).slice(0, 5);
  return (
    <Sheet title="Variante wählen" onClose={onClose}>
      <div class="list">
        {easier && easier.exercise.id !== e.id && <button class="list-row" onClick={() => onPick(easier.exercise, easier.level, 'leichter')}><span class="icon-dot" style={{ background: 'var(--c-mobility)' }}>↓</span><div class="grow"><div>{easier.exercise.name}</div><div class="small muted">Leichter</div></div></button>}
        {harder && <button class="list-row" onClick={() => onPick(harder.exercise, harder.level, 'schwerer')}><span class="icon-dot">↑</span><div class="grow"><div>{harder.exercise.name}</div><div class="small muted">Anspruchsvoller – nur wenn die aktuelle Variante sicher sitzt</div></div></button>}
        {alts.map((x) => {
          const lv = path ? PATHS[path].levels.findIndex((ids) => ids.includes(x.id)) : -1;
          return <button key={x.id} class="list-row" onClick={() => onPick(x, lv >= 0 ? lv : undefined, 'Alternative')}><span class="icon-dot" style={{ background: 'var(--c-other)' }}>⇄</span><div class="grow"><div>{x.name}</div><div class="small muted">Alternative · Schwierigkeit {x.difficulty}/5</div></div></button>;
        })}
        {!easier && !harder && !alts.length && <div class="list-row muted">Keine passende Alternative mit deinem Equipment.</div>}
      </div>
      <p class="small faint mt">Ein Wechsel gilt nur für diese Einheit. Deine Progression passt FORMA nach dem Training an.</p>
    </Sheet>
  );
}

function Summary({ a, equipment, onLog, onFinish }: { a: Active; equipment: ReturnType<typeof equipmentFor>; onLog: (item: number, patch: Partial<ExerciseLog>) => void; onFinish: () => void }) {
  const [rpe, setRpe] = useState<number | undefined>();
  const [energy, setEnergy] = useState<number | undefined>();
  const [note, setNote] = useState('');
  const [notes, setNotes] = useState<CoachNote[] | null>(null);
  const [saving, setSaving] = useState(false);
  const dur = Math.round((Date.now() - new Date(a.startedAt).getTime()) / 1000);
  const logs = Object.entries(a.logs).map(([k, v]) => ({ item: Number(k), log: v })).filter((x) => x.log.sets.length || x.log.skipped);
  const tracked = logs.filter((x) => x.log.path && x.log.sets.length);
  const totalSets = logs.reduce((s, x) => s + x.log.sets.length, 0);

  async function save() {
    setSaving(true);
    try {
      const session: Session = {
        id: a.id, date: a.startedAt, endedAt: new Date().toISOString(), durationSec: Math.min(dur, 4 * 3600), kind: a.kind, title: a.title,
        minutesPlanned: a.minutes, location: a.location, exercises: logs.map((x) => x.log), rpe, energy, note: note.trim() || undefined, adjustments: a.adjustments,
      };
      const n = await finishSession(session, equipment);
      saveActive(null);
      setNotes(n);
      onFinish();
    } catch (e) {
      toast('Speichern fehlgeschlagen – Daten bleiben erhalten, bitte erneut versuchen.');
      console.error(e);
    } finally { setSaving(false); }
  }

  if (notes) {
    return (
      <div class="player" style={{ overflowY: 'auto' }}>
        <div class="player-main" style={{ justifyContent: 'flex-start', paddingTop: 30 }}>
          <div class="eyebrow">Gespeichert</div>
          <h1 class="title-xl display" style={{ margin: 0 }}>Gut gemacht.</h1>
          <p class="muted" style={{ margin: 0 }}>Jede Einheit zählt – auch die kurzen.</p>
          {notes.length > 0 && (
            <div class="list mt">
              {notes.map((n, i) => <div key={i} class="list-row small"><span class="icon-dot" style={{ background: n.change === 'hoch' ? 'var(--accent)' : n.change === 'runter' ? 'var(--c-cardio)' : 'var(--c-other)' }}>{n.change === 'hoch' ? '↑' : n.change === 'runter' ? '↓' : n.change === 'ziel+' ? '+' : '·'}</span><div class="grow">{n.text}</div></div>)}
            </div>
          )}
        </div>
        <div class="player-bottom"><button class="btn primary xl block" onClick={() => nav.endWorkout()}>Fertig</button></div>
      </div>
    );
  }

  return (
    <div class="player" style={{ overflowY: 'auto', justifyContent: 'flex-start' }}>
      <div style={{ maxWidth: 560, margin: '0 auto', width: '100%', paddingTop: 16 }}>
        <div class="eyebrow">Zusammenfassung</div>
        <h1 class="title-l display" style={{ margin: '4px 0 14px' }}>{a.title}</h1>
        <div class="grid3">
          <div class="card tight metric"><div class="l">Dauer</div><div class="v num">{Math.round(dur / 60)}<span class="u">min</span></div></div>
          <div class="card tight metric"><div class="l">Sätze</div><div class="v num">{totalSets}</div></div>
          <div class="card tight metric"><div class="l">Übungen</div><div class="v num">{logs.filter((x) => x.log.sets.length).length}</div></div>
        </div>

        {tracked.some((x) => x.log.rir === undefined || !x.log.form) && (
          <>
            <h2 class="sec-title">Kurzes Feedback</h2>
            <p class="small muted" style={{ margin: '-4px 2px 10px' }}>Geschätzte Wiederholungen in Reserve beim letzten Satz – steuert die Progression.</p>
            <div class="stack">
              {tracked.filter((x) => x.log.rir === undefined || !x.log.form).map(({ item, log }) => (
                <div class="card tight" key={item}>
                  <div class="small" style={{ fontWeight: 600 }}>{EXERCISE_MAP[log.exerciseId].name}</div>
                  <div class="chips mt">{[0, 1, 2, 3, 4].map((v) => <button key={v} class={`chip accent ${log.rir === v ? 'on' : ''}`} onClick={() => onLog(item, { rir: v })}>{v === 4 ? '4+' : v} RIR</button>)}</div>
                  <div class="chips mt">{(['sauber', 'unsauber'] as const).map((f) => <button key={f} class={`chip ${log.form === f ? 'on' : ''}`} onClick={() => onLog(item, { form: f })}>{f}</button>)}</div>
                </div>
              ))}
            </div>
          </>
        )}

        <h2 class="sec-title">Wie anstrengend war die Einheit?</h2>
        <Scale value={rpe} min={1} max={10} onChange={setRpe} labels={['sehr leicht', 'maximal']} />
        <h2 class="sec-title">Energie danach</h2>
        <Scale value={energy} onChange={setEnergy} labels={['erschöpft', 'voller Energie']} />
        <h2 class="sec-title">Notiz</h2>
        <textarea class="input" placeholder="Optional" value={note} onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)} />

        <div class="list mt-l">
          {logs.map(({ item, log }) => {
            const e = EXERCISE_MAP[log.exerciseId];
            return <div key={item} class="list-row small"><div class="grow">{e.name}{log.pain && <span class="pill warn" style={{ marginLeft: 6 }}>Beschwerden</span>}</div><span class="val num">{log.skipped ? 'übersprungen' : log.sets.map((s) => (e.mode === 'reps' ? s.reps : `${s.holdSec}s`)).join(' · ')}</span></div>;
          })}
        </div>
        <button class="btn primary xl block mt-l" disabled={saving} onClick={save}>{saving ? 'Speichere …' : 'Speichern'}</button>
        <div style={{ height: 30 }} />
      </div>
    </div>
  );
}
