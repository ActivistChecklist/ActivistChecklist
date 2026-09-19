/**
 * Split a guide MDX body at the point where the inline CTA should be
 * auto-inserted, so the CTA can be rendered between two separately-serialized
 * halves of the body. Used by app/[locale]/[...slug]/page.tsx.
 *
 * Only guides get the auto-inserted CTA; pages do not. The splitter bails out
 * (didSplit: false) if the content already contains a manual <InlineCta />
 * placement, so editors can override the auto location.
 */

const MANUAL_CTA_RE = /<InlineCta\b/;

/** Find matching closing tag for an opening Section tag, accounting for nesting. */
function findSectionEnd(content, openTagEndIdx) {
  const openRe = /<Section\b/g;
  const closeRe = /<\/Section>/g;
  openRe.lastIndex = openTagEndIdx;
  closeRe.lastIndex = openTagEndIdx;
  let depth = 1;
  while (depth > 0) {
    const nextOpen = openRe.exec(content);
    const nextClose = closeRe.exec(content);
    if (!nextClose) return -1;
    if (nextOpen && nextOpen.index < nextClose.index) {
      depth += 1;
      closeRe.lastIndex = nextOpen.index + 1;
    } else {
      depth -= 1;
      if (depth === 0) return nextClose.index + '</Section>'.length;
      openRe.lastIndex = nextClose.index + 1;
    }
  }
  return -1;
}

/**
 * Split guide MDX body at the first <Section> whose contents include
 * a <ChecklistItem> or <ChecklistItemGroup>. Sections that are pure text
 * (e.g. an introductory section) are skipped — the CTA only appears after
 * the reader has scrolled past actual checklist content.
 *
 * Input: the body chunk that starts at the first <Section (already split
 * out from frontmatter and the pre-section intro by the page route).
 * Returns { beforeCta, afterCta, didSplit }.
 */
export function splitGuideBodyForCta(content) {
  if (!content || typeof content !== 'string') {
    return { beforeCta: content || '', afterCta: '', didSplit: false };
  }
  if (MANUAL_CTA_RE.test(content)) {
    return { beforeCta: content, afterCta: '', didSplit: false };
  }

  const openTagRe = /<Section\b[^>]*>/g;
  let match;
  while ((match = openTagRe.exec(content)) !== null) {
    const openEnd = match.index + match[0].length;
    const closeEnd = findSectionEnd(content, openEnd);
    if (closeEnd === -1) break;
    const inner = content.slice(openEnd, closeEnd - '</Section>'.length);
    if (/<ChecklistItem\b|<ChecklistItemGroup\b/.test(inner)) {
      return {
        beforeCta: content.slice(0, closeEnd).trim(),
        afterCta: content.slice(closeEnd).trim(),
        didSplit: true,
      };
    }
    openTagRe.lastIndex = closeEnd;
  }

  return { beforeCta: content, afterCta: '', didSplit: false };
}
