import { getPage } from '@/lib/content';
import { readingMinutes, slugFromHref } from '@/lib/checklist-sections';
import navData from '@/config/navigation.json';

/**
 * Reading time, in minutes, for every explainer and how-to the checklist
 * sections link to, keyed by navigation item key. Server-only: it reads the
 * MDX bodies, and the result is a plain object safe to pass to client
 * components. Printables are skipped because "5 min read" means nothing for a
 * poster.
 *
 * @param {string} locale
 * @returns {Record<string, number>}
 */
export function getSectionReadMinutes(locale) {
  const keys = new Set(
    navData.checklistSections.flatMap((section) => [...section.featured, ...section.reads]),
  );
  const minutes = {};
  for (const key of keys) {
    const item = navData.items[key];
    if (!item?.kind || item.kind === 'printable') continue;
    const page = getPage(slugFromHref(item.href), locale);
    if (page) minutes[key] = readingMinutes(page.content);
  }
  return minutes;
}
