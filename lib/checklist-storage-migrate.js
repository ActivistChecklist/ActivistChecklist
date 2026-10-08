/**
 * One-time migration: Storyblok checklist items used localStorage keys
 * `checklist-checked-${blok._uid}` / `checklist-expanded-${blok._uid}`.
 * Current keys are slug-based: `checklist-checked-${slug}`.
 *
 * `content/storyblok-id-map.json` maps UUID / _uid → slug. After migration runs,
 * only slug keys remain so the map can be removed from the repo once all users
 * have visited (or we ship a future cleanup that drops the map).
 */

import storyblokIdMap from '../content/storyblok-id-map.json';

/**
 * Copy legacy uid-based keys to slug keys for this item, then remove legacy keys.
 * Safe to call on every mount; no-op if there are no map entries for this slug.
 *
 * @param {string} itemSlug — checklist item slug (current key suffix)
 * @param {Record<string, string>} [idMap] — defaults to bundled storyblok-id-map
 */
export function migrateLegacyChecklistKeysForSlug(itemSlug, idMap = storyblokIdMap) {
  if (typeof window === 'undefined' || !itemSlug || !idMap) return;

  const legacyIds = Object.entries(idMap)
    .filter(([, slug]) => slug === itemSlug)
    .map(([id]) => id);

  if (legacyIds.length === 0) return;

  const ckSlug = `checklist-checked-${itemSlug}`;
  const exSlug = `checklist-expanded-${itemSlug}`;

  try {
    for (const id of legacyIds) {
      const ckOld = `checklist-checked-${id}`;
      const exOld = `checklist-expanded-${id}`;

      if (
        window.localStorage.getItem(ckSlug) === null &&
        window.localStorage.getItem(ckOld) !== null
      ) {
        window.localStorage.setItem(ckSlug, window.localStorage.getItem(ckOld));
      }
      if (
        window.localStorage.getItem(exSlug) === null &&
        window.localStorage.getItem(exOld) !== null
      ) {
        window.localStorage.setItem(exSlug, window.localStorage.getItem(exOld));
      }

      window.localStorage.removeItem(ckOld);
      window.localStorage.removeItem(exOld);
    }
  } catch {
    // private mode / quota — ignore
  }
}
