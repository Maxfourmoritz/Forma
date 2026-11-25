import { data, useStore } from '../state';
import { buildReport } from '../domain/reports';
import { Card, SecTitle, SubPage, Tag } from '../ui/kit';

export function ReportScreen({ days }: { days: 7 | 30 }) {
  const d = useStore(data);
  const r = buildReport({ profile: d.profile!, sessions: d.sessions, activities: d.activities, measurements: d.measurements, checkins: d.checkins }, days);
  return (
    <SubPage title={r.title}>
      <div class="eyebrow">{r.period}</div>
      <h1 class="title-l display" style={{ margin: '4px 0 8px' }}>{r.title}</h1>
      <p class="muted" style={{ marginTop: 0 }}>{r.summary}</p>
      <div class="list">
        {r.facts.map((f) => <div key={f.label} class="list-row"><div class="grow">{f.label} <Tag kind={f.kind} /></div><span class="val num">{f.value}</span></div>)}
      </div>
      {r.insights.length > 0 && (<><SecTitle>Erkenntnisse</SecTitle><Card><ul class="bullets" style={{ color: 'var(--text)', margin: 0 }}>{r.insights.map((i) => <li key={i}>{i}</li>)}</ul></Card></>)}
      {r.recommendations.length > 0 && (<><SecTitle>Empfehlungen</SecTitle><Card class="tinted"><ul class="bullets" style={{ color: 'var(--text)', margin: 0 }}>{r.recommendations.map((i) => <li key={i}>{i}</li>)}</ul></Card></>)}
      <p class="xs faint mt">Der Bericht wird regelbasiert aus deinen Daten erzeugt – nachvollziehbar und ohne Datenübertragung.</p>
    </SubPage>
  );
}
