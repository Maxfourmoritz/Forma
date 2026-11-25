import type { Sex } from './types';

/** Allgemeines Screening, sinngemäß angelehnt an etablierte Fragebögen (z. B. PAR-Q+). */
export const SCREENING: { id: string; q: string }[] = [
  { id: 'herz', q: 'Wurde bei dir eine Herzerkrankung oder Bluthochdruck diagnostiziert?' },
  { id: 'brust', q: 'Hast du Brustschmerzen in Ruhe, im Alltag oder bei Belastung?' },
  { id: 'schwindel', q: 'Hattest du in den letzten 12 Monaten Gleichgewichtsverlust durch Schwindel oder Bewusstlosigkeit?' },
  { id: 'chronisch', q: 'Hast du eine andere chronische Erkrankung (z. B. Diabetes, Lunge, Nerven)?' },
  { id: 'medis', q: 'Nimmst du verschreibungspflichtige Medikamente gegen eine chronische Erkrankung?' },
  { id: 'gelenk', q: 'Hast du Knochen-, Gelenk- oder Weichteilprobleme, die sich durch Training verschlechtern könnten?' },
  { id: 'aufsicht', q: 'Hat dir ein Arzt geraten, nur unter medizinischer Aufsicht zu trainieren?' },
];

/** Zusätzliche Frage bei weiblichem Geschlecht (angelehnt an PAR-Q+). */
export function screeningFor(sex?: Sex) {
  return sex === 'weiblich' ? [...SCREENING, { id: 'schwanger', q: 'Bist du schwanger oder hast du vor Kurzem entbunden?' }] : SCREENING;
}
