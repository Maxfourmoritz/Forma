import { useState } from 'preact/hooks';
import { data, nav, toast, useStore } from '../state';
import { repo, finishSession } from '../db/repo';
import { EXERCISE_MAP, EXERCISES } from '../domain/exercises';
import { equipmentFor } from '../domain/planner';
import { dayTotals } from '../domain/nutrition';
import type { Activity, ActivityType, ExerciseLog, Measurement, Session } from '../domain/types';
import { dayKey, fmtDate, fmtDuration, fmtNum, fmtTime, uid } from '../domain/util';
import { Card, Chips, Empty, Field, NumInput, Row, SecTitle, Seg, Stepper, SubPage, Scale } from '../ui/kit';

export const ACTIVITY_LABEL: Record<ActivityType, string> = {
  laufen: 'Laufen', radfahren: 'Radfahren', peloton: 'Peloton', gehen: 'Zügiges Gehen', wandern: 'Wandern', yoga: 'Yoga', schwimmen: 'Schwimmen', tennis: 'Tennis/Ballsport', sonstiges: 'Sonstiges',
};
const KIND_LABEL: Record<string, string> = { kraft_a: 'Kraft A', kraft_b: 'Kraft B', minimum: 'Minimum', mobility: 'Mobilität', balance: 'Balance', frei: 'Freies Training', assessment: 'Standortbestimmung' };

type Entry = { date: string; kind: 'session'; s: Session } | { date: string; kind: 'activity'; a: Activity } | { date: string; kind: 'measure'; m: Measurement };

