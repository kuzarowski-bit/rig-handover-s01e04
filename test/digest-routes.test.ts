import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { RigConfig } from '../src/config.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'rig-digest-routes-'));
  temporaryDirectories.push(directory);
  return directory;
}

function config(runsDir: string): RigConfig {
  return {
    adapter: 'test',
    installed: 'test',
    beatEverySeconds: 60,
    runsDir,
  };
}

function record(
  job: string,
  status: 'ok' | 'retry' | 'fail',
  at: string,
  owner: string | null,
  error?: string,
): string {
  return JSON.stringify({ at, job, status, owner, ...(error === undefined ? {} : { error }) });
}

describe('digest routes', () => {
  it('renders and returns sorted rows with retry and failure markers', async () => {
    const runsDir = await createTemporaryDirectory();
    await writeFile(
      join(runsDir, '2026-10-28.jsonl'),
      [
        record('job/zeta', 'fail', '2026-10-28T02:00:00+01:00', 'zoe', 'disk full'),
        record('job/alpha', 'retry', '2026-10-28T01:00:00+01:00', 'alice'),
        record('job/alpha', 'retry', '2026-10-28T01:01:00+01:00', 'alice'),
        record('job/alpha', 'retry', '2026-10-28T01:02:00+01:00', 'alice'),
        record('job/alpha', 'ok', '2026-10-28T01:03:00+01:00', 'alice'),
      ].join('\n') + '\n',
    );
    const app = createApp(config(runsDir));

    const htmlResponse = await app.request('/digest/2026-10-28');
    const jsonResponse = await app.request('/api/digest/2026-10-28');
    const html = await htmlResponse.text();
    const rows: Array<{ job: string; retries: number; lastStatus: string }> =
      await jsonResponse.json();

    expect(htmlResponse.status).toBe(200);
    expect(jsonResponse.status).toBe(200);
    expect(rows.map(({ job }) => job)).toEqual(['job/alpha', 'job/zeta']);
    expect(rows).toMatchObject([
      { job: 'job/alpha', retries: 3, lastStatus: 'ok' },
      { job: 'job/zeta', retries: 0, lastStatus: 'fail' },
    ]);
    expect(html.indexOf('job/alpha')).toBeLessThan(html.indexOf('job/zeta'));
    expect(html).toContain('digest-row--many-retries');
    expect(html).toContain('digest-row--failed');
    expect(html).toContain('3+ retries');
    expect(html).toContain('failed');
    const text = html.replace(/<[^>]*>/g, '');
    expect(text).toContain('3 3+ retries');
    expect(text).toContain('fail failed');
  });

  it('returns 404 for a night with no run log on both routes', async () => {
    const runsDir = await createTemporaryDirectory();
    const app = createApp(config(runsDir));

    const responses = await Promise.all([
      app.request('/digest/2026-10-28'),
      app.request('/api/digest/2026-10-28'),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([404, 404]);
  });

  it('renders an empty run log as nothing ran and returns an empty JSON array', async () => {
    const runsDir = await createTemporaryDirectory();
    await writeFile(join(runsDir, '2026-10-28.jsonl'), '');
    const app = createApp(config(runsDir));

    const htmlResponse = await app.request('/digest/2026-10-28');
    const jsonResponse = await app.request('/api/digest/2026-10-28');

    expect(htmlResponse.status).toBe(200);
    expect(await htmlResponse.text()).toContain('nothing ran');
    expect(jsonResponse.status).toBe(200);
    await expect(jsonResponse.json()).resolves.toEqual([]);
  });

  it('keeps valid data when a line is malformed and reports it on the page', async () => {
    const runsDir = await createTemporaryDirectory();
    await writeFile(
      join(runsDir, '2026-10-28.jsonl'),
      [
        '{not json',
        record('job/valid', 'ok', '2026-10-28T01:00:00+01:00', 'alice'),
      ].join('\n'),
    );
    const app = createApp(config(runsDir));

    const htmlResponse = await app.request('/digest/2026-10-28');
    const jsonResponse = await app.request('/api/digest/2026-10-28');

    expect(htmlResponse.status).toBe(200);
    expect(await htmlResponse.text()).toContain('1 unreadable line in the run log');
    expect(jsonResponse.status).toBe(200);
    await expect(jsonResponse.json()).resolves.toMatchObject([
      { job: 'job/valid', lastStatus: 'ok' },
    ]);
  });

  it('rejects malformed and impossible dates before trying to read the runs path', async () => {
    const temporaryDirectory = await createTemporaryDirectory();
    const runsFile = join(temporaryDirectory, 'runs-is-a-file');
    await writeFile(runsFile, 'not a directory');
    const app = createApp(config(runsFile));

    for (const night of ['2026-2-03', '2026-02-30']) {
      const responses = await Promise.all([
        app.request(`/digest/${night}`),
        app.request(`/api/digest/${night}`),
      ]);

      expect(responses.map(({ status }) => status), night).toEqual([404, 404]);
    }
  });
});
