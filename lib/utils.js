import { clsx } from "clsx";
import { twMerge } from "tailwind-merge"

/**
 * Get fully qualified base URL for the site. Never returns relative paths.
 * Used for OG images, canonical URLs, etc. so they load correctly on Vercel.
 */
export function getBaseUrl() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (siteUrl && (siteUrl.startsWith('http://') || siteUrl.startsWith('https://'))) {
    return siteUrl.replace(/\/$/, ''); // trim trailing slash
  }
  if (process.env.NEXT_PUBLIC_VERCEL_URL) {
    return `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`;
  }
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return 'https://activistchecklist.org';
}

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Parse a content date for display. Plain `YYYY-MM-DD` strings are treated as a
 * calendar date in the user's local timezone.
 *
 * `new Date("2026-04-03")` is specified as UTC midnight, so in US timezones it
 * often renders as the previous day. Content frontmatter dates are calendar
 * dates, not moments in time — use this before formatting.
 *
 * @param {string} dateString - `YYYY-MM-DD` or a full ISO datetime
 * @returns {Date|null}
 */
export function parseContentDateOnly(dateString) {
  if (!dateString) return null;
  const s = String(dateString).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    return new Date(y, mo, d);
  }
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Format a content calendar date for UI (guides, pages, meta bar).
 * @param {string} dateString
 * @param {string} [dateLocale='en-US']
 * @param {Intl.DateTimeFormatOptions} [options]
 */
export function formatContentDate(dateString, dateLocale = 'en-US', options) {
  const date = parseContentDateOnly(dateString);
  if (!date) return '';
  const opts = options ?? {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  };
  return date.toLocaleDateString(dateLocale, opts);
}

/**
 * `Intl.RelativeTimeFormat` with `numeric: 'auto'` returns lowercase "today", "yesterday"
 * in English. For UI we treat compact single-word phrases as sentence-style (capitalized);
 * multi-word phrases like "3 days ago" or "hace 3 días" stay as returned.
 * @param {string} phrase
 */
export function sentenceCaseCompactRelativePhrase(phrase) {
  if (!phrase) return phrase;
  const t = phrase.trim();
  if (t.includes(' ')) return phrase;
  const first = t[0];
  if (!first || !/\p{L}/u.test(first)) return phrase;
  return first.toLocaleUpperCase() + t.slice(1);
}

/**
 * A calendar date that does not depend on the current time.
 *
 * {@link formatRelativeDate} is time-dependent, so it cannot be rendered on the
 * server of a statically exported site: the HTML freezes whatever "Today" or
 * "3 days ago" was true at build time, and the browser computes something else
 * at page load. That mismatch is a hydration error (React #418), which aborts
 * hydration for the whole tree. Render this on the server and swap to the
 * relative form after mount - see `useRelativeDate`.
 *
 * Deliberately matches the >30 day branch of formatRelativeDate, so entries old
 * enough to already display an absolute date do not visibly change on mount.
 *
 * @param {string} dateString - ISO or YYYY-MM-DD
 * @param {string} [dateLocale='en-US']
 */
export function formatStableContentDate(dateString, dateLocale = 'en-US') {
  const date = parseContentDateOnly(dateString);
  if (!date) return '';
  return date.toLocaleDateString(dateLocale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format a date string: relative phrasing for the last 7 days (locale-aware via Intl),
 * then short calendar dates for older entries.
 *
 * Time-dependent: never render the result during SSR of a static export. Use
 * `useRelativeDate` so the server emits {@link formatStableContentDate} instead.
 *
 * @param {string} dateString - ISO or YYYY-MM-DD
 * @param {string} [dateLocale='en-US'] - BCP 47 tag for `Intl` (use {@link getIntlLocale} from i18n-config)
 * @param {Date} [now] - injectable clock, so the branches can be tested deterministically
 */
export function formatRelativeDate(dateString, dateLocale = 'en-US', now = new Date()) {
  if (!dateString) return '';

  const date = parseContentDateOnly(dateString);
  if (!date) return '';
  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const nowOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffInDays = Math.round((nowOnly - dateOnly) / (1000 * 60 * 60 * 24));

  if (diffInDays >= 0 && diffInDays <= 7) {
    const rtf = new Intl.RelativeTimeFormat(dateLocale, { numeric: 'auto' });
    return sentenceCaseCompactRelativePhrase(rtf.format(-diffInDays, 'day'));
  }

  if (diffInDays >= 0 && diffInDays <= 30) {
    return date.toLocaleDateString(dateLocale, {
      month: 'short',
      day: 'numeric',
    });
  }
  return date.toLocaleDateString(dateLocale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}



