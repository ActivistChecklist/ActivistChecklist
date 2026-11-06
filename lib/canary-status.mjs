/**
 * The warrant canary's "valid through" date, and whether it has passed.
 *
 * scripts/canary.mjs writes canaryValidThrough() into the signed canary, and
 * components/CanaryStatus.jsx works out the same date in the visitor's browser
 * from the canary's signed datestamp, so the page and the canary always agree.
 * The check has to run at view time: the site is a static export, so a status
 * worked out at build time would stay "up to date" forever if we stopped
 * rebuilding.
 */

// The privacy and security pages promise a new canary every 4 months and tell
// readers to ask questions once 4 months pass without one.
export const CANARY_VALID_MONTHS = 4;

const DAY_MS = 24 * 60 * 60 * 1000;

// First line of the signed message from scripts/canary.mjs:
// "ActivistChecklist.org Warrant Canary · 2026-08-11 18:42:49 UTC"
const DATE_RE = /Warrant Canary\s+\S\s+(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) UTC/;

const SIGNED_START = '-----BEGIN PGP SIGNED MESSAGE-----';
const SIGNATURE_START = '-----BEGIN PGP SIGNATURE-----';

/** The canary's datestamp, read only from the signed part of a clearsigned file. */
function parseCanaryDate(text) {
  if (typeof text !== 'string') return null;
  const start = text.indexOf(SIGNED_START);
  const end = text.indexOf(SIGNATURE_START);
  if (start === -1 || end < start) return null;

  const match = text.slice(start, end).match(DATE_RE);
  if (!match) return null;
  const date = new Date(`${match[1]}T${match[2]}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Last day a canary signed at `signedAt` is valid: the same UTC calendar day
 * CANARY_VALID_MONTHS later, or that month's last day when it is shorter
 * (Oct 31 gives Feb 28). Returned as midnight UTC; format it with timeZone 'UTC'.
 */
export function canaryValidThrough(signedAt) {
  const year = signedAt.getUTCFullYear();
  const month = signedAt.getUTCMonth() + CANARY_VALID_MONTHS;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(signedAt.getUTCDate(), daysInMonth)));
}

/**
 * @param {string} text - contents of canary.txt
 * @param {Date} [now] - injectable clock, so the branches can be tested
 * @returns {{ state: 'current' | 'overdue', updatedAt: Date, validThrough: Date } | { state: 'unknown' }}
 *   Overdue from the start of the day after validThrough (UTC). 'unknown'
 *   when the file has no signed message or no date we can read.
 */
export function getCanaryStatus(text, now = new Date()) {
  const updatedAt = parseCanaryDate(text);
  if (!updatedAt) return { state: 'unknown' };
  const validThrough = canaryValidThrough(updatedAt);
  const overdue = now.getTime() >= validThrough.getTime() + DAY_MS;
  return { state: overdue ? 'overdue' : 'current', updatedAt, validThrough };
}
