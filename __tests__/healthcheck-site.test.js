import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
// Relative, and reached through cwd, so no filesystem path lands in the shell's argv.
const SCRIPT = 'scripts/healthcheck-site.sh';
const SITE = 'https://site.test';
const PING = 'https://hc-ping.test/site-check';

// Stands in for curl on PATH. A page fetch answers from $STUB_DIR/plan<path>,
// a space-separated list with one step per call (the last step repeats):
//   ok    HTTP 200 with the site name in the body
//   bare  HTTP 200 without it
//   down  connection refused (curl exit 7)
//   NNN   that HTTP status
// A Healthchecks ping (its URL comes on stdin through -K -) is recorded, and its
// body is kept in $STUB_DIR/ping-body.
const CURL_STUB = `#!/usr/bin/env bash
out='' fmt='' url='' data='' config=0
while (($#)); do
  case "$1" in
    -o) out=$2; shift 2 ;;
    -w) fmt=$2; shift 2 ;;
    -K) config=1; shift 2 ;;
    --data-binary) data=$2; shift 2 ;;
    --max-time|--retry) shift 2 ;;
    -*) shift ;;
    *) url=$1; shift ;;
  esac
done
if ((config)); then
  IFS= read -r line
  line=\${line#url = \\"}
  printf 'ping %s\\n' "\${line%\\"}" >>"$STUB_DIR/calls"
  [[ $data == @* ]] && cp "\${data#@}" "$STUB_DIR/ping-body"
  exit 0
fi
printf 'get %s\\n' "$url" >>"$STUB_DIR/calls"
n=$(grep -cxF "get $url" "$STUB_DIR/calls")
key=\${url#"$STUB_SITE"}
plan=(ok)
if [[ -r "$STUB_DIR/plan\${key//\\//_}" ]]; then read -r -a plan <"$STUB_DIR/plan\${key//\\//_}"; fi
step=\${plan[n-1]:-\${plan[\${#plan[@]}-1]}}
case $step in
  ok) code=200 body='<html><title>Activist Checklist</title></html>' ;;
  bare) code=200 body='<html><title>Down for maintenance</title></html>' ;;
  down) printf '000|0.001'; echo 'curl: (7) Failed to connect' >&2; exit 7 ;;
  *) code=$step body='<h1>Refused</h1>' ;;
esac
printf '%s' "$body" >"$out"
printf '%s|0.010' "$code"
`;

let tmp;
let stubDir;

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'healthcheck-site-'));
  stubDir = path.join(tmp, 'stub');
  mkdirSync(stubDir);
  writeFileSync(path.join(stubDir, 'curl'), CURL_STUB, { mode: 0o755 });
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

/** Run the check with per-path plans for the stub, e.g. { '/news/': ['429', 'ok'] }. */
function runCheck(plans = {}, env = {}) {
  for (const [page, steps] of Object.entries(plans)) {
    writeFileSync(path.join(stubDir, `plan${page.replaceAll('/', '_')}`), steps.join(' '));
  }
  const res = spawnSync('bash', [SCRIPT], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: {
      PATH: `${stubDir}:${process.env.PATH}`,
      TMPDIR: tmp,
      // Readable and empty, so the repo's own .env never leaks into the run.
      ENV_FILE: '/dev/null',
      LOG_DIR: path.join(tmp, 'logs'),
      STUB_DIR: stubDir,
      STUB_SITE: SITE,
      SITE_URL: SITE,
      GUIDE_PATH: '/essentials/',
      HEALTHCHECK_PING_URL: PING,
      SITE_HEALTH_RETRY_SLEEP: '0',
      ...env,
    },
  });
  if (res.error) throw res.error;
  const calls = readFileSync(path.join(stubDir, 'calls'), 'utf8').trim().split('\n');
  const bodyFile = path.join(stubDir, 'ping-body');
  return {
    status: res.status,
    fetches: calls.filter((c) => c.startsWith('get ')).length,
    pings: calls.filter((c) => c.startsWith('ping ')).map((c) => c.slice(5)),
    pingBody: existsSync(bodyFile) ? readFileSync(bodyFile, 'utf8') : '',
  };
}

describe('healthcheck-site.sh', () => {
  it('pings success after one round when every page loads', () => {
    const run = runCheck();
    expect(run.status).toBe(0);
    expect(run.fetches).toBe(3);
    expect(run.pings).toEqual([PING]);
  });

  // The false alarm this retry exists for: one page refused for a moment while
  // the site is fine. It must not reach Healthchecks as /fail.
  it('does not report a page that fails once and loads on the next round', () => {
    const run = runCheck({ '/news/': ['429', 'ok'] });
    expect(run.status).toBe(0);
    expect(run.fetches).toBe(6);
    expect(run.pings).toEqual([PING]);
    expect(run.pingBody).toContain('on attempt 2/2');
    expect(run.pingBody).toContain('attempt 1/2 news: HTTP 429');
  });

  it('reports a failure when a page is still failing on the last round', () => {
    const run = runCheck({ '/': ['503'] });
    expect(run.status).toBe(1);
    expect(run.fetches).toBe(6);
    expect(run.pings).toEqual([`${PING}/fail`]);
    expect(run.pingBody).toContain('attempt 1/2 homepage: HTTP 503');
    expect(run.pingBody).toContain('attempt 2/2 homepage: HTTP 503');
  });

  it('reports a failure that moves to another page on the retry', () => {
    const run = runCheck({ '/': ['ok', '503'], '/news/': ['429', 'ok'] });
    expect(run.pings).toEqual([`${PING}/fail`]);
    expect(run.pingBody).toContain('attempt 1/2 news: HTTP 429');
    expect(run.pingBody).toContain('attempt 2/2 homepage: HTTP 503');
  });

  it('fails a homepage that answers 200 without the site name', () => {
    const run = runCheck({ '/': ['bare'] });
    expect(run.pings).toEqual([`${PING}/fail`]);
    expect(run.pingBody).toContain('Down for maintenance');
  });

  it('fails a page whose connection is refused', () => {
    const run = runCheck({ '/essentials/': ['down'] });
    expect(run.pings).toEqual([`${PING}/fail`]);
    expect(run.pingBody).toContain('guide: curl error');
    expect(run.pingBody).toContain('curl_exit=7');
  });

  it('honours SITE_HEALTH_ATTEMPTS', () => {
    expect(runCheck({ '/news/': ['429'] }, { SITE_HEALTH_ATTEMPTS: '1' }).fetches).toBe(3);
  });

  it('reads a damaged SITE_HEALTH_ATTEMPTS as the default rather than never retrying', () => {
    for (const value of ['0', 'two', '-1']) {
      rmSync(path.join(stubDir, 'calls'), { force: true });
      const run = runCheck({ '/news/': ['429', 'ok'] }, { SITE_HEALTH_ATTEMPTS: value });
      expect(run.pings).toEqual([PING]);
    }
  });
});
