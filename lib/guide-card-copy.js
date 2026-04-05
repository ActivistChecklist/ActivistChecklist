/**
 * Card blurbs for guide listings: use MDX frontmatter so copy matches the guide
 * page and stays one source of truth per locale (content/en/guides, content/es/guides).
 */

/**
 * @param {{ frontmatter?: { title?: string, excerpt?: string, summary?: string } }} guide - from getAllGuides / getGuide
 * @returns {{ title: string, description: string }}
 */
export function guideToCardCopy(guide) {
  const fm = guide?.frontmatter || {};
  const raw = fm.excerpt ?? fm.summary ?? '';
  const description =
    typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
  return {
    title: typeof fm.title === 'string' ? fm.title : '',
    description,
  };
}
