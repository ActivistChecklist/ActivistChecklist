#!/usr/bin/env node
/**
 * Compare the live SOFA macOS feed against `data/sofa-watchlist.json` and emit
 * a JSON diff to stdout. Used by the weekly GitHub Action that opens a tracking
 * issue when models drop and a PR adding any new identifiers to the watchlist.
 *
 * Output shape:
 *   {
 *     "dropped": ["MacBookPro15,1", ...],   // in watchlist, NOT in current SOFA
 *     "novel":   ["Mac17,9",       ...],     // in current SOFA, NOT in watchlist
 *     "sofaCount": 97,                       // total identifiers SOFA returned
 *     "watchlistCount": 95,                  // identifiers we deliberately track
 *     "fetchedAt": "2026-05-04T15:00:00.000Z"
 *   }
 *
 * Exit codes:
 *   0  no changes (dropped + novel both empty) OR diff written successfully
 *   1  fetch / parse error (caller should retry, not act on the output)
 *
 * The script always exits 0 when the diff is valid even if it's non-empty —
 * the caller (GH Action) decides whether to act based on the JSON content.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { diffSofaWatchlist, stripDocKeys } from '../lib/updates/mac-data.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const SOFA_WATCHLIST_PATH = path.join(REPO_ROOT, 'data', 'sofa-watchlist.json');
const SOFA_URL = 'https://sofafeed.macadmins.io/v2/macos_data_feed.json';
const USER_AGENT = 'ActivistChecklist/1.0 (+https://activistchecklist.org)';
const REQUEST_TIMEOUT_MS = 30_000;

async function fetchSofaIds() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(SOFA_URL, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for SOFA feed`);
    const json = await res.json();
    if (!json?.Models || typeof json.Models !== 'object') {
      throw new Error('SOFA feed missing Models map');
    }
    return Object.keys(stripDocKeys(json.Models));
  } finally {
    clearTimeout(timeout);
  }
}

async function readWatchlist() {
  const raw = await fs.readFile(SOFA_WATCHLIST_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed?.expected) ? parsed.expected : [];
}

async function main() {
  const sofaIds = await fetchSofaIds();
  const watchlist = await readWatchlist();
  const { dropped, novel } = diffSofaWatchlist(sofaIds, watchlist);
  const out = {
    dropped,
    novel,
    sofaCount: sofaIds.length,
    watchlistCount: watchlist.length,
    fetchedAt: new Date().toISOString(),
  };
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
}

main().catch((err) => {
  console.error(`sofa-watchlist-diff: ${err.message}`);
  process.exit(1);
});
