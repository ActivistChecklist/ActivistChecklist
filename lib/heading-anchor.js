/**
 * Anchor ids for headings that have no `{#id}` marker (see lib/mdx-heading-ids.js).
 * The "On this page" table of contents assigns these client-side.
 *
 * Latin-script headings keep the original ASCII slug, so existing /es/, /fr/
 * and /it/ anchors stay the same even though accents get dropped ("Qué hacer"
 * → "qu-hacer"). Headings with any non-Latin letters (Japanese, Arabic, ...)
 * keep those letters instead. The ASCII slug would reduce "パスワードマネージャー"
 * to an empty id and "VPNの使い方" to just "vpn".
 */

const NON_LATIN_LETTER_RE = /(?!\p{Script=Latin})\p{L}/u;

export function headingAnchorId(text) {
  const lower = String(text ?? '').toLowerCase();
  if (NON_LATIN_LETTER_RE.test(lower)) {
    return lower.replace(/[^\p{L}\p{M}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
  }
  return lower.replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
}

/**
 * Pick an id for each heading: its existing id if it has one, otherwise
 * headingAnchorId(text). Generated ids never repeat an id already used on the
 * page (a "-2", "-3" suffix is added), and a heading with no letters or digits
 * gets "section-N" from its position.
 *
 * @param {{ id?: string, text: string }[]} headings in document order
 * @returns {string[]} one id per heading
 */
export function assignHeadingIds(headings) {
  const used = new Set(headings.map((h) => h.id).filter(Boolean));
  return headings.map((heading, index) => {
    if (heading.id) return heading.id;
    const base = headingAnchorId(heading.text) || `section-${index + 1}`;
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    return id;
  });
}
