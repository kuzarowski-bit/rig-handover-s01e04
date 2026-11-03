import type { DigestReadResult } from '../digest/types.js';

export function DigestPage({ night, digest }: { night: string; digest: DigestReadResult }) {
  const rows = [...digest.rows].sort((left, right) => left.job.localeCompare(right.job));

  return (
    <>
      <h1>digest · {night}</h1>
      {digest.badLines > 0 && (
        <p class="warn">
          {digest.badLines} unreadable {digest.badLines === 1 ? 'line' : 'lines'} in the run log
        </p>
      )}
      {rows.length === 0 ? (
        <p>nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">job</th>
              <th scope="col">owner</th>
              <th scope="col">runs</th>
              <th scope="col">retries</th>
              <th scope="col">last status</th>
              <th scope="col">last error</th>
              <th scope="col">first time</th>
              <th scope="col">last time</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const hasManyRetries = row.retries >= 3;
              const failed = row.lastStatus === 'fail';
              const rowClasses = [
                'digest-row',
                ...(hasManyRetries ? ['digest-row--many-retries'] : []),
                ...(failed ? ['digest-row--failed'] : []),
              ].join(' ');

              return (
                <tr class={rowClasses}>
                  <th scope="row">{row.job}</th>
                  <td>{row.owner ?? '—'}</td>
                  <td>{row.runs}</td>
                  <td>
                    {row.retries}
                    {hasManyRetries && (
                      <span class="digest-label digest-label--many-retries">3+ retries</span>
                    )}
                  </td>
                  <td>
                    {row.lastStatus}
                    {failed && <span class="digest-label digest-label--failed">failed</span>}
                  </td>
                  <td>{row.lastError ?? '—'}</td>
                  <td>{row.firstAt}</td>
                  <td>{row.lastAt}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
