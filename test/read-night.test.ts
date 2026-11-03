import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read-night.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

async function createRunsDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'rig-runs-'));
  temporaryDirectories.push(directory);
  return directory;
}

describe('readNight', () => {
  it('reads the committed night fixture into one row per job', async () => {
    const runsDir = fileURLToPath(new URL('../runs/', import.meta.url));
    const result = await readNight(runsDir, '2026-10-28');

    expect(result.badLines).toBe(1);
    expect(result.rows).toHaveLength(5);
    expect(result.rows.map(({ job }) => job)).toEqual([
      'rig/rotate-logs',
      'lane/sync',
      'fixtures/refresh',
      'notes/backup',
      'digest/render',
    ]);
    expect(result.rows.find(({ job }) => job === 'fixtures/refresh')).toMatchObject({
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
    expect(result.rows.find(({ job }) => job === 'digest/render')?.owner).toBeNull();
    expect(result.rows.find(({ job }) => job === 'lane/sync')).toMatchObject({
      runs: 8,
      retries: 1,
      lastError: 'lock held',
      firstAt: '2026-10-28T23:00:06+01:00',
      lastAt: '2026-10-29T05:00:04+01:00',
    });
  });

  it('counts records, preserves timestamp offsets, and retains the latest observed error', async () => {
    const runsDir = await createRunsDirectory();
    const log = [
      { at: '2026-11-01T23:30:00-04:00', job: 'job/a', status: 'retry', owner: 'alice', error: 'first' },
      { at: '2026-11-02T02:35:00+01:00', job: 'job/a', status: 'ok', owner: null },
      { at: '2026-11-02T03:00:00+01:00', job: 'job/a', status: 'fail', owner: null, error: 'latest' },
    ].map((record) => JSON.stringify(record)).join('\n');
    await writeFile(join(runsDir, 'test-night.jsonl'), `${log}\n`);

    const result = await readNight(runsDir, 'test-night');

    expect(result).toEqual({
      badLines: 0,
      rows: [{
        job: 'job/a',
        owner: null,
        runs: 3,
        retries: 1,
        lastStatus: 'fail',
        lastError: 'latest',
        firstAt: '2026-11-01T23:30:00-04:00',
        lastAt: '2026-11-02T03:00:00+01:00',
      }],
    });
  });

  it('counts malformed and invalid records without throwing', async () => {
    const runsDir = await createRunsDirectory();
    await writeFile(join(runsDir, 'test-night.jsonl'), [
      '{not json',
      JSON.stringify({ at: '2026-11-02T03:00:00+01:00', job: 'job/a', status: 'unknown', owner: null }),
      JSON.stringify({ at: '2026-11-02T03:01:00+01:00', job: 'job/a', status: 'ok', owner: null }),
    ].join('\n'));

    await expect(readNight(runsDir, 'test-night')).resolves.toMatchObject({
      badLines: 2,
      rows: [{ job: 'job/a', runs: 1 }],
    });
  });

  it('returns an empty result for an empty file and propagates a missing file', async () => {
    const runsDir = await createRunsDirectory();
    await writeFile(join(runsDir, 'empty.jsonl'), '');

    await expect(readNight(runsDir, 'empty')).resolves.toEqual({ rows: [], badLines: 0 });
    await expect(readNight(runsDir, 'missing')).rejects.toThrow();
  });
});