export function History() {
  const d = useStore(data);
  const [filter, setFilter] = useState<'alle' | 'training' | 'aktiv' | 'koerper'>('alle');
  const [limit, setLimit] = useState(40);
  const entries: Entry[] = [
    ...(filter === 'alle' || filter === 'training' ? d.sessions.map((s) => ({ date: s.date, kind: 'session' as const, s })) : []),
    ...(filter === 'alle' || filter === 'aktiv' ? d.activities.map((a) => ({ date: a.date, kind: 'activity' as const, a })) : []),
    ...(filter === 'alle' || filter === 'koerper' ? d.measurements.map((m) => ({ date: m.date, kind: 'measure' as const, m })) : []),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const shown = entries.slice(0, limit);
  const groups = new Map<string, Entry[]>();
  for (const e of shown) { const k = dayKey(e.date); groups.set(k, [...(groups.get(k) ?? []), e]); }

  return (
    <div class="page">
      <header class="page-head row between" style={{ alignItems: 'flex-end' }}>
        <div>
          <div class="eyebrow">{d.sessions.length} {d.sessions.length === 1 ? 'Einheit' : 'Einheiten'} · {d.activities.length} {d.activities.length === 1 ? 'Aktivität' : 'Aktivitäten'}</div>
          <h1 class="title-xl display">Historie</h1>
        </div>
        <button class="icon-btn" aria-label="Hinzufügen" onClick={() => nav.sheet({ name: 'quickAdd' })} style={{ background: 'var(--accent)', color: 'var(--accent-ink)', fontSize: 24 }}>+</button>
      </header>
      <Seg value={filter} options={[['alle', 'Alle'], ['training', 'Training'], ['aktiv', 'Aktivitäten'], ['koerper', 'Körper']]} onChange={setFilter} />
      {!entries.length && <div class="mt"><Empty title="Noch keine Einträge" text="Trainings, Aktivitäten und Messungen erscheinen hier – dauerhaft gespeichert auf diesem Gerät." /></div>}
      {[...groups.entries()].map(([k, es]) => {
        const meals = d.meals.filter((m) => dayKey(m.date) === k);
        const ck = d.checkins.find((c) => c.date === k);
        return (
          <div key={k}>
            <h2 class="sec-title" style={{ fontSize: 15, color: 'var(--text-2)', fontWeight: 600 }}>{fmtDate(k + 'T12:00', { weekday: 'long', day: 'numeric', month: 'long', year: k.slice(0, 4) !== String(new Date().getFullYear()) ? 'numeric' : undefined })}</h2>
            <div class="list">
              {es.map((e, i) => e.kind === 'session' ? (
                <Row key={i} icon="●" iconBg={e.s.kind === 'mobility' ? 'var(--c-mobility)' : 'var(--c-strength)'} title={e.s.title} sub={`${fmtTime(e.s.date)} · ${fmtDuration(e.s.durationSec)} · ${e.s.exercises.filter((x) => !x.skipped).length} Übungen${e.s.rpe ? ` · RPE ${e.s.rpe}` : ''}`} onClick={() => nav.push({ name: 'session', id: e.s.id })} />
              ) : e.kind === 'activity' ? (
                <Row key={i} icon="↗" iconBg="var(--c-cardio)" title={ACTIVITY_LABEL[e.a.type]} sub={`${e.a.durationMin} min${e.a.distanceKm ? ` · ${fmtNum(e.a.distanceKm)} km` : ''}${e.a.avgHR ? ` · Ø ${e.a.avgHR}/min` : ''}`} onClick={() => nav.push({ name: 'activity', id: e.a.id })} />
              ) : (
                <Row key={i} icon="⚖" iconBg="var(--c-other)" title="Messung" sub={[e.m.weightKg && `${fmtNum(e.m.weightKg)} kg`, e.m.waistCm && `${fmtNum(e.m.waistCm)} cm Bauch`, e.m.bodyFatPct && `${fmtNum(e.m.bodyFatPct)} % KFA`, e.m.restingHR && `Ruhepuls ${e.m.restingHR}`].filter(Boolean).join(' · ')} onClick={() => nav.push({ name: 'measurement', id: e.m.id })} />
              ))}
              {ck && <div class="list-row small muted">Tagesform: Schlaf {ck.sleepQuality}/5 · Energie {ck.energy}/5{ck.soreness ? ` · Muskelkater ${ck.soreness}/4` : ''}{ck.pains.length ? ` · Beschwerden: ${ck.pains.map((p) => `${p.joint} ${p.intensity}/10`).join(', ')}` : ''}</div>}
              {meals.length > 0 && <button class="list-row small muted" onClick={() => nav.push({ name: 'meals', date: k })}>Ernährung: {meals.length} Mahlzeiten · ca. {dayTotals(meals).kcal} kcal · {dayTotals(meals).protein} g Eiweiß<span class="chev" style={{ marginLeft: 'auto' }}>›</span></button>}
            </div>
          </div>
        );
      })}
      {entries.length > limit && <button class="btn secondary block mt" onClick={() => setLimit(limit + 60)}>Ältere laden</button>}
    </div>
  );
}

export function SessionDetail({ id }: { id: string }) {
  const d = useStore(data);
  const s = d.sessions.find((x) => x.id === id);
  const [note, setNote] = useState(s?.note ?? '');
  const [confirm, setConfirm] = useState(false);
  if (!s) return <SubPage title="Einheit"><Empty title="Nicht gefunden" /></SubPage>;
  return (
    <SubPage title={KIND_LABEL[s.kind] ?? 'Einheit'}>
      <div class="eyebrow">{fmtDate(s.date, { weekday: 'long', day: 'numeric', month: 'long' })} · {fmtTime(s.date)}</div>
      <h1 class="title-l display" style={{ margin: '4px 0 14px' }}>{s.title}</h1>
      <div class="grid3">
        <Card class="tight metric"><div class="l">Dauer</div><div class="v num">{Math.round(s.durationSec / 60)}<span class="u">min</span></div></Card>
        <Card class="tight metric"><div class="l">RPE</div><div class="v num">{s.rpe ?? '–'}</div></Card>
        <Card class="tight metric"><div class="l">Energie</div><div class="v num">{s.energy ?? '–'}</div></Card>
      </div>
      <SecTitle>Übungen</SecTitle>
      <div class="list">
        {s.exercises.map((x, i) => {
          const e = EXERCISE_MAP[x.exerciseId];
          return (
            <div key={i} class="list-row">
              <div class="grow">
                <div>{e?.name ?? x.exerciseId}{x.pain && <span class="pill warn" style={{ marginLeft: 6 }}>Beschwerden</span>}</div>
                <div class="small muted num">{x.skipped ? 'übersprungen' : x.sets.map((st) => `${st.side ? st.side + ' ' : ''}${e?.mode === 'reps' ? st.reps : `${st.holdSec}s`}`).join(' · ')}{x.rir !== undefined ? ` · RIR ${x.rir}` : ''}{x.form ? ` · ${x.form}` : ''}</div>
              </div>
            </div>
          );
        })}
      </div>
      {s.adjustments && s.adjustments.length > 0 && (<><SecTitle>Anpassungen</SecTitle><Card><ul class="bullets">{s.adjustments.map((a) => <li key={a}>{a}</li>)}</ul></Card></>)}
      <SecTitle>Notiz</SecTitle>
      <textarea class="input" value={note} onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)} onBlur={() => note !== (s.note ?? '') && repo.saveSession({ ...s, note: note || undefined }).then(() => toast('Notiz gespeichert'))} />
      <button class="btn danger block mt-l" onClick={() => (confirm ? repo.deleteSession(s.id).then(() => { nav.pop(); toast('Einheit gelöscht'); }) : setConfirm(true))}>{confirm ? 'Wirklich löschen?' : 'Einheit löschen'}</button>
      <p class="xs faint mt">Löschen ändert die bisherige Progression nicht rückwirkend.</p>
    </SubPage>
  );
}

