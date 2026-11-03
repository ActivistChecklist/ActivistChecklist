/**
 * `relatedGuides` frontmatter as a list of slugs. It can name guides and
 * pages alike; RelatedGuides shows a guide as a checklist card and a page as a
 * reading card (lib/nav-copy.js getRelatedPages).
 *
 * @param {string[] | string | undefined} value - a YAML list, or a comma-separated string
 * @returns {string[]}
 */
export function parseRelatedGuides(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value !== 'string') return [];
  return value
    .split(',')
    .map((slug) => slug.trim())
    .filter(Boolean);
}
