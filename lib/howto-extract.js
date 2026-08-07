/**
 * Extract `<HowTo>...</HowTo>` blocks from a checklist item's MDX source.
 *
 * Returns the concatenation of all top-level HowTo blocks (separated by blank lines)
 * so the compact view can render just those, or `null` if the source has none.
 *
 * The regex is intentionally simple — it doesn't try to handle `>` characters inside
 * attribute values, because our content uses simple titles ("How to do X"). HowTos
 * are also not expected to be nested.
 */
const HOWTO_PATTERN = '<HowTo\\b[^>]*>[\\s\\S]*?<\\/HowTo>';
const HOWTO_TITLE_ATTR = /\s+title="[^"]*"/;

/**
 * Strip the `title` attribute from a single `<HowTo ...>` opening tag.
 * In single-HowTo items the title is redundant with the checklist item title;
 * in multi-HowTo items we keep the titles so the blocks can be distinguished.
 */
function stripTitleAttribute(howToBlock) {
  return howToBlock.replace(/^<HowTo\b[^>]*>/, (openingTag) =>
    openingTag.replace(HOWTO_TITLE_ATTR, ''),
  );
}

export function extractHowToBlocks(mdxSource) {
  if (typeof mdxSource !== 'string' || mdxSource.length === 0) return null;
  const matches = mdxSource.match(new RegExp(HOWTO_PATTERN, 'g'));
  if (!matches || matches.length === 0) return null;
  // Single HowTo: drop its title (the item title already says what it is).
  // Multiple HowTos: keep titles so blocks can be told apart.
  if (matches.length === 1) {
    return stripTitleAttribute(matches[0]);
  }
  return matches.join('\n\n');
}

export function hasHowToBlock(mdxSource) {
  if (typeof mdxSource !== 'string' || mdxSource.length === 0) return false;
  return new RegExp(HOWTO_PATTERN).test(mdxSource);
}
