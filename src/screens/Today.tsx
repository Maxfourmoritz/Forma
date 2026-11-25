import { useMemo } from 'preact/hooks';
import { data, nav, planPrefs, useStore } from '../state';
import { repo } from '../db/repo';
import { profileRules } from '../domain/conditions';
import { generatePlan, planSummary, readiness, cardioMinutesThisWeek, CARDIO_TYPES } from '../domain/planner';
import { EXERCISE_MAP } from '../domain/exercises';
import { STOP_RULES } from '../domain/safety';
import { series, trend, movingAvg } from '../domain/analytics';
import { dayTotals, estimateTargets } from '../domain/nutrition';
import { addDays, dayKey, daysBetween, fmtNum, weekStart, WEEKDAYS } from '../domain/util';
import { Card, Chips, SecTitle, Seg } from '../ui/kit';
import { Figure } from '../ui/Figure';
import { Ring } from '../ui/charts';
import { age, greeting, latestWeight, planContext } from './common';
import { loadActive } from './Player';
import { IconActivity, IconPencil, IconScale } from '../ui/icons';
import type { Location } from '../domain/types';

export function Today() {
  const d = useStore(data);
  const prefs = useStore(planPrefs);
  const profile = d.profile!;
  const minutes = prefs.minutes ?? profile.defaultMinutes;
  const today = new Date();
  const ctx = planContext(d, today);
  const plan = useMemo(() => generatePlan(ctx, { minutes, mode: prefs.mode, location: prefs.location }), [d, minutes, prefs.mode, prefs.location]);
  const checkin = ctx.checkin;
  const ready = readiness(checkin);
  const active = loadActive();
  const firstMain = plan.blocks.find((b) => b.kind === 'main' || b.kind === 'extra' || b.kind === 'mobility')?.items[0];
  const names = planSummary(plan);

  // Woche
  const ws = weekStart(today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const kinds = (day: Date) => {
    const k = dayKey(day);
    const ss = d.sessions.filter((s) => dayKey(s.date) === k);
    const as = d.activities.filter((a) => dayKey(a.date) === k);
    return {
      strength: ss.some((s) => s.kind.startsWith('kraft') || s.kind === 'minimum' || s.kind === 'frei'),
      mobility: ss.some((s) => s.kind === 'mobility' || s.kind === 'balance'),
      cardio: as.some((a) => CARDIO_TYPES.includes(a.type)),
      any: ss.length + as.length > 0,
    };
  };
  const activeThisWeek = days.filter((x) => kinds(x).any).length;
  const cardioMin = cardioMinutesThisWeek(d.activities, today);

  const w = series(d.measurements, 'weightKg');
  const wTrend = trend(w, 30, today);
  const wLast = w.length ? movingAvg(w)[w.length - 1].value : undefined;
  const waist = series(d.measurements, 'waistCm');

  const weight = latestWeight(d) ?? 90;
  const targets = estimateTargets(profile, weight, age(profile.birthYear));
  const kcalT = profile.nutrition.kcalTarget ?? targets.kcal;
  const protT = profile.nutrition.proteinTarget ?? targets.protein;
  const todayMeals = d.meals.filter((m) => dayKey(m.date) === dayKey(today));
  const nut = dayTotals(todayMeals);

  const backupDue = !d.settings.lastBackupAt || daysBetween(d.settings.lastBackupAt, today) >= d.settings.backupReminderDays;
  const hasData = d.sessions.length + d.activities.length > 2;

  return (
    <div class="page">
      <header class="page-head">
        <div class="eyebrow">{greeting(today)}</div>
        <h1 class="title-xl display">Heute</h1>
      </header>

      {active && (
        <Card class="tinted mb">
          <div class="row between">
            <div>
              <div class="title-m">Einheit läuft noch</div>
              <div class="small muted">{active.title} · {active.idx} von {active.steps.length} Schritten</div>
            </div>
            <button class="btn primary small" onClick={() => nav.startWorkout({ mode: 'auto', minutes: 0, location: 'zuhause', resume: true })}>Fortsetzen</button>
          </div>
        </Card>
      )}

      {!profile.sex && (
        <Card class="warn mb">
          <div class="title-m">Geschlecht ergänzen</div>
          <div class="small muted">Für eine genauere Kalorienschätzung. Bis dahin wird mit dem männlichen Wert gerechnet.</div>
          <div class="grid2 mt">
            <button class="btn secondary small" onClick={() => repo.saveProfile({ ...profile, sex: 'maennlich' })}>Männlich</button>
            <button class="btn secondary small" onClick={() => repo.saveProfile({ ...profile, sex: 'weiblich' })}>Weiblich</button>
          </div>
        </Card>
      )}

      {!checkin ? (
        <Card class="mb" onClick={() => nav.sheet({ name: 'checkin' })}>
          <div class="row between">
            <div>
              <div class="title-m">Wie geht es dir heute?</div>
              <div class="small muted">Schlaf, Energie, Beschwerden – 15 Sekunden. Der Plan passt sich an.</div>
            </div>
            <span class="chev" style={{ fontSize: 24, color: 'var(--text-3)' }}>›</span>
          </div>
        </Card>
      ) : (
        <button class="row mb small muted" style={{ padding: '0 4px' }} onClick={() => nav.sheet({ name: 'checkin' })}>
          <span class={`pill ${ready.level === 'gut' ? 'accent' : 'warn'}`}>Tagesform: {ready.level}</span>
          <span>{ready.reasons.length ? ready.reasons.join(' · ') : 'ausgeruht'} · ändern</span>
        </button>
      )}

      {plan.kind === 'pause' ? (
        <Card class={plan.safety.status === 'angepasst' ? 'warn' : 'danger'}>
          <div class="eyebrow" style={{ color: 'inherit' }}>Empfehlung</div>
          <h2 class="title-l display" style={{ margin: '4px 0 8px' }}>Heute pausieren</h2>
          {plan.warnings.map((m, i) => <p key={i} style={{ margin: '6px 0' }}>{m}</p>)}
          <details class="mt small">
            <summary class="muted">Wann sofort aufhören?</summary>
            <ul class="bullets">{STOP_RULES.map((r) => <li key={r}>{r}</li>)}</ul>
          </details>
        </Card>
      ) : (
        <Card class="hero">
          <div class="row between">
            <div class="eyebrow">{plan.subtitle}</div>
            <span class="pill num">{Math.max(1, Math.round(plan.estimatedSec / 60))} min</span>
          </div>
          <h2 class="title-l display" style={{ margin: '6px 0 0' }}>{plan.title}</h2>
          {firstMain && <div class="fig-box mt"><Figure anim={EXERCISE_MAP[firstMain.exerciseId].anim} label={EXERCISE_MAP[firstMain.exerciseId].name} muscles={EXERCISE_MAP[firstMain.exerciseId].muscles.primary} /></div>}
          <ul class="ex-list">
            {plan.blocks.filter((b) => b.kind === 'main' || b.kind === 'extra' || (plan.kind === 'mobility' && b.kind === 'mobility')).flatMap((b) => b.items).slice(0, 6).map((it) => {
              const e = EXERCISE_MAP[it.exerciseId];
              return <li key={it.exerciseId}><span>{e.name}</span><span class="num">{it.sets > 1 ? `${it.sets} × ` : ''}{it.target}{e.mode === 'reps' ? '' : ' s'}{e.unilateral ? ' /Seite' : ''}</span></li>;
            })}
          </ul>
          {names.length > 6 && <div class="small faint mt">+ {names.length - 6} weitere</div>}
          {plan.rationale.length > 0 && <ul class="bullets">{plan.rationale.map((r) => <li key={r}>{r}</li>)}</ul>}
          {plan.warnings.length > 0 && <ul class="bullets" style={{ color: 'var(--warn)' }}>{plan.warnings.map((r) => <li key={r}>{r}</li>)}</ul>}
          <button class="btn primary xl block mt-l" onClick={() => nav.startWorkout({ mode: prefs.mode, minutes, location: prefs.location })}>Training starten</button>
          <div class="mt">
            <Chips value={minutes} accent options={[[5, '5 min'], [10, '10'], [15, '15'], [20, '20'], [30, '30'], [45, '45']]} onChange={(v) => planPrefs.set((p) => ({ ...p, minutes: v }))} />
          </div>
          <div class="mt">
            <Seg<Location> value={prefs.location} options={[['zuhause', 'Zuhause'], ['hotel', 'Hotel'], ['draussen', 'Draußen']]} onChange={(v) => planPrefs.set((p) => ({ ...p, location: v }))} />
          </div>
          <div class="row mt" style={{ justifyContent: 'center', gap: 4 }}>
            {prefs.mode !== 'mobility' ? (
              <button class="btn plain small" onClick={() => planPrefs.set((p) => ({ ...p, mode: 'mobility' }))}>Lieber Mobilität & Regeneration</button>
            ) : (
              <button class="btn plain small" onClick={() => planPrefs.set((p) => ({ ...p, mode: 'auto' }))}>Zurück zum Vorschlag</button>
            )}
            {prefs.mode === 'auto' && plan.kind === 'mobility' && <button class="btn plain small" onClick={() => planPrefs.set((p) => ({ ...p, mode: 'kraft' }))}>Doch Kraft</button>}
          </div>
        </Card>
      )}
      {plan.cardio && plan.kind !== 'pause' && <p class="small muted" style={{ margin: '10px 4px 0' }}>{plan.cardio}</p>}

      <SecTitle>Diese Woche</SecTitle>
      <Card>
        <div class="week">
          {days.map((day, i) => {
            const k = kinds(day);
            const isToday = dayKey(day) === dayKey(today);
            return (
              <div key={i} class={`d ${isToday ? 'today' : ''}`}>
                <span>{WEEKDAYS[i]}</span>
                <div class={`ring ${k.any ? 'done' : ''}`}>{day.getDate()}</div>
                <div class="dots">
                  {k.strength && <i class="dot" style={{ background: 'var(--c-strength)' }} />}
                  {k.mobility && <i class="dot" style={{ background: 'var(--c-mobility)' }} />}
                  {k.cardio && <i class="dot" style={{ background: 'var(--c-cardio)' }} />}
                </div>
              </div>
            );
          })}
        </div>
        <div class="legend" style={{ justifyContent: 'center' }}>
          <span><i style={{ background: 'var(--c-strength)' }} />Kraft</span>
          <span><i style={{ background: 'var(--c-mobility)' }} />Mobilität</span>
          <span><i style={{ background: 'var(--c-cardio)' }} />Ausdauer</span>
        </div>
      </Card>

      <div class="grid2 mt">
        <Card class="tight metric" onClick={() => nav.tab('fortschritt')}>
          <div class="l">Gewicht · 7-T-Mittel</div>
          <div><span class="v num">{wLast !== undefined ? fmtNum(wLast) : '–'}</span><span class="u">kg</span></div>
          <div class={`d ${wTrend !== undefined && wTrend <= 0 ? 'up' : 'down'}`}>{wTrend !== undefined ? `${wTrend > 0 ? '+' : ''}${fmtNum(wTrend)} kg / 30 T` : 'Messung hinzufügen'}</div>
        </Card>
        <Card class="tight metric" onClick={() => nav.tab('fortschritt')}>
          <div class="l">Bauchumfang</div>
          <div><span class="v num">{waist.length ? fmtNum(waist[waist.length - 1].value, 0) : '–'}</span><span class="u">cm</span></div>
          <div class="d muted">{waist.length > 1 ? `${fmtNum(waist[waist.length - 1].value - waist[0].value, 1)} cm seit Start` : 'gemessen'}</div>
        </Card>
        <Card class="tight metric">
          <div class="row between">
            <div>
              <div class="l">Aktive Tage</div>
              <div><span class="v num">{activeThisWeek}</span><span class="u">/ {profile.daysPerWeek}</span></div>
            </div>
            <Ring value={activeThisWeek} max={profile.daysPerWeek} size={48} />
          </div>
        </Card>
        <Card class="tight metric" onClick={() => nav.push({ name: 'activity' })}>
          <div class="row between">
            <div>
              <div class="l">Ausdauer</div>
              <div><span class="v num">{cardioMin}</span><span class="u">/ 150 min</span></div>
            </div>
            <Ring value={cardioMin} max={150} size={48} color="var(--c-cardio)" />
          </div>
        </Card>
      </div>

      {profile.nutrition.enabled && !profileRules(profile).noCalories && (
        <>
          <SecTitle action="Alle" onAction={() => nav.push({ name: 'meals' })}>Ernährung heute</SecTitle>
          <Card>
            <div class="row between">
              <div class="metric">
                <div class="l">Energie <span class="tag geschaetzt" style={{ marginLeft: 4 }}>Geschätzt</span></div>
                <div><span class="v num">{nut.kcal}</span><span class="u">/ {kcalT} kcal</span></div>
              </div>
              <div class="metric" style={{ textAlign: 'right' }}>
                <div class="l">Eiweiß</div>
                <div><span class="v num">{nut.protein}</span><span class="u">/ {protT} g</span></div>
              </div>
            </div>
            <div class="bar-h mt"><div style={{ width: `${Math.min(100, (nut.protein / protT) * 100)}%` }} /></div>
            <button class="btn tinted block mt" onClick={() => nav.push({ name: 'meals' })}>Mahlzeit fotografieren</button>
          </Card>
        </>
      )}

      {d.coach.length > 0 && (
        <>
          <SecTitle>Coach</SecTitle>
          <div class="list">
            {d.coach.slice(0, 3).map((n, i) => (
              <div key={i} class="list-row">
                <span class="icon-dot" style={{ background: n.change === 'hoch' ? 'var(--accent)' : n.change === 'runter' ? 'var(--c-cardio)' : 'var(--c-other)' }}>{n.change === 'hoch' ? '↑' : n.change === 'runter' ? '↓' : n.change === 'ziel+' ? '+' : '·'}</span>
                <div class="grow small">{n.text}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {(plan.phase.retest || !d.assessments.length || (backupDue && hasData)) && <SecTitle>Hinweise</SecTitle>}
      <div class="stack">
        {!d.assessments.length && (
          <Card onClick={() => nav.push({ name: 'assessment' })}>
            <div class="title-m">Standortbestimmung</div>
            <div class="small muted">8 sichere Tests (ca. 20 min) – danach wählt FORMA die passenden Varianten für dich.</div>
          </Card>
        )}
        {plan.phase.retest && d.assessments.length > 0 && daysBetween(d.assessments[0].date, today) > 21 && (
          <Card onClick={() => nav.push({ name: 'assessment' })}>
            <div class="title-m">Re-Test fällig</div>
            <div class="small muted">Entlastungswoche – ideal, um deine Entwicklung objektiv zu messen.</div>
          </Card>
        )}
        {backupDue && hasData && (
          <Card onClick={() => nav.push({ name: 'settings', section: 'daten' })}>
            <div class="title-m">Backup sichern</div>
            <div class="small muted">{d.settings.lastBackupAt ? `Letztes Backup vor ${daysBetween(d.settings.lastBackupAt, today)} Tagen.` : 'Noch kein Backup.'} Ein Export in iCloud Drive schützt deine Historie.</div>
          </Card>
        )}
      </div>

      <SecTitle>Schnell erfassen</SecTitle>
      <div class="grid3">
        <button class="card qa" onClick={() => nav.push({ name: 'activity' })}><IconActivity />Aktivität</button>
        <button class="card qa" onClick={() => nav.push({ name: 'measurement' })}><IconScale />Messung</button>
        <button class="card qa" onClick={() => nav.push({ name: 'manualSession' })}><IconPencil />Training</button>
      </div>
    </div>
  );
}
