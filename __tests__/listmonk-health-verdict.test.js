import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
// Kept as a literal relative path and resolved via cwd: an absolute path built from
// import.meta.dirname would be an environment value flowing into a shell command.
const LIB = 'scripts/lib/listmonk-health-verdict.sh';

function run(fn, ...args) {
  return execFileSync(
    'bash',
    ['-c', 'source "$1"; shift; "$@"', 'bash', LIB, fn, ...args.map(String)],
    { encoding: 'utf8', cwd: REPO_ROOT },
  ).trim();
}

const verdict = (neededRestart, liveness, roundtrip, stale = false) =>
  run('health_verdict', neededRestart, liveness, roundtrip, stale);

describe('health_verdict', () => {
  it('is OK only when listmonk was up on arrival and the subscribe path worked', () => {
    expect(verdict(false, true, 'PASS')).toBe('OK');
  });

  // The 2026-10-06 outage: every run found listmonk down, revived it for a few
  // seconds, and pinged green. A successful restart must never read as healthy.
  it('reports a successful restart as RECOVERED, not OK', () => {
    expect(verdict(true, true, 'PASS')).toBe('RECOVERED');
    expect(verdict(true, true, 'SKIPPED')).toBe('RECOVERED');
  });

  it('is DOWN when listmonk is not answering after any restart', () => {
    expect(verdict(true, false, 'PASS')).toBe('DOWN');
    expect(verdict(false, false, 'SKIPPED')).toBe('DOWN');
  });

  it('is DOWN when listmonk answers but the subscribe path is broken', () => {
    for (const roundtrip of ['FAIL', 'BAD_REQUEST', 'UPSTREAM_DOWN']) {
      expect(verdict(false, true, roundtrip)).toBe('DOWN');
      expect(verdict(true, true, roundtrip)).toBe('DOWN');
    }
  });

  // A rate-limited or disabled probe proves nothing; flapping on it trains people
  // to ignore the alert.
  it('stays OK on an inconclusive or skipped round trip', () => {
    expect(verdict(false, true, 'INCONCLUSIVE')).toBe('OK');
    expect(verdict(false, true, 'SKIPPED')).toBe('OK');
  });

  it('reports a stale checkout even when listmonk is healthy', () => {
    expect(verdict(false, true, 'PASS', true)).toBe('STALE');
  });

  it('lets an outage outrank a stale checkout', () => {
    expect(verdict(true, true, 'PASS', true)).toBe('RECOVERED');
    expect(verdict(false, false, 'PASS', true)).toBe('DOWN');
  });
});

describe('restart_needed', () => {
  const restart = (liveness, roundtrip) => run('restart_needed', liveness, roundtrip);

  it('restarts when listmonk does not answer and nothing shows it serving', () => {
    for (const roundtrip of ['FAIL', 'UPSTREAM_DOWN', 'BAD_REQUEST', 'INCONCLUSIVE', 'SKIPPED']) {
      expect(restart(false, roundtrip)).toBe('true');
    }
  });

  // 2026-11-23: the probe got no answer while a subscribe in the same run went
  // through. Restarting then took down a listmonk that was serving fine.
  it('leaves listmonk alone when the probe misses but a subscribe just went through', () => {
    expect(restart(false, 'PASS')).toBe('false');
  });

  it('restarts a listmonk that answers but refuses the subscribe', () => {
    expect(restart(true, 'FAIL')).toBe('true');
  });

  it('does not restart for problems that are not listmonk', () => {
    for (const roundtrip of ['PASS', 'UPSTREAM_DOWN', 'BAD_REQUEST', 'INCONCLUSIVE', 'SKIPPED']) {
      expect(restart(true, roundtrip)).toBe('false');
    }
  });
});

describe('should_page', () => {
  const now = 1_800_000_000;
  const page = (verdict, minutesAgo) =>
    run('should_page', verdict, now, minutesAgo === undefined ? '' : now - minutesAgo * 60);

  it('never pages when listmonk was up', () => {
    expect(page('OK')).toBe('false');
    expect(page('OK', 5)).toBe('false');
  });

  it('always pages for a checkout that has stopped syncing', () => {
    expect(page('STALE')).toBe('true');
  });

  // 2026-11-24: a host reboot, fixed by the next run, paged for an outage that
  // was already over.
  it('stays quiet for the first bad run in an hour', () => {
    for (const verdict of ['DOWN', 'RECOVERED']) {
      expect(page(verdict)).toBe('false');
      expect(page(verdict, 60)).toBe('false');
      expect(page(verdict, 600)).toBe('false');
    }
  });

  // A restart loop is a bad run every five minutes; it must still page.
  it('pages when another bad run was within the hour', () => {
    for (const verdict of ['DOWN', 'RECOVERED']) {
      expect(page(verdict, 5)).toBe('true');
      expect(page(verdict, 59)).toBe('true');
    }
  });

  it('reads a damaged record as no earlier trouble', () => {
    expect(run('should_page', 'DOWN', now, 'garbage')).toBe('false');
  });
});

describe('repo_is_stale', () => {
  const now = 1_800_000_000;
  const hoursAgo = (h) => now - h * 3600;

  it('is fresh when the last fetch is within the window', () => {
    expect(run('repo_is_stale', hoursAgo(1), now, 6)).toBe('false');
    expect(run('repo_is_stale', hoursAgo(6), now, 6)).toBe('false');
  });

  it('is stale once the last fetch is older than the window', () => {
    expect(run('repo_is_stale', hoursAgo(6) - 1, now, 6)).toBe('true');
    expect(run('repo_is_stale', hoursAgo(24 * 35), now, 6)).toBe('true');
  });

  it('treats a checkout that has never fetched as stale', () => {
    expect(run('repo_is_stale', '', now, 6)).toBe('true');
  });

  it('can be disabled with a zero window', () => {
    expect(run('repo_is_stale', '', now, 0)).toBe('false');
    expect(run('repo_is_stale', hoursAgo(1000), now, 0)).toBe('false');
  });
});
