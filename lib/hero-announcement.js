/** How many days a major changelog entry stays in the homepage hero. */
export const HERO_ANNOUNCEMENT_MAX_AGE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The changelog entry to announce in the homepage hero: the newest major one,
 * as long as it went out within `maxAgeDays`. Past that it only shows in the
 * recent updates list, so an old "New page" line doesn't sit in the hero for
 * months when nothing major has shipped since.
 *
 * The homepage is built at deploy time, so `now` is the build time and an
 * entry can stay up a little past the cutoff until the next deploy.
 *
 * @param {Array<{ type: string, created_at?: string }>} entries - newest first
 * @param {number} now - ms since epoch
 * @param {number} maxAgeDays
 * @returns {object | null}
 */
export function pickHeroAnnouncement(
  entries,
  now = Date.now(),
  maxAgeDays = HERO_ANNOUNCEMENT_MAX_AGE_DAYS,
) {
  const latest = entries.find((entry) => entry.type === 'major');
  if (!latest) return null;
  const published = Date.parse(latest.created_at);
  if (Number.isNaN(published)) return null;
  return now - published <= maxAgeDays * DAY_MS ? latest : null;
}
