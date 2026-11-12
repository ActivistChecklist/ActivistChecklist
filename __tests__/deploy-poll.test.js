import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
// Relative, and reached through cwd, so no environment value lands in the shell's argv.
const LIB = 'scripts/lib/deploy-poll.sh';

function runLib(fn, args, input) {
  const res = spawnSync('bash', ['-c', 'source "$1" && shift && "$@"', 'bash', LIB, fn, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    input,
  });
  if (res.error) throw res.error;
  return { status: res.status, out: res.stdout };
}

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const C = 'c'.repeat(40);

// Defaults describe a quiet server: B is live, nothing is building, the checkout
// is on B, and the poller has never started a build.
function decide({
  remote = B,
  live = B,
  building = 0,
  checkout = B,
  tried = '',
  tries = 0,
  max = 2,
} = {}) {
  const { status, out } = runLib('deploy_poll_decide', [
    remote,
    live,
    String(building),
    checkout,
    tried,
    String(tries),
    String(max),
  ]);
  expect(status).toBe(0);
  return out.trim();
}

describe('deploy_poll_decide', () => {
  it('does nothing while the branch tip is live', () => {
    expect(decide()).toBe('idle');
    expect(decide({ building: 1, checkout: A })).toBe('idle');
  });

  it('starts a build when the branch moves past what is live', () => {
    expect(decide({ remote: C })).toBe('start 1');
  });

  it('starts a build when nothing has been recorded as live yet', () => {
    expect(decide({ remote: C, live: '' })).toBe('start 1');
  });

  it('leaves a running build alone when it is already building the tip', () => {
    expect(decide({ remote: C, building: 1, checkout: C })).toBe('idle');
  });

  it('asks a running build of an older commit to go round again', () => {
    expect(decide({ remote: C, building: 1, checkout: A })).toBe('queue');
  });

  it('retries a commit that did not go live, up to the limit', () => {
    expect(decide({ remote: C, checkout: C, tried: C, tries: 1 })).toBe('start 2');
    expect(decide({ remote: C, checkout: C, tried: C, tries: 2 })).toBe('give-up');
    // Past the limit (the poller bumps the count once it has logged the give-up).
    expect(decide({ remote: C, checkout: C, tried: C, tries: 3 })).toBe('give-up');
  });

  it('starts counting again when the branch moves to a new commit', () => {
    expect(decide({ remote: C, tried: A, tries: 5 })).toBe('start 1');
  });

  it('honours a higher limit', () => {
    expect(decide({ remote: C, tried: C, tries: 2, max: 3 })).toBe('start 3');
  });

  it('reads a damaged count or limit as the default rather than stopping deploys', () => {
    expect(decide({ remote: C, tried: C, tries: 'x' })).toBe('start 1');
    expect(decide({ remote: C, tried: C, tries: 1, max: 'oops' })).toBe('start 2');
    expect(decide({ remote: C, tried: C, tries: 2, max: '0' })).toBe('give-up');
  });
});

describe('deploy_poll_parse_remote', () => {
  const parse = (input) => runLib('deploy_poll_parse_remote', [], input);

  it('prints the SHA from a git ls-remote line', () => {
    expect(parse(`${A}\trefs/heads/main\n`)).toEqual({ status: 0, out: A });
    // SHA-256 repositories have 64-character names.
    const long = 'd'.repeat(64);
    expect(parse(`${long}\trefs/heads/main\n`)).toEqual({ status: 0, out: long });
  });

  it('reads a last line with no newline', () => {
    expect(parse(`${A}\trefs/heads/main`)).toEqual({ status: 0, out: A });
  });

  it('fails when the branch is missing or the output is not a SHA', () => {
    expect(parse('').status).toBe(1);
    expect(parse('-oops\trefs/heads/main\n').status).toBe(1);
    expect(parse(`${A.slice(0, 12)}\trefs/heads/main\n`).status).toBe(1);
    expect(parse(`${A.toUpperCase()}\trefs/heads/main\n`).status).toBe(1);
  });
});
