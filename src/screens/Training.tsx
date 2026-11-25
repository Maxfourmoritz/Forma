import { useMemo } from 'preact/hooks';
import { data, nav, useStore } from '../state';
import { EXERCISE_MAP, PATHS, PATH_IDS, EQUIPMENT_LABEL } from '../domain/exercises';
import { generatePlan, equipmentFor, type PlanMode } from '../domain/planner';
import { nextStep, resolve } from '../domain/progression';
import { phaseForWeek, programWeek, YEAR_PLAN } from '../domain/program';
import { profileSafetyNotes } from '../domain/safety';
import { pathHistory } from '../domain/analytics';
import type { Location } from '../domain/types';
import { fmtDuration } from '../domain/util';
import { Card, LevelDots, Row, SecTitle, SubPage } from '../ui/kit';
import { Figure } from '../ui/Figure';
import { Spark } from '../ui/charts';
import { planContext } from './common';

const MODES: { id: string; title: string; sub: string; mode: PlanMode; minutes: number; location: Location }[] = [
  { id: 'm5', title: '5 min', sub: 'Minimum', mode: 'kraft', minutes: 5, location: 'zuhause' },
  { id: 'm10', title: '10 min', sub: 'Quick', mode: 'kraft', minutes: 10, location: 'zuhause' },
  { id: 'm20', title: '20 min', sub: 'Standard', mode: 'kraft', minutes: 20, location: 'zuhause' },
  { id: 'm30', title: '30 min', sub: 'Intensiv', mode: 'kraft', minutes: 30, location: 'zuhause' },
  { id: 'm45', title: '45 min', sub: 'Extended', mode: 'kraft', minutes: 45, location: 'zuhause' },
  { id: 'hotel', title: 'Hotel', sub: 'leise, wenig Platz', mode: 'hotel', minutes: 20, location: 'hotel' },
  { id: 'out', title: 'Draußen', sub: 'Bank, Stufe, Park', mode: 'draussen', minutes: 20, location: 'draussen' },
  { id: 'mob', title: 'Mobility', sub: '& Recovery', mode: 'mobility', minutes: 15, location: 'zuhause' },
];

export function Training() {
  const d = useStore(data);
  const p = d.profile!;
  const week = programWeek(p);
  const phase = phaseForWeek(week);
  const eq = equipmentFor(p, 'zuhause');
  return (
    <div class="page">
      <header class="page-head">
        <div class="eyebrow">{phase.name} · Woche {week}{week <= 12 ? ' von 12' : ''}</div>
        <h1 class="title-xl display">Training</h1>
      </header>

      <div class="grid2" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {MODES.map((m) => (
          <button key={m.id} class="card tight" style={{ padding: '14px 8px', textAlign: 'center' }} onClick={() => nav.push({ name: 'preview', mode: m.mode, minutes: m.minutes, location: m.location })}>
            <div style={{ fontWeight: 700, fontSize: 17 }}>{m.title}</div>
            <div class="xs muted">{m.sub}</div>
          </button>
        ))}
      </div>

      <SecTitle action="Details" onAction={() => nav.push({ name: 'program' })}>Programm</SecTitle>
      <Card onClick={() => nav.push({ name: 'program' })}>
        <div class="row between">
          <div>
            <div class="title-m">{phase.name}</div>
            <div class="small muted">{phase.focus}</div>
          </div>
          <span class="pill num">{phase.sets} Sätze · RIR {phase.rir[0]}–{phase.rir[1]}</span>
        </div>
        <div class="row mt" style={{ gap: 3 }}>
          {Array.from({ length: 12 }, (_, i) => <div key={i} style={{ flex: 1, height: 6, borderRadius: 3, background: i < Math.min(week, 12) ? 'var(--accent)' : 'var(--fill)', opacity: phaseForWeek(i + 1).deload ? 0.55 : 1 }} />)}
        </div>
      </Card>

      <SecTitle action="Alle" onAction={() => nav.push({ name: 'paths' })}>Dein Niveau</SecTitle>
      <div class="list">
        {PATH_IDS.slice(0, 6).map((pid) => {
          const st = d.states[pid];
          const r = resolve(pid, st?.level ?? 0, eq);
          if (!r) return null;
          return <Row key={pid} title={PATHS[pid].name} sub={`${r.exercise.name} · Ziel ${st?.target ?? '–'} ${r.exercise.mode === 'reps' ? 'Wdh.' : 's'}`} right={<LevelDots level={r.level} total={PATHS[pid].levels.length} />} onClick={() => nav.push({ name: 'paths' })} />;
        })}
      </div>

      <SecTitle>Mehr</SecTitle>
      <div class="list">
        <Row title="Übungsbibliothek" sub="Alle Übungen mit Ausführung, Varianten, Sicherheit" icon="≡" onClick={() => nav.push({ name: 'library' })} />
        <Row title="Standortbestimmung" sub={d.assessments[0] ? `Zuletzt ${new Date(d.assessments[0].date).toLocaleDateString('de-DE')}` : 'Noch nicht durchgeführt'} icon="◎" iconBg="var(--c-mobility)" onClick={() => nav.push({ name: 'assessment' })} />
        <Row title="Training nachtragen" sub="Einheit außerhalb des Plans erfassen" icon="+" iconBg="var(--c-other)" onClick={() => nav.push({ name: 'manualSession' })} />
        <Row title="Aktivität erfassen" sub="Laufen, Rad, Peloton, Yoga …" icon="↗" iconBg="var(--c-cardio)" onClick={() => nav.push({ name: 'activity' })} />
      </div>
    </div>
  );
}

