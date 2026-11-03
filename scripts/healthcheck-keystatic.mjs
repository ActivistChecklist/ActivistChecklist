#!/usr/bin/env node
/**
 * Probes the production Keystatic admin and pings healthchecks.io: success
 * when it is usable, URL/fail with the reasons when it is not. What counts as
 * usable is decided in lib/keystatic-health.mjs.
 *
 * Env vars:
 *   KEYSTATIC_URL                    required, origin of the server that hosts /keystatic/
 *   KEYSTATIC_HEALTHCHECK_PING_URL   required, the base ping URL from healthchecks.io
 *
 * Usage:
 *   pnpm healthcheck-keystatic
 *
 * Scheduling: every 15 minutes from the May First control panel, as
 *   /path/to/repo/scripts/run-with-repo-node.sh run healthcheck-keystatic
 * The control panel pastes that into systemd's ExecStart, which is not a shell,
 * so schedule exactly one command (see the note in healthcheck-canary.mjs).
 */

import { keystaticHealthProblems } from '../lib/keystatic-health.mjs';

const BASE_URL = process.env.KEYSTATIC_URL;
const PING_URL = process.env.KEYSTATIC_HEALTHCHECK_PING_URL;

if (!BASE_URL || !PING_URL) {
  console.error('KEYSTATIC_URL and KEYSTATIC_HEALTHCHECK_PING_URL must both be set');
  process.exit(2);
}

// The ping URL is a credential and this output is logged, so it never appears
// in a message, even inside a fetch error.
function safeErrorMessage(err) {
  return String(err?.message ?? err ?? 'unknown error')
    .split(PING_URL)
    .join('[REDACTED]');
}

async function ping(endpoint, body) {
  const label = `keystatic ping${endpoint ? ` /${endpoint}` : ''}`;
  try {
    const res = await fetch(endpoint ? `${PING_URL}/${endpoint}` : PING_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body,
      signal: AbortSignal.timeout(10000),
    });
    console.log(`${label} ${res.ok ? 'ok' : `returned ${res.status}`}`);
    return res.ok;
  } catch (err) {
    console.error(`${label} failed: ${safeErrorMessage(err)}`);
    return false;
  }
}

async function get(pathname, options = {}) {
  return fetch(new URL(pathname, BASE_URL), {
    ...options,
    headers: { 'User-Agent': 'activistchecklist-healthcheck' },
    signal: AbortSignal.timeout(20000),
  });
}

async function main() {
  const pageRes = await get('/keystatic/');
  const page = { status: pageRes.status, body: await pageRes.text() };
  const loginRes = await get('/api/keystatic/github/login/', { redirect: 'manual' });
  const login = { status: loginRes.status, location: loginRes.headers.get('location') };

  const problems = keystaticHealthProblems(BASE_URL, page, login);
  if (problems.length) {
    const msg = problems.join('\n');
    console.error(msg);
    await ping('fail', msg);
    process.exit(1);
  }
  console.log('Keystatic admin and GitHub sign-in redirect look healthy');
  if (!(await ping(null, 'OK'))) process.exit(2);
}

main().catch(async (err) => {
  const msg = `Probe failed: ${safeErrorMessage(err)}`;
  console.error(msg);
  await ping('fail', msg);
  process.exit(1);
});
