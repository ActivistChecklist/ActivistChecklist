/**
 * A small, safe subset of inline Markdown for short translated strings
 * (term definitions): **bold**, *italic* or _italic_, [text](url), and
 * [text](term:slug) for a link to another term's definition.
 *
 * Returns a node tree instead of HTML so the caller renders React elements and
 * nothing in the string can inject markup. Links are kept only when the url is
 * https or site-relative; anything else (javascript:, http:, //host) keeps its
 * text and drops the link.
 */

// One level of balanced parentheses is allowed in urls, e.g. Wikipedia's "(United_States)"
const TOKEN =
  /\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)|\*\*(.+?)\*\*|\*(?!\s)(.+?)\*|(?<!\w)_(?!\s)(.+?)_(?!\w)/g;

/** The slug in a [text](term:slug) link, or null if the href isn't a valid term link. */
export function termLinkSlug(href) {
  const match = href.match(/^term:([a-z0-9-]+)$/);
  return match ? match[1] : null;
}

export function isSafeHref(href) {
  return href.startsWith('https://') || (href.startsWith('/') && !href.startsWith('//'));
}

export function isInternalHref(href) {
  return href.startsWith('/') && !href.startsWith('//');
}

export function parseInlineMarkdown(text) {
  const nodes = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const [whole, linkText, href, bold, starItalic, underscoreItalic] = match;
    if (match.index > last) nodes.push({ type: 'text', value: text.slice(last, match.index) });

    if (linkText !== undefined) {
      const children = parseInlineMarkdown(linkText);
      const slug = termLinkSlug(href);
      if (slug) nodes.push({ type: 'term', slug, children });
      else if (isSafeHref(href)) nodes.push({ type: 'link', href, children });
      else nodes.push(...children);
    } else if (bold !== undefined) {
      nodes.push({ type: 'strong', children: parseInlineMarkdown(bold) });
    } else {
      nodes.push({ type: 'em', children: parseInlineMarkdown(starItalic ?? underscoreItalic) });
    }
    last = match.index + whole.length;
  }
  if (last < text.length) nodes.push({ type: 'text', value: text.slice(last) });
  return nodes;
}

/** Every link url in the string, including unsafe ones that render as plain text. */
export function inlineMarkdownHrefs(text) {
  return [...text.matchAll(TOKEN)].flatMap(([, linkText, href, ...formatted]) => {
    if (linkText !== undefined) return [href, ...inlineMarkdownHrefs(linkText)];
    return inlineMarkdownHrefs(formatted.find((inner) => inner !== undefined));
  });
}