function nowLocalInput(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function ActivityForm({ id }: { id?: string }) {
  const d = useStore(data);
  const existing = id ? d.activities.find((a) => a.id === id) : undefined;
  const last = d.activities[0];
  const [a, setA] = useState<Activity>(existing ?? { id: uid(), date: new Date().toISOString(), type: last?.type ?? 'peloton', durationMin: last?.durationMin ?? 30 });
  const [when, setWhen] = useState(nowLocalInput(new Date(a.date)));
  const z = d.profile!.hr;
  const save = async () => {
    await repo.saveActivity({ ...a, date: new Date(when).toISOString() });
    toast('Aktivität gespeichert');
    nav.pop();
  };
  return (
    <SubPage title={existing ? 'Aktivität' : 'Aktivität erfassen'} right={<button class="btn plain" onClick={save}>Sichern</button>}>
      <div class="stack">
        <Field label="Art"><Chips wrap value={a.type} options={Object.entries(ACTIVITY_LABEL) as [ActivityType, string][]} onChange={(t) => setA({ ...a, type: t })} /></Field>
        <Field label="Zeitpunkt"><input class="input" type="datetime-local" value={when} onInput={(e) => setWhen((e.target as HTMLInputElement).value)} /></Field>
        <Field label="Dauer"><Stepper value={a.durationMin} step={5} min={5} max={600} suffix="min" onChange={(v) => setA({ ...a, durationMin: v })} /></Field>
        <div class="grid2">
          <Field label="Distanz (optional)"><NumInput value={a.distanceKm} suffix="km" onChange={(v) => setA({ ...a, distanceKm: v })} /></Field>
          <Field label="Ø Puls (optional)"><NumInput value={a.avgHR} suffix="/min" onChange={(v) => setA({ ...a, avgHR: v })} /></Field>
        </div>
        {z.z1Bike && <p class="xs faint" style={{ margin: 0 }}>Dein Grundlagenbereich laut Leistungsdiagnostik: Rad {z.z1Bike[0]}–{z.z1Bike[1]}/min{z.z1Run ? `, Laufen ${z.z1Run[0]}–${z.z1Run[1]}/min` : ''}.</p>}
        <Field label="Anstrengung (RPE 1–10)"><Scale value={a.rpe} min={1} max={10} onChange={(v) => setA({ ...a, rpe: v })} /></Field>
        <Field label="Notiz"><textarea class="input" value={a.note ?? ''} onInput={(e) => setA({ ...a, note: (e.target as HTMLTextAreaElement).value || undefined })} /></Field>
        <button class="btn primary block xl" onClick={save}>Speichern</button>
        {existing && <button class="btn danger block" onClick={() => repo.deleteActivity(existing.id).then(() => { nav.pop(); toast('Gelöscht'); })}>Löschen</button>}
        <p class="xs faint">Apple Health/Watch-Workouts können in der Web-Version nicht automatisch übernommen werden – siehe Profil › Integrationen.</p>
      </div>
    </SubPage>
  );
}

export function MeasurementForm({ id }: { id?: string }) {
  const d = useStore(data);
  const existing = id ? d.measurements.find((m) => m.id === id) : undefined;
  const lastBfMethod = d.measurements.find((m) => m.bodyFatMethod)?.bodyFatMethod;
  const [m, setM] = useState<Measurement>(existing ?? { id: uid(), date: new Date().toISOString(), bodyFatMethod: lastBfMethod });
  const [when, setWhen] = useState(nowLocalInput(new Date(m.date)));
  const last = d.measurements.find((x) => x.weightKg) ?? undefined;
  const save = async () => {
    if (m.weightKg === undefined && m.waistCm === undefined && m.bodyFatPct === undefined && m.restingHR === undefined) { toast('Bitte mindestens einen Wert eingeben'); return; }
    await repo.saveMeasurement({ ...m, date: new Date(when).toISOString() });
    toast('Messung gespeichert');
    nav.pop();
  };
  return (
    <SubPage title="Messung" right={<button class="btn plain" onClick={save}>Sichern</button>}>
      <div class="stack">
        <Field label="Zeitpunkt"><input class="input" type="datetime-local" value={when} onInput={(e) => setWhen((e.target as HTMLInputElement).value)} /></Field>
        <Field label={`Gewicht${last?.weightKg ? ` (zuletzt ${fmtNum(last.weightKg)} kg)` : ''}`}><NumInput value={m.weightKg} suffix="kg" placeholder={last?.weightKg ? fmtNum(last.weightKg) : ''} onChange={(v) => setM({ ...m, weightKg: v })} /></Field>
        <Field label="Bauchumfang (auf Nabelhöhe, ausgeatmet)"><NumInput value={m.waistCm} suffix="cm" onChange={(v) => setM({ ...m, waistCm: v })} /></Field>
        <div class="grid2">
          <Field label="Körperfett (optional)"><NumInput value={m.bodyFatPct} suffix="%" onChange={(v) => setM({ ...m, bodyFatPct: v })} /></Field>
          <Field label="Ruhepuls (optional)"><NumInput value={m.restingHR} suffix="/min" onChange={(v) => setM({ ...m, restingHR: v })} /></Field>
        </div>
        {m.bodyFatPct !== undefined && <Field label="Messmethode Körperfett"><Chips value={m.bodyFatMethod ?? ''} options={[['Waage (BIA)', 'Waage'], ['Caliper', 'Caliper'], ['DEXA', 'DEXA'], ['Sonstige', 'Sonstige']]} onChange={(v) => setM({ ...m, bodyFatMethod: v })} /></Field>}
        <p class="xs faint" style={{ margin: 0 }}>Tipp: Gewicht morgens nach dem Aufstehen, Bauchumfang immer an derselben Stelle. Einzelwerte schwanken – entscheidend ist der Trend.</p>
        <button class="btn primary block xl" onClick={save}>Speichern</button>
        {existing && <button class="btn danger block" onClick={() => repo.deleteMeasurement(existing.id).then(() => { nav.pop(); toast('Gelöscht'); })}>Löschen</button>}
      </div>
    </SubPage>
  );
}

export function ManualSession() {
  const d = useStore(data);
  const [title, setTitle] = useState('Freies Training');
  const [when, setWhen] = useState(nowLocalInput());
  const [minutes, setMinutes] = useState(20);
  const [logs, setLogs] = useState<ExerciseLog[]>([]);
  const [pick, setPick] = useState(false);
  const [q, setQ] = useState('');
  const [rpe, setRpe] = useState<number | undefined>();
  const save = async () => {
    const s: Session = { id: uid(), date: new Date(when).toISOString(), durationSec: minutes * 60, kind: 'frei', title, minutesPlanned: minutes, location: 'zuhause', exercises: logs.map((l) => ({ ...l, path: undefined })), rpe, manual: true };
    await finishSession(s, equipmentFor(d.profile!, 'zuhause'));
    toast('Training gespeichert');
    nav.pop();
  };
  return (
    <SubPage title="Training nachtragen" right={<button class="btn plain" onClick={save}>Sichern</button>}>
      <div class="stack">
        <Field label="Bezeichnung"><input class="input" value={title} onInput={(e) => setTitle((e.target as HTMLInputElement).value)} /></Field>
        <div class="grid2">
          <Field label="Zeitpunkt"><input class="input" type="datetime-local" value={when} onInput={(e) => setWhen((e.target as HTMLInputElement).value)} /></Field>
          <Field label="Dauer"><Stepper value={minutes} step={5} min={5} max={240} suffix="min" onChange={setMinutes} /></Field>
        </div>
        {logs.map((l, i) => {
          const e = EXERCISE_MAP[l.exerciseId];
          return (
            <Card key={i} class="tight">
              <div class="row between"><div class="title-m">{e.name}</div><button class="btn plain small" onClick={() => setLogs(logs.filter((_, j) => j !== i))}>Entfernen</button></div>
              {l.sets.map((s, j) => (
                <div key={j} class="row mt">
                  <span class="small muted" style={{ width: 52 }}>Satz {j + 1}</span>
                  <div class="grow"><Stepper value={(e.mode === 'reps' ? s.reps : s.holdSec) ?? 0} step={e.mode === 'reps' ? 1 : 5} suffix={e.mode === 'reps' ? 'Wdh.' : 's'} onChange={(v) => setLogs(logs.map((x, k) => (k === i ? { ...x, sets: x.sets.map((y, m) => (m === j ? (e.mode === 'reps' ? { ...y, reps: v } : { ...y, holdSec: v }) : y)) } : x)))} /></div>
                </div>
              ))}
              <button class="btn plain small mt" onClick={() => setLogs(logs.map((x, k) => (k === i ? { ...x, sets: [...x.sets, { ...x.sets[x.sets.length - 1] }] } : x)))}>+ Satz</button>
            </Card>
          );
        })}
        {pick ? (
          <Card class="tight">
            <input class="input" placeholder="Übung suchen" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
            <div class="list mt" style={{ maxHeight: 280, overflowY: 'auto', boxShadow: 'none' }}>
              {EXERCISES.filter((e) => e.name.toLowerCase().includes(q.toLowerCase())).slice(0, 30).map((e) => (
                <button key={e.id} class="list-row" onClick={() => { setLogs([...logs, { exerciseId: e.id, sets: [{ target: e.range[0], ...(e.mode === 'reps' ? { reps: e.range[0] } : { holdSec: e.range[0] }) }] }]); setPick(false); setQ(''); }}>{e.name}</button>
              ))}
            </div>
          </Card>
        ) : <button class="btn tinted block" onClick={() => setPick(true)}>+ Übung hinzufügen</button>}
        <Field label="Anstrengung (RPE 1–10)"><Scale value={rpe} min={1} max={10} onChange={setRpe} /></Field>
        <button class="btn primary block xl" onClick={save}>Speichern</button>
        <p class="xs faint">Nachgetragene Einheiten fließen in Statistik und Historie ein, verändern aber die automatische Progression nicht.</p>
      </div>
    </SubPage>
  );
}
