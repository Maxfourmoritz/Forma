import { useMemo, useState } from 'preact/hooks';
import { EQUIPMENT_LABEL, EXERCISE_MAP, EXERCISES, GOAL_LABEL, JOINT_LABEL, MUSCLE_LABEL, PATHS, PATTERN_LABEL } from '../domain/exercises';
import type { Equipment, Exercise, Goal, Joint, Muscle, PathId, Pattern } from '../domain/types';
import { data, nav, useStore } from '../state';
import { Figure } from '../ui/Figure';
import { Chips, LevelDots, SubPage } from '../ui/kit';

const DIFF = ['', 'Einsteiger', 'Leicht', 'Mittel', 'Fortgeschritten', 'Anspruchsvoll'];

export function pathOf(e: Exercise): { path: PathId; level: number } | null {
  for (const [p, def] of Object.entries(PATHS) as [PathId, (typeof PATHS)[PathId]][]) {
    const l = def.levels.findIndex((ids) => ids[0] === e.id) ;
    if (l >= 0) return { path: p, level: l };
  }
  for (const [p, def] of Object.entries(PATHS) as [PathId, (typeof PATHS)[PathId]][]) {
    const l = def.levels.findIndex((ids) => ids.includes(e.id));
    if (l >= 0) return { path: p, level: l };
  }
  return null;
}

export function ExerciseInfo({ e, compact }: { e: Exercise; compact?: boolean }) {
  const po = pathOf(e);
  const easier = po && po.level > 0 ? EXERCISE_MAP[PATHS[po.path].levels[po.level - 1][0]] : undefined;
  const harder = po && po.level < PATHS[po.path].levels.length - 1 ? EXERCISE_MAP[PATHS[po.path].levels[po.level + 1][0]] : undefined;
  const joints = Object.entries(e.joints) as [Joint, number][];
  return (
    <div class="stack">
      {!compact && <div class="fig-box"><Figure anim={e.anim} label={e.name} muscles={e.muscles.primary} /><div class="muscle-legend"><span class="pill muscle-pill">● Zielmuskulatur: {e.muscles.primary.map((m) => MUSCLE_LABEL[m]).join(', ')}</span></div></div>}
      {compact && <div class="fig-box" style={{ maxWidth: 320, margin: '0 auto', width: '100%' }}><Figure anim={e.anim} label={e.name} muscles={e.muscles.primary} /></div>}
      <div class="row wrap gap-s">
        <span class="pill">{PATTERN_LABEL[e.pattern]}</span>
        <span class="pill">{DIFF[e.difficulty]}</span>
        <span class="pill num">{e.range[0]}–{e.range[1]} {e.mode === 'reps' ? 'Wdh.' : 's'}{e.unilateral ? ' /Seite' : ''}</span>
        <span class="pill num">Pause ~{e.rest} s</span>
      </div>
      <div class="card">
        <div class="label">Ausführung</div>
        <ol style={{ margin: '8px 0 0', paddingLeft: 20 }}>{e.steps.map((s) => <li key={s} style={{ margin: '4px 0' }}>{s}</li>)}</ol>
        <div class="divider" />
        <div class="label">Atmung</div>
        <p style={{ margin: '6px 0 0' }}>{e.breathing}</p>
      </div>
      <div class="card">
        <div class="label">Zielmuskulatur</div>
        <p style={{ margin: '6px 0 0' }}><strong>{e.muscles.primary.map((m) => MUSCLE_LABEL[m]).join(', ')}</strong>{e.muscles.secondary.length ? <span class="muted"> · {e.muscles.secondary.map((m) => MUSCLE_LABEL[m]).join(', ')}</span> : null}</p>
        <div class="divider" />
        <div class="label">Typische Fehler</div>
        <ul class="bullets">{e.mistakes.map((m) => <li key={m}>{m}</li>)}</ul>
        {e.safety.length > 0 && (<><div class="divider" /><div class="label" style={{ color: 'var(--warn)' }}>Sicherheit</div><ul class="bullets">{e.safety.map((m) => <li key={m}>{m}</li>)}</ul></>)}
        {(e.kneeCaution || e.bpCaution || e.fallRisk) && (
          <div class="row wrap gap-s mt">
            {e.kneeCaution && <span class="pill warn">Nur bei beschwerdefreien Knien</span>}
            {e.bpCaution && <span class="pill warn">Kopf-unten – nach kardiologischer Freigabe</span>}
            {e.fallRisk && <span class="pill warn">Halt in Griffweite</span>}
          </div>
        )}
      </div>
      <div class="card">
        <div class="grid2 small">
          <div><div class="label">Equipment</div>{e.equipment.length ? e.equipment.map((q) => EQUIPMENT_LABEL[q]).join(', ') : 'Keins'}</div>
          <div><div class="label">Platzbedarf</div>{e.space}</div>
          <div><div class="label">Gelenkbelastung</div>{joints.length ? joints.map(([j, v]) => `${JOINT_LABEL[j]} ${'●'.repeat(v)}`).join(' · ') : 'gering'}</div>
          <div><div class="label">Voraussetzung</div>{e.prerequisites ?? '–'}</div>
        </div>
      </div>
      {po && (
        <div class="card">
          <div class="row between"><div class="label">Progressionspfad · {PATHS[po.path].name}</div><LevelDots level={po.level} total={PATHS[po.path].levels.length} /></div>
          {easier && <button class="list-row" style={{ padding: '10px 0' }} onClick={() => nav.push({ name: 'exercise', id: easier.id })}><span class="small muted" style={{ width: 70 }}>Leichter</span><span class="grow">{easier.name}</span><span class="chev">›</span></button>}
          {harder && <button class="list-row" style={{ padding: '10px 0' }} onClick={() => nav.push({ name: 'exercise', id: harder.id })}><span class="small muted" style={{ width: 70 }}>Schwerer</span><span class="grow">{harder.name}</span><span class="chev">›</span></button>}
        </div>
      )}
    </div>
  );
}

