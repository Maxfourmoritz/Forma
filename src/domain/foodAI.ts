/**
 * Essensfoto-Analyse über die Claude-API (direkt aus dem Browser mit dem eigenen API-Schlüssel).
 * Wird erst beim Aufruf nachgeladen, damit die App ohne diesen Code startet.
 * Hinweis: Das Foto wird dafür an Anthropic übertragen. Ergebnisse sind Schätzungen.
 */
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import type { MealItem } from './types';

const MealSchema = z.object({
  items: z.array(
    z.object({
      name: z.string().describe('Lebensmittel auf Deutsch, kurz'),
      grams: z.number().describe('geschätzte Menge in Gramm'),
      kcal: z.number(),
      protein: z.number().describe('Gramm'),
      carbs: z.number().describe('Gramm Kohlenhydrate'),
      fat: z.number().describe('Gramm'),
    }),
  ),
  confidence: z.enum(['niedrig', 'mittel', 'hoch']),
  note: z.string().describe('Ein bis zwei Sätze: Unsicherheiten (z. B. Öl, Soßen, versteckte Zutaten) und ein konkreter Hinweis zu Eiweiß/Kohlenhydraten.'),
});

export type MealEstimate = { items: MealItem[]; confidence: 'niedrig' | 'mittel' | 'hoch'; note: string };

const SYSTEM = `Du schätzt Nährwerte von Mahlzeiten anhand eines Fotos für eine persönliche Fitness-App (deutschsprachig, metrisch).
Vorgehen: Erkenne die einzelnen Komponenten, schätze Portionsgrößen anhand von Teller, Besteck und Verpackungen, und berechne Nährwerte mit üblichen Referenzwerten.
Sei realistisch statt optimistisch: Öl, Butter, Dressings und Soßen werden auf Fotos oft unterschätzt – berücksichtige sie explizit, wenn wahrscheinlich.
Wenn das Bild kein Essen zeigt, gib eine leere Liste mit confidence "niedrig" und erkläre das in note.
Der Nutzer verfolgt eine eiweißreiche, kohlenhydratreduzierte mediterrane Ernährung.`;

export async function analyzeMealPhoto(apiKey: string, base64Jpeg: string, hint?: string): Promise<MealEstimate> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2, timeout: 90_000 });
  const res = await client.beta.messages.parse({
    model: 'claude-opus-5-5',
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: betaZodOutputFormat(MealSchema) },
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64Jpeg } },
          { type: 'text', text: hint ? `Zusatzinfo vom Nutzer: ${hint}` : 'Bitte schätze die Nährwerte dieser Mahlzeit.' },
        ],
      },
    ],
  });
  if (res.stop_reason === 'refusal') throw new Error('Die Analyse wurde abgelehnt. Bitte manuell erfassen.');
  if (res.stop_reason === 'max_tokens') throw new Error('Antwort unvollständig – bitte erneut versuchen.');
  const out = res.parsed_output;
  if (!out) throw new Error('Antwort konnte nicht gelesen werden – bitte erneut versuchen.');
  return {
    items: out.items.map((i) => ({ name: i.name, grams: Math.round(i.grams), kcal: Math.round(i.kcal), protein: Math.round(i.protein), carbs: Math.round(i.carbs), fat: Math.round(i.fat) })),
    confidence: out.confidence,
    note: out.note,
  };
}

export function describeError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return 'API-Schlüssel ungültig. Bitte im Profil prüfen.';
  if (e instanceof Anthropic.PermissionDeniedError) return 'Keine Berechtigung für dieses Modell mit diesem Schlüssel.';
  if (e instanceof Anthropic.RateLimitError) return 'Zu viele Anfragen – bitte kurz warten.';
  if (e instanceof Anthropic.APIConnectionError) return 'Keine Verbindung. Die Foto-Analyse benötigt Internet.';
  if (e instanceof Anthropic.APIError) return `Fehler der API (${e.status ?? '–'}): ${e.message}`;
  return e instanceof Error ? e.message : String(e);
}