export function Preview({ mode, minutes, location }: { mode: PlanMode; minutes: number; location: Location }) {
  const d = useStore(data);
  const plan = useMemo(() => generatePlan(planContext(d), { minutes, mode, location }), [d, mode, minutes, location]);
  return (
    <SubPage title={plan.title}>
      <div class="eyebrow">{plan.subtitle}</div>
      <h1 class="title-l display" style={{ margin: '4px 0' }}>{plan.title}</h1>
      <div class="muted small">ca. {fmtDuration(plan.estimatedSec)}</div>
      {plan.kind === 'pause' ? (
        <Card class="danger mt">{plan.warnings.map((w) => <p key={w}>{w}</p>)}</Card>
      ) : (
        <>
          {plan.rationale.length > 0 && <ul class="bullets">{plan.rationale.map((r) => <li key={r}>{r}</li>)}</ul>}
          {plan.blocks.map((b) => (
            <div key={b.label}>
              <SecTitle>{b.label}{b.circuit && b.items.length > 1 ? <span class="small muted" style={{ fontWeight: 500 }}> · im Wechsel</span> : null}</SecTitle>
              <div class="list">
                {b.items.map((it) => {
                  const e = EXERCISE_MAP[it.exerciseId];
                  return (
                    <button key={it.exerciseId} class="list-row" onClick={() => nav.push({ name: 'exercise', id: e.id })}>
                      <div style={{ width: 64, flex: 'none' }} class="fig-box"><Figure anim={e.anim} playing={false} /></div>
                      <div class="grow"><div>{e.name}</div>{it.note && <div class="xs" style={{ color: 'var(--warn)' }}>{it.note}</div>}</div>
                      <span class="val num">{it.sets > 1 ? `${it.sets} × ` : ''}{it.target}{e.mode === 'reps' ? '' : ' s'}{e.unilateral ? '/S' : ''}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {plan.cardio && <p class="small muted mt">{plan.cardio}</p>}
          <button class="btn primary xl block mt-l" onClick={() => { nav.pop(); nav.startWorkout({ mode, minutes, location }); }}>Starten</button>
        </>
      )}
    </SubPage>
  );
}

export function Paths() {
  const d = useStore(data);
  const eq = equipmentFor(d.profile!, 'zuhause');
  return (
    <SubPage title="Progressionspfade">
      <p class="muted small">Jeder Pfad führt von einer gelenkschonenden Einstiegsvariante zu anspruchsvollen Übungen. Aufstieg erst, wenn die Obergrenze in mindestens drei Einheiten sauber und mit Reserve gelingt.</p>
      <div class="stack mt">
        {PATH_IDS.map((pid) => {
          const st = d.states[pid];
          const r = resolve(pid, st?.level ?? 0, eq);
          const nx = nextStep(pid, r?.level ?? 0, eq);
          const hist = pathHistory(d.sessions, pid).slice(-12);
          if (!r) return null;
          return (
            <Card key={pid}>
              <div class="row between">
                <div class="eyebrow">{PATHS[pid].name}</div>
                <LevelDots level={r.level} total={PATHS[pid].levels.length} />
              </div>
              <div class="row mt" style={{ gap: 14 }}>
                <div style={{ width: 90, flex: 'none' }} class="fig-box"><Figure anim={r.exercise.anim} playing={false} /></div>
                <div class="grow">
                  <div class="title-m">{r.exercise.name}</div>
                  <div class="small muted num">Stufe {r.level + 1} von {PATHS[pid].levels.length} · Ziel {st?.target ?? '–'} {r.exercise.mode === 'reps' ? 'Wdh.' : 's'}</div>
                  {hist.length > 1 && <div class="mt"><Spark values={hist.map((h) => h.value)} /></div>}
                </div>
              </div>
              {st?.lastNote && <p class="small muted" style={{ margin: '10px 0 0' }}>{st.lastNote}</p>}
              {nx && (
                <button class="list-row" style={{ padding: '12px 0 0' }} onClick={() => nav.push({ name: 'exercise', id: nx.exercise.id })}>
                  <div class="grow small"><span class="muted">Nächster Schritt: </span><strong>{nx.exercise.name}</strong>{nx.needs?.length ? <span class="muted"> · benötigt {nx.needs.map((q) => EQUIPMENT_LABEL[q]).join(', ')}</span> : null}</div>
                  <span class="chev">›</span>
                </button>
              )}
            </Card>
          );
        })}
      </div>
    </SubPage>
  );
}

export function Program() {
  const d = useStore(data);
  const week = programWeek(d.profile!);
  const notes = profileSafetyNotes(d.profile!);
  return (
    <SubPage title="Programm">
      <h1 class="title-l display" style={{ margin: '4px 2px' }}>Dein langfristiger Plan</h1>
      <p class="muted">Ziel: langfristig leistungsfähiger als heute – bis ins hohe Alter. Fortschritt entsteht durch Kontinuität und konservative, stetige Steigerung – nicht durch einzelne harte Einheiten.</p>
      <SecTitle>Die ersten 12 Wochen</SecTitle>
      <div class="list">
        {Array.from({ length: 12 }, (_, i) => phaseForWeek(i + 1)).map((ph, i) => (
          <div key={i} class="list-row" style={week === i + 1 ? { background: 'var(--accent-soft)' } : undefined}>
            <span class="num" style={{ width: 34, fontWeight: 700 }}>W{i + 1}</span>
            <div class="grow"><div>{ph.name}</div><div class="small muted">{ph.sets} Sätze · {ph.rir[0]}–{ph.rir[1]} Wdh. Reserve{ph.retest ? ' · Re-Test' : ''}</div></div>
          </div>
        ))}
      </div>
      <SecTitle>Wochenstruktur</SecTitle>
      <Card>
        <ul class="bullets" style={{ color: 'var(--text)' }}>
          <li><strong>3× Kraft</strong> (A/B im Wechsel), mindestens 48 h dazwischen</li>
          <li><strong>2–3× Mobilität & Balance</strong> an den Tagen dazwischen</li>
          <li><strong>Ausdauer 150 min/Woche</strong> im Grundlagenbereich (z. B. Peloton)</li>
          <li><strong>1 Ruhetag</strong> – nach 6 aktiven Tagen schlägt FORMA ihn automatisch vor</li>
        </ul>
        <p class="small muted">Verpasste Tage werden nicht nachgeholt – der Plan richtet sich danach, wann du zuletzt trainiert hast.</p>
      </Card>
      <SecTitle>12-Monats-Perspektive</SecTitle>
      <div class="list">{YEAR_PLAN.map((y) => <Row key={y.title} title={`${y.months} · ${y.title}`} sub={y.text} />)}</div>
      {notes.length > 0 && (<><SecTitle>Berücksichtigt</SecTitle><Card class="warn"><ul class="bullets" style={{ color: 'inherit' }}>{notes.map((n) => <li key={n}>{n}</li>)}</ul></Card></>)}
      <SecTitle>Grundlagen</SecTitle>
      <Card>
        <p class="small" style={{ marginTop: 0 }}>Die Trainingssteuerung folgt etablierten Prinzipien des Krafttrainings: progressive Belastungssteigerung, Steuerung über Wiederholungen in Reserve (RIR), ausreichend Erholung zwischen Einheiten derselben Muskelgruppe sowie die Kombination aus Kraft, Balance und Ausdauer, wie sie für ältere Erwachsene allgemein empfohlen wird (u. a. WHO-Bewegungsempfehlungen 2020: 150–300 min moderate Ausdauer pro Woche, Muskelkräftigung an mindestens 2 Tagen, für ältere Erwachsene zusätzlich Gleichgewichtstraining).</p>
        <p class="small muted" style={{ marginBottom: 0 }}>FORMA ersetzt keine ärztliche oder physiotherapeutische Beratung und stellt keine Diagnosen.</p>
      </Card>
    </SubPage>
  );
}
