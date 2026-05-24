#!/usr/bin/env node
/**
 * Pings a healthchecks.io URL based on the freshness of the warrant canary.
 *
 * Success ping if the embedded datestamp is within MAX_AGE_DAYS.
 * Fail ping (URL/fail) if the canary is stale, missing, or unparseable.
 *
 * Env vars:
 *   HEALTHCHECK_CANARY_URL  required, the base ping URL from healthchecks.io
 *   CANARY_MAX_AGE_DAYS      optional, defaults to 90
 *
 * Example cron (run every Monday at 14:00 UTC):
 *   0 14 * * 1 cd /path/to/repo && HEALTHCHECK_CANARY_URL=https://hc-ping.com/xxx node scripts/canary-healthcheck.mjs >> /var/log/canary-healthcheck.log 2>&1
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CANARY_PATH = resolve(__dirname, '..', 'public', 'files', 'canary.txt');
const PING_URL = process.env.HEALTHCHECK_CANARY_URL;
const parsedMaxAge = Number(process.env.CANARY_MAX_AGE_DAYS ?? 90);
const MAX_AGE_DAYS = Number.isFinite(parsedMaxAge) && parsedMaxAge > 0 ? parsedMaxAge : 90;

// Matches: "ActivistChecklist.org Warrant Canary · 2026-05-23 21:24:36 UTC"
const DATE_RE = /Warrant Canary\s+\S\s+(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) UTC/;

if (!PING_URL) {
  console.error('HEALTHCHECK_CANARY_URL is not set');
  process.exit(2);
}

async function ping(endpoint, body) {
  const url = endpoint ? `${PING_URL}/${endpoint}` : PING_URL;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: body ?? '',
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      console.error(`Ping to ${url} returned ${res.status} ${res.statusText}`);
       return false;
     }
     console.log(`Pinged ${url}`);
     return true;
  } catch (err) {
    console.error(`Ping to ${url} failed: ${err.message}`);
    return false;
  }
}

async function main() {
  let contents;
  try {
    contents = await readFile(CANARY_PATH, 'utf8');
  } catch (err) {
    const msg = `Could not read canary at ${CANARY_PATH}: ${err.message}`;
    console.error(msg);
    await ping('fail', msg);
    process.exit(1);
  }

  const match = contents.match(DATE_RE);
  if (!match) {
    const msg = 'Could not find datestamp in canary file';
    console.error(msg);
    await ping('fail', msg);
    process.exit(1);
  }

  // "2026-05-23 21:24:36" -> "2026-05-23T21:24:36Z"
  const canaryDate = new Date(match[1].replace(' ', 'T') + 'Z');
  if (Number.isNaN(canaryDate.getTime())) {
    const msg = `Invalid canary date: ${match[1]}`;
    console.error(msg);
    await ping('fail', msg);
    process.exit(1);
  }

  const ageDays = (Date.now() - canaryDate.getTime()) / (1000 * 60 * 60 * 24);
  const summary = `Canary dated ${canaryDate.toISOString()}, age ${ageDays.toFixed(1)} days, threshold ${MAX_AGE_DAYS} days`;
  console.log(summary);

  if (ageDays > MAX_AGE_DAYS) {
    const ok = await ping('fail', `STALE: ${summary}`);
    process.exit(ok ? 1 : 2);
  }

  if (!(await ping(null, `OK: ${summary}`))) process.exit(2);
}

main().catch(async (err) => {
  console.error(err);
  await ping('fail', `Unexpected error: ${err?.message ?? err}`);
  process.exit(1);
});
