import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
// Relative, and reached through cwd, so no filesystem path lands in the shell's argv.
const SCRIPT = 'scripts/healthcheck-listmonk.sh';
const PING = 'https://hc-ping.test/listmonk-check';

// Stands in for curl on PATH. A request answers from $STUB_DIR/plan<path>, a
// space-separated list with one step per call (the last step repeats):
//   ok       what a healthy listmonk or site API sends for that path
//   reject   HTTP 200 with "success":false (the site API could not subscribe)
//   timeout  no answer (curl exit 28)
//   refused  connection refused (curl exit 7)
//   NNN      that HTTP status
// A Healthchecks ping (its URL comes on stdin through -K -) is recorded, and its
// body is kept in $STUB_DIR/ping-body.
const CURL_STUB = `#!/usr/bin/env bash
url='' data='' config=0
while (($#)); do
  case "$1" in
    -K) config=1; shift 2 ;;
    --data-binary|--data-raw) data=$2; shift 2 ;;
    -w|-o|-m|-X|-H|--max-time|--retry) shift 2 ;;
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
key=/\${url#*://*/}
printf 'get %s\\n' "$key" >>"$STUB_DIR/calls"
n=$(grep -cxF "get $key" "$STUB_DIR/calls")
plan=(ok)
if [[ -r "$STUB_DIR/plan\${key//\\//_}" ]]; then read -r -a plan <"$STUB_DIR/plan\${key//\\//_}"; fi
step=\${plan[n-1]:-\${plan[\${#plan[@]}-1]}}
case $step:$key in
  ok:/api/health) code=403 body='{"message":"invalid session"}' ;;
  ok:/subscription) code=200 body='<a href="https://listmonk.app">listmonk</a>' ;;
  ok:*) code=200 body='{"success":true}' ;;
  reject:*) code=200 body='{"success":false,"error":"Something went wrong."}' ;;
  timeout:*) printf '\\n000'; exit 28 ;;
  refused:*) printf '\\n000'; exit 7 ;;
  *) code=\${step%%:*} body='<h1>Error</h1>' ;;
esac
printf '%s\\n%s' "$body" "$code"
`;

const LAUNCH_STUB = `#!/usr/bin/env bash
echo launch >>"$STUB_DIR/calls"
`;

let tmp;
let stubDir;

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'healthcheck-listmonk-'));
  stubDir = path.join(tmp, 'stub');
  mkdirSync(stubDir);
  writeFileSync(path.join(stubDir, 'curl'), CURL_STUB, { mode: 0o755 });
  writeFileSync(path.join(stubDir, 'launch'), LAUNCH_STUB, { mode: 0o755 });
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

/** Run the check with per-path plans for the stub, e.g. { '/api/health': ['timeout', 'ok'] }. */
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
      LISTMONK_ROOT_URL: 'https://news.test',
      LISTMONK_SUBSCRIBE_URL: 'https://site.test/api-server/subscribe',
      LISTMONK_HEALTHCHECK_PING_URL: PING,
      LISTMONK_LAUNCH_SCRIPT: path.join(stubDir, 'launch'),
      LISTMONK_LIVENESS_RETRY_SLEEP: '0',
      LISTMONK_START_RETRY_SLEEP: '0',
      LISTMONK_REPO_MAX_AGE_HOURS: '0',
      ...env,
    },
  });
  if (res.error) throw res.error;
  const calls = readFileSync(path.join(stubDir, 'calls'), 'utf8').trim().split('\n');
  const bodyFile = path.join(stubDir, 'ping-body');
  return {
    status: res.status,
    healthFetches: calls.filter((c) => c === 'get /api/health').length,
    launched: calls.includes('launch'),
    pings: calls.filter((c) => c.startsWith('ping ')).map((c) => c.slice(5)),
    pingBody: existsSync(bodyFile) ? readFileSync(bodyFile, 'utf8') : '',
    log: readFileSync(path.join(tmp, 'logs', 'healthcheck-listmonk.log'), 'utf8'),
  };
}

describe('healthcheck-listmonk.sh', () => {
  it('pings success when listmonk answers and the subscribe goes through', () => {
    const run = runCheck();
    expect(run.status).toBe(0);
    expect(run.healthFetches).toBe(1);
    expect(run.launched).toBe(false);
    expect(run.pings).toEqual([PING]);
    expect(run.pingBody).toContain('liveness_attempt=1/2');
  });

  // The 2026-11-23 false alarm: one probe got no answer while listmonk was fine.
  it('does not restart or report a probe that misses once and answers on the retry', () => {
    const run = runCheck({ '/api/health': ['timeout', 'ok'], '/subscription': ['timeout'] });
    expect(run.status).toBe(0);
    expect(run.healthFetches).toBe(2);
    expect(run.launched).toBe(false);
    expect(run.pings).toEqual([PING]);
    expect(run.pingBody).toContain('liveness_attempt=2/2');
  });

  it("logs curl's exit code when a probe gets no answer", () => {
    const run = runCheck({ '/api/health': ['timeout', 'ok'], '/subscription': ['timeout'] });
    expect(run.log).toContain('FAIL: health API check (http=000 curl_exit=28');
  });

  it('reports but does not restart when the probe keeps missing while subscribes work', () => {
    const run = runCheck({ '/api/health': ['timeout'], '/subscription': ['timeout'] });
    expect(run.status).toBe(1);
    expect(run.healthFetches).toBe(2);
    expect(run.launched).toBe(false);
    expect(run.pings).toEqual([`${PING}/fail`]);
    expect(run.pingBody).toContain('did not answer this host');
  });

  it('restarts and reports a listmonk that is down on both probes and refuses the subscribe', () => {
    const run = runCheck({
      '/api/health': ['refused', 'refused', 'ok'],
      '/subscription': ['refused'],
      '/api-server/subscribe': ['reject', 'ok'],
    });
    expect(run.status).toBe(1);
    expect(run.launched).toBe(true);
    expect(run.pings).toEqual([`${PING}/fail`]);
    expect(run.pingBody).toContain('verdict=RECOVERED');
  });

  it('honours LISTMONK_LIVENESS_ATTEMPTS', () => {
    const run = runCheck(
      { '/api/health': ['timeout', 'ok'], '/subscription': ['timeout'] },
      { LISTMONK_LIVENESS_ATTEMPTS: '1' },
    );
    expect(run.healthFetches).toBe(1);
    expect(run.pings).toEqual([`${PING}/fail`]);
  });

  it('reads a damaged LISTMONK_LIVENESS_ATTEMPTS as the default rather than never retrying', () => {
    for (const value of ['0', 'two', '-1']) {
      rmSync(path.join(stubDir, 'calls'), { force: true });
      const run = runCheck(
        { '/api/health': ['timeout', 'ok'], '/subscription': ['timeout'] },
        { LISTMONK_LIVENESS_ATTEMPTS: value },
      );
      expect(run.pings).toEqual([PING]);
    }
  });
});
