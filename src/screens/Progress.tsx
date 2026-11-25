import { useMemo, useState } from 'preact/hooks';
import { data, nav, useStore } from '../state';
import { activeDays, assessmentSeries, inRange, movingAvg, pathHistory, pathProgressValue, personalRecords, RANGE_LABEL, rangeStart, series, setsPerMuscle, weekly, weeksStreak, type Range } from '../domain/analytics';
import { EXERCISE_MAP, MUSCLE_LABEL, PATHS, PATH_IDS } from '../domain/exercises';
import { addDays, dayKey, fmtDate, fmtNum, weekStart } from '../domain/util';
import { Card, LevelDots, Row, SecTitle, Seg, Tag } from '../ui/kit';
import { LineChart, Spark, StackedBars } from '../ui/charts';

export function Progress() {
  const d = useStore(data);
  const [range, setRange] = useState<Range>('90');
  const today = new Date();
  const first = [...d.sessions, ...d.activities, ...d.measurements].map((x) => x.date).sort()[0];
  const start = rangeStart(range, first, today);

  const w = series(d.measurements, 'weightKg');
  const wIn = inRange(w, start);
  const wMa = inRange(movingAvg(w), start);
  const waist = inRange(series(d.measurements, 'waistCm'), start);
  const bf = inRange(series(d.measurements, 'bodyFatPct'), start);
  const rhr = inRange(series(d.measurements, 'restingHR'), start);
  const sIn = inRange(d.sessions, start);
  const aIn = inRange(d.activities, start);

  const weeks = useMemo(() => weekly(d.sessions, d.activities, start, today), [d.sessions, d.activities, range]);
  const spm = setsPerMuscle(sIn.filter((s) => s.kind !== 'mobility'));
  const nWeeks = Math.max(1, (today.getTime() - start.getTime()) / (7 * 86_400_000));
  const muscleRows = Object.entries(spm).map(([m, v]) => [m, (v ?? 0) / nWeeks] as [string, number]).sort((a, b) => b[1] - a[1]);
  const prs = personalRecords(d.sessions).slice(0, 8);
  const days = activeDays(d.sessions, d.activities);
  const streak = weeksStreak(days, 3, today);
  const goal = d.profile!.goals;

  // Heatmap: 26 Wochen
  const heatStart = addDays(weekStart(today), -25 * 7);
  const heat = Array.from({ length: 26 * 7 }, (_, i) => addDays(heatStart, i));

  const as = [...d.assessments].reverse();
  const balSeries = assessmentSeries(as, (a) => Math.min(a.results.singleLegL, a.results.singleLegR));
  const plankSeries = assessmentSeries(as, (a) => a.results.plankSec);
  const chairSeries = assessmentSeries(as, (a) => a.results.chairStand30s);
  const shoulderSeries = assessmentSeries(as, (a) => (a.results.backScratchL !== undefined ? Math.min(a.results.backScratchL, a.results.backScratchR ?? 0) : undefined));

  return (
    <div class="page">
      <header class="page-head">
        <div class="eyebrow">Entwicklung</div>
        <h1 class="title-xl display">Fortschritt</h1>
      </header>
      <Seg<Range> value={range} options={(Object.keys(RANGE_LABEL) as Range[]).map((r) => [r, RANGE_LABEL[r]])} onChange={setRange} />

      <SecTitle action="+ Messung" onAction={() => nav.push({ name: 'measurement' })}>Körper</SecTitle>
      <Card>
        <div class="row between">
          <div class="metric">
            <div class="l">Gewicht · 7-Tage-Mittel <Tag kind="gemessen" /></div>
            <div><span class="v num">{wMa.length ? fmtNum(wMa[wMa.length - 1].value) : '–'}</span><span class="u">kg</span></div>
          </div>
          {wMa.length > 1 && <div class={`metric d num ${wMa[wMa.length - 1].value <= wMa[0].value ? 'up' : 'down'}`}>{fmtNum(wMa[wMa.length - 1].value - wMa[0].value)} kg</div>}
        </div>
        <LineChart raw={wIn} smooth={wMa} unit="kg" goal={goal.weightKg} start={start} end={today} />
        <p class="xs faint" style={{ margin: '4px 0 0' }}>Punkte: Einzelmessungen · Linie: gleitender 7-Tage-Mittelwert{goal.weightKg ? ' · gestrichelt: Ziel' : ''}</p>
      </Card>
      <div class="grid-auto mt">
        <Card>
          <div class="metric"><div class="l">Bauchumfang <Tag kind="gemessen" /></div><div><span class="v num">{waist.length ? fmtNum(waist[waist.length - 1].value, 1) : '–'}</span><span class="u">cm</span></div></div>
          <LineChart raw={waist} unit="cm" goal={goal.waistCm} start={start} end={today} color="var(--c-mobility)" />
          {d.profile!.heightCm && waist.length > 0 && <p class="xs faint" style={{ margin: 0 }}>Taille-Größe-Verhältnis: {fmtNum(waist[waist.length - 1].value / d.profile!.heightCm, 2)}</p>}
        </Card>
        {(bf.length > 0 || rhr.length > 0) && (
          <Card>
            {bf.length > 0 ? (
              <>
                <div class="metric"><div class="l">Körperfett <Tag kind="geschätzt" /></div><div><span class="v num">{fmtNum(bf[bf.length - 1].value)}</span><span class="u">%</span></div></div>
                <LineChart raw={bf} unit="%" start={start} end={today} color="var(--c-cardio)" />
                <p class="xs faint" style={{ margin: 0 }}>Waagen/Caliper schätzen – nur gleiche Methode vergleichen.</p>
              </>
            ) : (
              <>
                <div class="metric"><div class="l">Ruhepuls <Tag kind="gemessen" /></div><div><span class="v num">{rhr[rhr.length - 1].value}</span><span class="u">/min</span></div></div>
                <LineChart raw={rhr} unit="/min" start={start} end={today} digits={0} color="var(--c-cardio)" />
              </>
            )}
          </Card>
        )}
      </div>

      <SecTitle>Training</SecTitle>
      <div class="grid3">
        <Card class="tight metric"><div class="l">Einheiten</div><div class="v num">{sIn.length}</div><Tag kind="erfasst" /></Card>
        <Card class="tight metric"><div class="l">Aktive Tage</div><div class="v num">{[...days].filter((k) => k >= dayKey(start)).length}</div><Tag kind="erfasst" /></Card>
        <Card class="tight metric"><div class="l">Aktivitäten</div><div class="v num">{aIn.length}</div><Tag kind="erfasst" /></Card>
      </div>
      <Card class="mt">
        <div class="metric"><div class="l">Trainingsminuten pro Woche</div></div>
        <StackedBars rows={weeks.map((w) => ({ s: w.strength, m: w.mobility, c: w.cardio, o: w.other }))} labels={weeks.map((w) => w.label)} target={150}
          series={[{ key: 's', color: 'var(--c-strength)', label: 'Kraft' }, { key: 'm', color: 'var(--c-mobility)', label: 'Mobilität' }, { key: 'c', color: 'var(--c-cardio)', label: 'Ausdauer' }, { key: 'o', color: 'var(--c-other)', label: 'Sonstiges' }]} />
      </Card>
      <Card class="mt">
        <div class="metric"><div class="l">Wöchentliches Volumen · Arbeitssätze</div></div>
        <StackedBars rows={weeks.map((w) => ({ v: w.sets }))} labels={weeks.map((w) => w.label)} series={[{ key: 'v', color: 'var(--c-strength)', label: 'Sätze' }]} />
      </Card>
      <Card class="mt">
        <div class="metric"><div class="l">Sätze pro Muskelgruppe · Ø pro Woche</div></div>
        {muscleRows.length ? (
          <div class="stack mt" style={{ gap: 8 }}>
            {muscleRows.slice(0, 10).map(([m, v]) => (
              <div key={m}>
                <div class="row between small"><span>{MUSCLE_LABEL[m]}</span><span class="num muted">{fmtNum(v)}</span></div>
                <div class="bar-h"><div style={{ width: `${Math.min(100, (v / 12) * 100)}%` }} /></div>
              </div>
            ))}
            <p class="xs faint" style={{ margin: 0 }}>Primärmuskel = 1 Satz, Hilfsmuskel = ½. Für Muskelaufbau sind grob 6–12 Sätze pro Muskel und Woche ein üblicher Bereich – Anfänger profitieren auch von weniger.</p>
          </div>
        ) : <p class="muted small">Noch keine Krafteinheiten im Zeitraum.</p>}
      </Card>

      <SecTitle>Kraft nach Bewegungsmuster</SecTitle>
      <div class="list">
        {PATH_IDS.map((pid) => {
          const h = pathHistory(d.sessions, pid).filter((x) => dayKey(x.date) >= dayKey(start));
          const st = d.states[pid];
          const lastEx = h.length ? EXERCISE_MAP[h[h.length - 1].exerciseId] : undefined;
          return (
            <Row key={pid} title={PATHS[pid].name}
              sub={lastEx ? `${lastEx.name}: ${h[h.length - 1].value} ${lastEx.mode === 'reps' ? 'Wdh.' : 's'}` : 'keine Daten im Zeitraum'}
              right={<div class="row" style={{ gap: 10 }}>{h.length > 1 && <Spark values={h.map(pathProgressValue)} />}<LevelDots level={st?.level ?? 0} total={PATHS[pid].levels.length} /></div>} />
          );
        })}
      </div>
      <p class="xs faint" style={{ margin: '6px 4px 0' }}>Kurve: Stufe plus Fortschritt innerhalb des Wiederholungsbereichs – eine Ordnungsdarstellung, kein physikalischer Kraftwert.</p>

      <SecTitle>Persönliche Bestleistungen</SecTitle>
      {prs.length ? (
        <div class="list">{prs.map((p) => <Row key={p.exerciseId} title={EXERCISE_MAP[p.exerciseId].name} sub={fmtDate(p.date)} value={`${p.value} ${p.unit}`} />)}</div>
      ) : <Card><p class="muted small" style={{ margin: 0 }}>Erscheinen nach den ersten Einheiten.</p></Card>}

      <SecTitle action="Test" onAction={() => nav.push({ name: 'assessment' })}>Beweglichkeit & Balance</SecTitle>
      {as.length ? (
        <div class="grid-auto">
          <Card><div class="metric"><div class="l">Einbeinstand (schwächere Seite) <Tag kind="gemessen" /></div><div><span class="v num">{balSeries.length ? balSeries[balSeries.length - 1].value : '–'}</span><span class="u">s</span></div></div><LineChart raw={balSeries} digits={0} /></Card>
          <Card><div class="metric"><div class="l">30-s-Aufstehtest <Tag kind="gemessen" /></div><div><span class="v num">{chairSeries.length ? chairSeries[chairSeries.length - 1].value : '–'}</span><span class="u">×</span></div></div><LineChart raw={chairSeries} digits={0} /></Card>
          <Card><div class="metric"><div class="l">Unterarmstütz <Tag kind="gemessen" /></div><div><span class="v num">{plankSeries.length ? plankSeries[plankSeries.length - 1].value : '–'}</span><span class="u">s</span></div></div><LineChart raw={plankSeries} digits={0} /></Card>
          <Card><div class="metric"><div class="l">Schulter (Back-Scratch) <Tag kind="gemessen" /></div><div><span class="v num">{shoulderSeries.length ? shoulderSeries[shoulderSeries.length - 1].value : '–'}</span><span class="u">cm</span></div></div><LineChart raw={shoulderSeries} digits={0} /></Card>
        </div>
      ) : <Card onClick={() => nav.push({ name: 'assessment' })}><p class="muted small" style={{ margin: 0 }}>Nach der Standortbestimmung siehst du hier objektiv gemessene Werte im Verlauf.</p></Card>}

      <SecTitle>Kontinuität</SecTitle>
      <Card>
        <div class="row between mb">
          <div class="metric"><div class="l">Wochen in Folge mit ≥3 aktiven Tagen</div><div class="v num">{streak}</div></div>
        </div>
        <div class="heat" aria-label="Aktive Tage der letzten 26 Wochen">
          {heat.map((day) => {
            const k = dayKey(day);
            const cnt = d.sessions.filter((s) => dayKey(s.date) === k).length + d.activities.filter((a) => dayKey(a.date) === k).length;
            return <div key={k} title={k} class={day > today ? '' : cnt >= 2 ? 'l2' : cnt === 1 ? 'l1' : ''} style={day > today ? { opacity: 0.3 } : undefined} />;
          })}
        </div>
        <p class="xs faint" style={{ margin: '8px 0 0' }}>26 Wochen · Spalten = Wochen, Zeilen = Mo–So</p>
      </Card>

      {(goal.weightKg || goal.waistCm || goal.pushups) && (
        <>
          <SecTitle action="Bearbeiten" onAction={() => nav.push({ name: 'settings', section: 'ziele' })}>Ziele</SecTitle>
          <div class="list">
            {goal.weightKg && <GoalRow label="Gewicht" unit="kg" start={d.profile!.startWeightKg} cur={wMa.length ? wMa[wMa.length - 1].value : undefined} target={goal.weightKg} />}
            {goal.waistCm && <GoalRow label="Bauchumfang" unit="cm" start={d.profile!.startWaistCm} cur={waist.length ? waist[waist.length - 1].value : undefined} target={goal.waistCm} />}
            {goal.pushups && <GoalRow label="Liegestütze am Stück" unit="" start={0} cur={personalRecords(d.sessions).find((p) => p.exerciseId === 'pushup')?.value} target={goal.pushups} />}
          </div>
        </>
      )}

      <SecTitle>Berichte & Fotos</SecTitle>
      <div class="list">
        <Row title="Wochenbericht" sub="Bewertung, Erkenntnisse, Empfehlungen" icon="7" onClick={() => nav.push({ name: 'report', days: 7 })} />
        <Row title="Monatsbericht" sub="Die letzten 30 Tage" icon="30" iconBg="var(--c-mobility)" onClick={() => nav.push({ name: 'report', days: 30 })} />
        <Row title="Fortschrittsfotos" sub="Privat, nur auf diesem Gerät" icon="◐" iconBg="var(--c-other)" onClick={() => nav.push({ name: 'photos' })} />
      </div>
    </div>
  );
}

function GoalRow({ label, unit, start, cur, target }: { label: string; unit: string; start?: number; cur?: number; target: number }) {
  const pct = start !== undefined && cur !== undefined && start !== target ? Math.max(0, Math.min(1, (cur - start) / (target - start))) : 0;
  return (
    <div class="list-row">
      <div class="grow">
        <div class="row between"><span>{label}</span><span class="small muted num">{cur !== undefined ? fmtNum(cur, unit ? 1 : 0) : '–'} → {target} {unit}</span></div>
        <div class="bar-h mt"><div style={{ width: `${pct * 100}%` }} /></div>
      </div>
    </div>
  );
}
