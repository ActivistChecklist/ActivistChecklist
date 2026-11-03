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
 * - Indented headings (e.g. inside a `<Section>`) are handled too; the
 *   indentation is kept on the rewritten line.
 * - The id must be word characters and hyphens (`[\w-]+`), no spaces.
 * - Lines inside fenced code blocks (``` or ~~~) are never rewritten.
 */

// Heading line with a trailing `{#id}` marker. `.*?` keeps the heading text,
// which may itself contain markdown that MDX will render.
const HEADING_ID_RE = /^([ \t]*)(#{1,6})[ \t]+(.*?)[ \t]*\{#([\w-]+)\}[ \t]*$/;

// The marker on a heading line, bare or escaped as `\{#id}` (which MDX reads
// as plain text). Used to switch between the two for the Keystatic editor.
const BARE_MARKER_RE = /^([ \t]*#{1,6}[ \t]+.*?)(?<!\\)\{#([\w-]+)\}([ \t]*)$/;
const ESCAPED_MARKER_RE = /^([ \t]*#{1,6}[ \t]+.*?)\\\{#([\w-]+)\\?\}([ \t]*)$/;

// Runs `fn` on every line outside fenced code blocks (``` or ~~~).
function mapLinesOutsideFences(source, fn) {
  const lines = source.split('\n');
  let inFence = false;
  let fenceMarker = null;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    const fenceMatch = trimmed.match(/^(```+|~~~+)/);
    if (fenceMatch) {
      if (!inFence) {
        inFence = true;
        fenceMarker = fenceMatch[1];
      } else if (trimmed.startsWith(fenceMarker)) {
        inFence = false;
        fenceMarker = null;
      }
      continue;
    }
    if (inFence) continue;

    lines[i] = fn(lines[i]);
  }

  return lines.join('\n');
}

export function applyHeadingIds(source) {
  // Fast path: nothing to do if the marker can't be present.
  if (!source || typeof source !== 'string' || !source.includes('{#')) {
    return source;
  }

  return mapLinesOutsideFences(source, (line) => {
    const match = line.match(HEADING_ID_RE);
    if (!match) return line;
    const indent = match[1];
    const level = match[2].length;
    const text = match[3];
    const id = match[4];
    // Pad with blank lines so MDX always parses the raw heading as a
    // standalone block. Without the surrounding blank lines, a raw <h2>
    // adjacent to a text line is parsed as inline HTML and wrapped in a
    // <p>, which is invalid (<h2> inside <p>) and breaks hydration.
    return `\n${indent}<h${level} id="${id}">${text}</h${level}>\n`;
  });
}

/**
 * The Keystatic editor parses the raw file as MDX too, with no hook like the
 * one above, and refuses to open an entry with a bare `{#id}`. Its body fields
 * (keystatic.config.tsx) run this before the editor parses, so the marker
 * shows up as `{#id}` text in the heading, and unescapeHeadingIds on what the
 * editor saves, so files keep the bare form.
 */
export function escapeHeadingIds(source) {
  if (!source.includes('{#')) return source;
  return mapLinesOutsideFences(source, (line) => line.replace(BARE_MARKER_RE, '$1\\{#$2}$3'));
}

export function unescapeHeadingIds(source) {
  if (!source.includes('\\{#')) return source;
  return mapLinesOutsideFences(source, (line) => line.replace(ESCAPED_MARKER_RE, '$1{#$2}$3'));
}
