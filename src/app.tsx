import { useEffect, useState } from 'preact/hooks';
import { data, loadAll, nav, navStore, toastStore, useStore, type Screen, type Tab } from './state';
import { Today } from './screens/Today';
import { Training, Preview, Paths, Program } from './screens/Training';
import { Progress } from './screens/Progress';
import { History, SessionDetail, ActivityForm, MeasurementForm, ManualSession } from './screens/History';
import { ProfileTab, SettingsScreen } from './screens/Profile';
import { Library, ExerciseDetail } from './screens/Library';
import { AssessmentScreen } from './screens/Assessment';
import { Player } from './screens/Player';
import { CheckInSheet, QuickAddSheet } from './screens/CheckIn';
import { Onboarding } from './screens/Onboarding';
import { Meals } from './screens/Meals';
import { Photos } from './screens/Photos';
import { ReportScreen } from './screens/Report';
import { IconHistory, IconProfile, IconProgress, IconToday, IconTraining } from './ui/icons';
import { Spinner } from './ui/kit';
import { FigureGallery } from './screens/FigureGallery';
import { onUpdate, applyUpdate } from './sw-register';
import { loadActive } from './screens/Player';

const TABS: [Tab, string, () => preact.JSX.Element][] = [
  ['heute', 'Heute', IconToday],
  ['training', 'Training', IconTraining],
  ['fortschritt', 'Fortschritt', IconProgress],
  ['historie', 'Historie', IconHistory],
  ['profil', 'Profil', IconProfile],
];

function renderScreen(s: Screen) {
  switch (s.name) {
    case 'library': return <Library />;
    case 'exercise': return <ExerciseDetail id={s.id} />;
    case 'assessment': return <AssessmentScreen />;
    case 'preview': return <Preview mode={s.mode} minutes={s.minutes} location={s.location} />;
    case 'session': return <SessionDetail id={s.id} />;
    case 'activity': return <ActivityForm id={s.id} />;
    case 'measurement': return <MeasurementForm id={s.id} />;
    case 'manualSession': return <ManualSession />;
    case 'meals': return <Meals date={s.date} />;
    case 'photos': return <Photos />;
    case 'report': return <ReportScreen days={s.days} />;
    case 'paths': return <Paths />;
    case 'program': return <Program />;
    case 'settings': return <SettingsScreen section={s.section} />;
  }
}

export function App() {
  if (location.hash === '#figuren') return <FigureGallery />;
  const d = useStore(data);
  const n = useStore(navStore);
  const t = useStore(toastStore);
  const [err, setErr] = useState<string | null>(null);
  const [update, setUpdate] = useState(false);

  useEffect(() => { loadAll().catch((e) => setErr(String(e?.message ?? e))); onUpdate(() => {
      // Kurz nach dem Start (nichts in Arbeit) direkt aktualisieren, sonst Hinweis zeigen
      const idle = performance.now() < 12000 && !navStore.get().player && !loadActive();
      if (idle) applyUpdate(); else setUpdate(true);
    }); }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [n.tab]);

  if (err) return <div class="page"><div class="card danger"><div class="title-m">Speicher nicht verfügbar</div><p>{err}</p><p class="small">Im privaten Modus von Safari steht kein dauerhafter Speicher zur Verfügung. Bitte FORMA im normalen Modus bzw. vom Home-Bildschirm öffnen.</p></div></div>;
  if (!d.loaded) return <div style={{ display: 'grid', placeItems: 'center', height: '100dvh' }}><Spinner /></div>;
  if (!d.profile) return (
    <>
      <Onboarding onDone={() => nav.tab('heute')} />
      {update && <div class="toast" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>Neue Version verfügbar<button class="btn small primary" onClick={applyUpdate}>Aktualisieren</button></div>}
    </>
  );

  const top = n.stack[n.stack.length - 1];
  return (
    <div class="app">
      <svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="gArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--accent);stop-opacity:0.34" /><stop offset="1" style="stop-color:var(--accent);stop-opacity:0" /></linearGradient>
          <linearGradient id="gRing" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--accent)" /><stop offset="1" style="stop-color:var(--accent-2)" /></linearGradient>
          <linearGradient id="gLine" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="340" y2="0"><stop offset="0" style="stop-color:var(--accent)" /><stop offset="1" style="stop-color:var(--accent-2)" /></linearGradient>
        </defs>
      </svg>
      <main aria-hidden={!!top || !!n.player}>
        {n.tab === 'heute' && <Today />}
        {n.tab === 'training' && <Training />}
        {n.tab === 'fortschritt' && <Progress />}
        {n.tab === 'historie' && <History />}
        {n.tab === 'profil' && <ProfileTab />}
      </main>
      {top && <div key={n.stack.length}>{renderScreen(top)}</div>}
      <nav class="tabbar" aria-label="Hauptnavigation">
        <div class="tabbar-inner">
          {TABS.map(([id, label, Icon]) => (
            <button key={id} class={`tab ${n.tab === id && !top ? 'on' : ''}`} aria-current={n.tab === id} onClick={() => nav.tab(id)}>
              <Icon />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </nav>
      {n.player && <Player />}
      {n.sheet?.name === 'checkin' && <CheckInSheet />}
      {n.sheet?.name === 'quickAdd' && <QuickAddSheet />}
      {update && !n.player && (
        <div class="toast" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          Neue Version verfügbar
          <button class="btn small primary" onClick={applyUpdate}>Aktualisieren</button>
        </div>
      )}
      {t && <div class="toast" role="status">{t}</div>}
    </div>
  );
}
