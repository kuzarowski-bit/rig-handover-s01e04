import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

async function withRunsDirectory(test: (runsDir: string) => Promise<void>): Promise<void> {
  const runsDir = await mkdtemp(join(tmpdir(), 'rig-status-'));
  try {
    await test(runsDir);
  } finally {
    await rm(runsDir, { recursive: true, force: true });
  }
}

describe('status board', () => {
  it('shows the lane banner and the nights on disk', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const res = await createApp(config).request('/');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    expect(html).toContain('2026-10-28');
  });

  it('health answers with the lane id', async () => {
    const res = await createApp(config).request('/health');
    expect(await res.json()).toEqual({ ok: true, lane: 'lane-07' });
  });

  it('links each night and counts the final status once per job', async () => {
    await withRunsDirectory(async (runsDir) => {
      const records = [
        { at: '2026-11-01T01:00:00+01:00', job: 'job/a', status: 'retry', owner: 'alice' },
        { at: '2026-11-01T01:01:00+01:00', job: 'job/a', status: 'ok', owner: 'alice' },
        { at: '2026-11-01T01:02:00+01:00', job: 'job/b', status: 'fail', owner: 'bob' },
        { at: '2026-11-01T01:03:00+01:00', job: 'job/c', status: 'retry', owner: null },
      ];
      const contents = `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;
      await writeFile(join(runsDir, '2026-11-01.jsonl'), contents);
      await writeFile(join(runsDir, '2026-10-31.jsonl'), '');

      const res = await createApp({ ...config, runsDir }).request('/');
      const html = await res.text();

      expect(res.status).toBe(200);
      expect(html).toContain('<a href="/digest/2026-11-01">2026-11-01</a>');
      expect(html).toContain('ok 1 · retry 1 · fail 1');
      expect(html).toContain('<a href="/digest/2026-10-31">2026-10-31</a>');
      expect(html).toContain('ok 0 · retry 0 · fail 0');
    });
  });

  it('keeps rendering when an on-disk night cannot be read', async () => {
    await withRunsDirectory(async (runsDir) => {
      await symlink(join(runsDir, 'missing.jsonl'), join(runsDir, '2026-11-02.jsonl'));

      const res = await createApp({ ...config, runsDir }).request('/');
      const html = await res.text();

      expect(res.status).toBe(200);
      expect(html).toContain('<a href="/digest/2026-11-02">2026-11-02</a>');
      expect(html).toContain('ok — · retry — · fail —');
    });
  });
});
