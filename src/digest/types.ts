export type DigestStatus = 'ok' | 'retry' | 'fail';

export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: DigestStatus;
  lastError: string | null;
  firstAt: string;
  lastAt: string;
};

export type DigestReadResult = {
  rows: DigestRow[];
  badLines: number;
};

export declare function readNight(runsDir: string, night: string): DigestReadResult;
