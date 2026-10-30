/**
 * When a guide counts as possibly out of date. The /checklists index shows a
 * stale guide's review date, and the guide page itself shows a notice, so both
 * read the threshold from here.
 */

import { parseContentDateOnly } from './utils';

/** A guide not reviewed in this many months is flagged as possibly out of date. */
export const STALE_AFTER_MONTHS = 12;

/**
 * How out of date a guide is, or null when it was reviewed within
 * STALE_AFTER_MONTHS of `now`. Missing or unparseable dates are never stale:
 * no notice beats a wrong one.
 *
 * @param {string|Date|undefined} lastUpdated - frontmatter `lastUpdated`; gray-matter
 *   parses unquoted YAML dates into a Date at UTC midnight
 * @param {Date} [now]
 * @returns {{ reviewDate: string, yearsOld: number } | null} reviewDate is
 *   YYYY-MM-DD; yearsOld is whole years since then, at least 1
 */
export function getGuideStaleness(lastUpdated, now = new Date()) {
  if (lastUpdated instanceof Date && Number.isNaN(lastUpdated.getTime())) return null;
  const reviewDate =
    lastUpdated instanceof Date ? lastUpdated.toISOString().slice(0, 10) : lastUpdated;
  const date = parseContentDateOnly(reviewDate);
  if (!date) return null;
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - STALE_AFTER_MONTHS);
  if (date >= cutoff) return null;

  let yearsOld = now.getFullYear() - date.getFullYear();
  const anniversary = new Date(date);
  anniversary.setFullYear(now.getFullYear());
  if (anniversary > now) yearsOld -= 1;
  // "More than 0 years old" reads as a bug, so floor at 1 even if the
  // threshold is ever lowered below a year.
  return { reviewDate, yearsOld: Math.max(1, yearsOld) };
}
