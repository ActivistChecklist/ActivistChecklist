/**
 * When a guide counts as possibly out of date. The /checklists index shows a
 * stale guide's review date, and the guide page itself shows a notice, so both
 * read the threshold from here.
 */

import { parseContentDateOnly } from './utils';

/** A guide not reviewed in this many months is flagged as possibly out of date. */
export const STALE_AFTER_MONTHS = 12;

/**
 * The guide's review date as YYYY-MM-DD when it is more than
 * STALE_AFTER_MONTHS before `now`, otherwise null. Missing or unparseable
 * dates are never stale: no notice beats a wrong one.
 *
 * @param {string|Date|undefined} lastUpdated - frontmatter `lastUpdated`; gray-matter
 *   parses unquoted YAML dates into a Date at UTC midnight
 * @param {Date} [now]
 * @returns {string|null}
 */
export function staleReviewDate(lastUpdated, now = new Date()) {
  if (lastUpdated instanceof Date && Number.isNaN(lastUpdated.getTime())) return null;
  const dateString =
    lastUpdated instanceof Date ? lastUpdated.toISOString().slice(0, 10) : lastUpdated;
  const date = parseContentDateOnly(dateString);
  if (!date) return null;
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - STALE_AFTER_MONTHS);
  return date < cutoff ? dateString : null;
}
