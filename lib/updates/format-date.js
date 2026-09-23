/**
 * Date formatting for the /updates page.
 *
 * The snapshot stores hardware release dates and end-of-support dates as date-only
 * ISO strings ("2024-11-01"). Those are calendar dates, not instants: nothing about
 * them is anchored to a timezone. JavaScript disagrees — it parses a date-only
 * string as UTC midnight — so formatting one through toLocaleDateString in the
 * viewer's own timezone rolls it back a day for everyone west of UTC. A MacBook Pro
 * whose marketing name literally reads "Nov 2024" showed up as "Released October
 * 2024" across the Americas, and every date the page prints was off by a month for
 * those readers: release dates, "security support ended <month year>", and
 * "receiving security updates through <date>".
 *
 * Formatting in UTC is what makes the rendered month match the stored date for
 * every reader.
 *
 * This does NOT generalise to real timestamps. The snapshot's `generatedAt` is an
 * instant, and the "Updated <date>" line should read in the viewer's local day, so
 * it is formatted separately in UpdatesPage.jsx and deliberately does not use this
 * helper.
 *
 * Pure: no I/O, no clock reads.
 */

const MONTH_YEAR = { month: 'long', year: 'numeric', timeZone: 'UTC' };

/**
 * Format a date-only ISO string as a localized "October 2026".
 *
 * `locale` comes from the page's useLocale() so /es/ readers get "octubre de 2026"
 * rather than always-English output. Returns '' for a missing value and echoes the
 * input back unchanged when it isn't a parseable date.
 */
export function formatMonthYear(iso, locale = 'en-US') {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale, MONTH_YEAR);
}
