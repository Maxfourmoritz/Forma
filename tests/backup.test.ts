import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { repo, finishSession } from '../src/db/repo';
import { createBackup, restoreBackup, validateBackup, sessionsCSV } from '../src/db/backup';
import { getAll } from '../src/db/db';
import { defaultStates } from '../src/domain/assessment';
import { profile, session } from './fixtures';

describe('Speicherung, Backup und Wiederherstellung', () => {
  it('Roundtrip erhält alle Daten', async () => {
    await repo.saveProfile(profile());
    await repo.saveStates(defaultStates());
    await repo.saveApiKey('sk-test');
    const s = { ...session('2026-11-20T07:00:00'), exercises: [{ exerciseId: 'box_squat', path: 'squat' as const, level: 1, sets: [{ reps: 12, target: 10 }, { reps: 12, target: 10 }], rir: 3, form: 'sauber' as const }] };
    const notes = await finishSession(s, ['matte', 'stuhl']);
    expect(notes[0].text).toMatch(/Box-Kniebeuge/);
    expect((await repo.states()).squat!.target).toBe(defaultStates().squat!.target + 1);
    await repo.saveActivity({ id: 'a1', date: '2026-11-21T18:00:00', type: 'peloton', durationMin: 30 });
    await repo.saveMeasurement({ id: 'm1', date: '2026-11-21T07:00:00', weightKg: 82, waistCm: 90 });
    await repo.saveCheckin({ date: '2026-11-21', sleepQuality: 4, energy: 4, soreness: 1, pains: [], warnings: [] });

    const backup = JSON.parse(JSON.stringify(await createBackup(true)));
    const v = validateBackup(backup);
    expect(v.ok).toBe(true);
    expect(JSON.stringify(backup)).not.toContain('sk-test'); // API-Schlüssel nie im Backup

    // Daten "verlieren"
    await repo.deleteSession(s.id);
    await repo.deleteActivity('a1');
    expect((await repo.sessions()).length).toBe(0);

    await restoreBackup(backup);
    expect((await repo.sessions()).length).toBe(1);
    expect((await repo.activities()).length).toBe(1);
    expect((await repo.measurements())[0].waistCm).toBe(90);
    expect((await repo.profile())!.heightCm).toBe(176);
    expect((await repo.states()).squat).toBeDefined();
    expect(await repo.apiKey()).toBe('sk-test'); // Schlüssel bleibt lokal erhalten
    expect((await getAll('snapshots')).length).toBeGreaterThan(0); // Sicherung vor Wiederherstellung
    expect(sessionsCSV(await repo.sessions())).toContain('Box-Kniebeuge');
  });

  it('ungültige Dateien werden abgelehnt', () => {
    expect(validateBackup({ foo: 1 }).ok).toBe(false);
    expect(validateBackup({ format: 'forma-backup', version: 99, data: {} }).ok).toBe(false);
    expect(validateBackup({ format: 'forma-backup', version: 1, data: { sessions: [{ id: 'x', date: 'd' }] } }).ok).toBe(false);
  });
});
