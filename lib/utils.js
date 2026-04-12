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
 * Format a date string: relative phrasing for the last 7 days (locale-aware via Intl),
 * then short calendar dates for older entries.
 * @param {string} dateString - ISO or YYYY-MM-DD
 * @param {string} [dateLocale='en-US'] - BCP 47 tag for `Intl` (use {@link getIntlLocale} from i18n-config)
 */
export function formatRelativeDate(dateString, dateLocale = 'en-US') {
  if (!dateString) return '';

  const date = parseContentDateOnly(dateString);
  if (!date) return '';
  const now = new Date();
  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const nowOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffInDays = Math.round((nowOnly - dateOnly) / (1000 * 60 * 60 * 24));

  if (diffInDays >= 0 && diffInDays <= 7) {
    const rtf = new Intl.RelativeTimeFormat(dateLocale, { numeric: 'auto' });
    return rtf.format(-diffInDays, 'day');
  }

  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(now.getFullYear() - 1);

  if (date >= oneYearAgo) {
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



