/**
 * Page titles often end with the publication's name ("... - The American
 * Prospect", "... | TechCrunch"). News items already show the source next to
 * the title, so it would appear twice. This drops the trailing name when it
 * matches the item's source.
 *
 * CommonJS so scripts/news-wizard.js can require it as well as lib/content.js.
 *
 * @param {string} title
 * @param {string | null | undefined} source
 * @returns {string}
 */
function stripSourceSuffix(title, source) {
  if (!title || !source) return title;
  const name = String(source).trim();
  if (!name) return title;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Separators: hyphen, pipe, en dash (U+2013) and em dash (U+2014).
  const stripped = title
    .replace(new RegExp(`\\s+[-|\\u2013\\u2014]\\s+${escaped}\\s*$`, 'i'), '')
    .trim();
  // Never strip a title down to nothing.
  return stripped || title;
}

module.exports = { stripSourceSuffix };
