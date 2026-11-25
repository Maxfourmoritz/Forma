import type { Meal, MealItem, Profile } from './types';
import { sum } from './util';

/**
 * Schätzung des Energiebedarfs (Mifflin-St Jeor) – nur ein Startwert.
 * Der tatsächliche Bedarf weicht individuell ab; maßgeblich ist der Gewichtstrend über Wochen.
 */
export function estimateTargets(p: Profile, weightKg: number, age: number) {
  // Mifflin-St-Jeor: +5 (männlich) bzw. −161 (weiblich); ohne Angabe wird der männliche Wert angenommen
  const bmr = 10 * weightKg + 6.25 * p.heightCm - 5 * age + (p.sex === 'weiblich' ? -161 : 5);
  const tdee = bmr * 1.5; // aktiv, ca. 5–6 Einheiten/Woche
  const kcal = Math.round((tdee - 450) / 50) * 50; // moderates Defizit für langsamen Fettabbau
  const protein = Math.round((weightKg * 1.6) / 5) * 5; // ~1,6 g/kg zur Muskelerhaltung im Defizit
  return { bmr: Math.round(bmr), tdee: Math.round(tdee), kcal, protein, carbsMax: 130 };
}

export function totals(items: MealItem[]) {
  return {
    kcal: Math.round(sum(items.map((i) => i.kcal))),
    protein: Math.round(sum(items.map((i) => i.protein))),
    carbs: Math.round(sum(items.map((i) => i.carbs))),
    fat: Math.round(sum(items.map((i) => i.fat))),
  };
}

export function dayTotals(meals: Meal[]) {
  return totals(meals.flatMap((m) => m.items));
}

/** Bild verkleinern und als Base64-JPEG liefern (spart Kosten/Bandbreite). */
export async function compressImage(file: Blob, maxSide = 1280, quality = 0.82): Promise<{ blob: Blob; base64: string }> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
  const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Bild konnte nicht verarbeitet werden'))), 'image/jpeg', quality));
  const base64 = await blobToBase64(blob);
  return { blob, base64 };
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export const MEAL_LABEL: Record<Meal['label'], string> = { fruehstueck: 'Frühstück', mittag: 'Mittag', abend: 'Abend', snack: 'Snack' };

export function guessMealLabel(d = new Date()): Meal['label'] {
  const h = d.getHours();
  if (h < 11) return 'fruehstueck';
  if (h < 15) return 'mittag';
  if (h < 17) return 'snack';
  return 'abend';
}
