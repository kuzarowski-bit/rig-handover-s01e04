import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DigestReadResult, DigestRow, DigestStatus } from './types.js';

type RunRecord = {
  at: string;
  job: string;
  status: DigestStatus;
  owner: string | null;
  error?: string;
};

function isDigestStatus(value: unknown): value is DigestStatus {
  return value === 'ok' || value === 'retry' || value === 'fail';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseRunRecord(line: string): RunRecord | null {
  let value: unknown;

  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }

  if (!isRecord(value)) return null;

  const { at, job, status, owner, error } = value;
  if (
    typeof at !== 'string' ||
    typeof job !== 'string' ||
    !isDigestStatus(status) ||
    (owner !== null && typeof owner !== 'string') ||
    ('error' in value && typeof error !== 'string')
  ) {
    return null;
  }

  return {
    at,
    job,
    status,
    owner,
    ...(typeof error === 'string' ? { error } : {}),
  };
}

export async function readNight(runsDir: string, night: string): Promise<DigestReadResult> {
  const contents = await readFile(join(runsDir, `${night}.jsonl`), 'utf8');
  const lines = contents.split('\n');
  if (lines.at(-1) === '') lines.pop();

  const rowsByJob = new Map<string, DigestRow>();
  let badLines = 0;

  for (const line of lines) {
    const record = parseRunRecord(line);
    if (!record) {
      badLines += 1;
      continue;
    }

    const existing = rowsByJob.get(record.job);
    if (existing) {
      existing.runs += 1;
      if (record.status === 'retry') existing.retries += 1;
      existing.owner = record.owner;
      existing.lastStatus = record.status;
      existing.lastAt = record.at;
      if (record.error !== undefined) existing.lastError = record.error;
      continue;
    }

    rowsByJob.set(record.job, {
      job: record.job,
      owner: record.owner,
      runs: 1,
      retries: record.status === 'retry' ? 1 : 0,
      lastStatus: record.status,
      lastError: record.error ?? null,
      firstAt: record.at,
      lastAt: record.at,
    });
  }

  return { rows: [...rowsByJob.values()], badLines };
}
