import { EXERCISES } from '../domain/exercises';
import { getAnim } from '../domain/poses';
import { Figure } from '../ui/Figure';

/** Versteckte Prüfseite (…/#figuren): alle Bewegungen als Standbilder (Start- und Endposition) mit Zielmuskulatur. */
export function FigureGallery() {
  const seen = new Map<string, (typeof EXERCISES)[number]>();
  for (const e of EXERCISES) if (!seen.has(e.anim)) seen.set(e.anim, e);
  return (
    <div class="page sub" style={{ maxWidth: 1100 }}>
      <h1 class="title-l">Figuren-Galerie</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 10 }}>
        {[...seen.entries()].map(([key, e]) => {
          const a = getAnim(key);
          const per = a.seg + (a.hold ?? 0);
          const n = a.pingpong && a.frames.length === 2 ? 2 : a.frames.length;
          return (
            <div key={key} class="card tight">
              <div class="xs muted">{e.name} · {e.muscles.primary.join(', ')}</div>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(n, 3)}, 1fr)`, gap: 4 }}>
                {Array.from({ length: Math.min(n, 3) }, (_, i) => (
                  <div key={i} class="fig-box"><Figure anim={key} at={i * per + (a.hold ?? 0) + 0.5} muscles={e.muscles.primary} /></div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