export function ExerciseDetail({ id }: { id: string }) {
  const e = EXERCISE_MAP[id];
  return <SubPage title={e.name}><h1 class="title-l display" style={{ margin: '4px 2px 14px' }}>{e.name}</h1><ExerciseInfo e={e} /></SubPage>;
}

type FilterKey = 'muskel' | 'level' | 'muster' | 'ziel' | 'equipment' | 'gelenk' | 'platz';

export function Library() {
  const d = useStore(data);
  const [q, setQ] = useState('');
  const [fk, setFk] = useState<FilterKey>('muster');
  const [f, setF] = useState<{ muskel?: Muscle; level?: number; muster?: Pattern; ziel?: Goal; equipment?: 'meins' | Equipment; gelenk?: Joint; platz?: Exercise['space'] }>({});
  const mine = [...new Set([...(d.profile?.equipmentHome ?? []), 'wand', 'stuhl', 'handtuch', 'tuer', 'bank', 'matte'])];

  const list = useMemo(() => EXERCISES.filter((e) => {
    if (q && !e.name.toLowerCase().includes(q.toLowerCase())) return false;
    if (f.muskel && !e.muscles.primary.includes(f.muskel) && !e.muscles.secondary.includes(f.muskel)) return false;
    if (f.level && e.difficulty !== f.level) return false;
    if (f.muster && e.pattern !== f.muster) return false;
    if (f.ziel && !e.goals.includes(f.ziel)) return false;
    if (f.equipment === 'meins' && !e.equipment.every((x) => mine.includes(x))) return false;
    if (f.equipment && f.equipment !== 'meins' && !e.equipment.includes(f.equipment)) return false;
    if (f.gelenk && (e.joints[f.gelenk] ?? 0) >= 2) return false;
    if (f.platz && e.space !== f.platz) return false;
    return true;
  }), [q, f]);

  const opts: Record<FilterKey, [string, string][]> = {
    muster: Object.entries(PATTERN_LABEL),
    muskel: Object.entries(MUSCLE_LABEL),
    level: [['1', 'Einsteiger'], ['2', 'Leicht'], ['3', 'Mittel'], ['4', 'Fortgeschritten'], ['5', 'Anspruchsvoll']],
    ziel: Object.entries(GOAL_LABEL),
    equipment: [['meins', 'Mein Equipment'], ...Object.entries(EQUIPMENT_LABEL)],
    gelenk: Object.entries(JOINT_LABEL).map(([k, v]) => [k, `schont ${v}`]),
    platz: [['klein', 'Wenig Platz'], ['mittel', 'Mittel'], ['gross', 'Viel Platz']],
  };
  const keyMap: Record<FilterKey, keyof typeof f> = { muster: 'muster', muskel: 'muskel', level: 'level', ziel: 'ziel', equipment: 'equipment', gelenk: 'gelenk', platz: 'platz' };
  const cur = f[keyMap[fk]];
  const active = Object.values(f).filter(Boolean).length;

  return (
    <SubPage title="Übungsbibliothek">
      <input class="input" type="search" placeholder={`${EXERCISES.length} Übungen durchsuchen`} value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      <div class="mt"><Chips value={fk} options={[['muster', 'Bewegung'], ['muskel', 'Muskel'], ['level', 'Niveau'], ['ziel', 'Ziel'], ['equipment', 'Equipment'], ['gelenk', 'Gelenk'], ['platz', 'Platz']]} onChange={setFk} /></div>
      <div class="mt"><Chips accent value={cur !== undefined ? String(cur) : ''} options={opts[fk]} onChange={(v) => setF((x) => ({ ...x, [keyMap[fk]]: String(x[keyMap[fk]]) === v ? undefined : fk === 'level' ? Number(v) : v }))} /></div>
      {active > 0 && <button class="btn plain small mt" onClick={() => setF({})}>Filter zurücksetzen ({active})</button>}
      <div class="list mt">
        {list.map((e) => {
          const po = pathOf(e);
          return (
            <button key={e.id} class="list-row" onClick={() => nav.push({ name: 'exercise', id: e.id })}>
              <div style={{ width: 64, flex: 'none' }} class="fig-box"><Figure anim={e.anim} playing={false} /></div>
              <div class="grow">
                <div>{e.name}</div>
                <div class="small muted">{PATTERN_LABEL[e.pattern]} · {DIFF[e.difficulty]}{po ? ` · Stufe ${po.level + 1}` : ''}</div>
              </div>
              <span class="chev">›</span>
            </button>
          );
        })}
        {!list.length && <div class="list-row muted">Keine Übung passt zu den Filtern.</div>}
      </div>
    </SubPage>
  );
}
