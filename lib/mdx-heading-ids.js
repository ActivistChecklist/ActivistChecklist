/**
 * Support `## Heading text {#custom-id}` syntax in MDX content.
 *
 * MDX parses `{...}` as a JavaScript expression, so a trailing `{#id}` on a
 * heading throws at compile time ("Could not parse expression with acorn").
 * That happens during parsing, before any remark transform runs, so this can't
 * be fixed with a remark plugin. Instead we rewrite the raw source: a heading
 * line ending in `{#id}` becomes a raw HTML heading carrying that id.
 *
 * Inline markdown inside the heading (bold, links, emoji) is still parsed by
 * MDX because children of JSX/HTML elements are treated as MDX. Headings
 * without the marker are left untouched — their ids are auto-derived from the
 * heading text client-side by the "On this page" table of contents.
 *
 * Example:
 *   `## Downsides to using a VPN {#downsides}`
 *   becomes
 *   `<h2 id="downsides">Downsides to using a VPN</h2>`
 *
 * Notes:
 * - Only ATX headings (`#`..`######`) are handled.
 * - The id must be word characters and hyphens (`[\w-]+`), no spaces.
 * - Lines inside fenced code blocks (``` or ~~~) are never rewritten.
 */

// Heading line with a trailing `{#id}` marker. `.*?` keeps the heading text,
// which may itself contain markdown that MDX will render.
const HEADING_ID_RE = /^(#{1,6})[ \t]+(.*?)[ \t]*\{#([\w-]+)\}[ \t]*$/;

export function applyHeadingIds(source) {
  // Fast path: nothing to do if the marker can't be present.
  if (!source || typeof source !== 'string' || !source.includes('{#')) {
    return source;
  }

  const lines = source.split('\n');
  let inFence = false;
  let fenceMarker = null;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // Track fenced code blocks so headings inside them are left alone.
    const fenceMatch = trimmed.match(/^(```+|~~~+)/);
    if (fenceMatch) {
      if (!inFence) {
        inFence = true;
        fenceMarker = fenceMatch[1][0];
      } else if (trimmed.startsWith(fenceMarker)) {
        inFence = false;
        fenceMarker = null;
      }
      continue;
    }
    if (inFence) continue;

    const match = lines[i].match(HEADING_ID_RE);
    if (match) {
      const level = match[1].length;
      const text = match[2];
      const id = match[3];
      lines[i] = `<h${level} id="${id}">${text}</h${level}>`;
    }
  }

  return lines.join('\n');
}
