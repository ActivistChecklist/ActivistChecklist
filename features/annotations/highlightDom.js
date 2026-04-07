import { scrubAnnotationQuoteText } from '@/lib/annotations/sanitize';

export function clearThreadHighlights(root) {
  if (!root) {
    return;
  }
  threadHoverCounts.clear();
  const highlights = root.querySelectorAll('span[data-annotation-thread-id]');
  highlights.forEach((node) => {
    const parent = node.parentNode;
    if (!parent) {
      return;
    }
    parent.replaceChild(document.createTextNode(node.textContent || ''), node);
    parent.normalize();
  });
}

/** Inline quote highlights (thread spans + draft quote); same palette as setActiveHighlightInRoot / attachHighlightSpan */
const ANNOTATION_HIGHLIGHT_INACTIVE = 'rgba(251, 191, 36, 0.35)';
const ANNOTATION_HIGHLIGHT_ACTIVE = 'rgba(245, 158, 11, 0.62)';
const ANNOTATION_HIGHLIGHT_ACTIVE_HOVER = 'rgba(245, 158, 11, 0.72)';
const ANNOTATION_HIGHLIGHT_INACTIVE_HOVER = 'rgba(245, 158, 11, 0.5)';
const threadHoverCounts = new Map();

export function clearDraftQuoteHighlights(root) {
  if (!root) {
    return;
  }
  const drafts = root.querySelectorAll('span[data-annotation-draft]');
  drafts.forEach((node) => {
    const parent = node.parentNode;
    if (!parent) {
      return;
    }
    parent.replaceChild(document.createTextNode(node.textContent || ''), node);
    parent.normalize();
  });
}

function attachDraftQuoteSpan(span) {
  span.dataset.annotationDraft = 'true';
  span.style.setProperty('background-color', ANNOTATION_HIGHLIGHT_ACTIVE, 'important');
  span.style.borderRadius = '2px';
  span.style.boxDecorationBreak = 'clone';
  span.style.webkitBoxDecorationBreak = 'clone';
  span.title = '';
  span.addEventListener('mouseenter', () => {
    span.style.setProperty('background-color', ANNOTATION_HIGHLIGHT_ACTIVE_HOVER, 'important');
  });
  span.addEventListener('mouseleave', () => {
    span.style.setProperty('background-color', ANNOTATION_HIGHLIGHT_ACTIVE, 'important');
  });
}

function wrapRangeWithDraftQuoteSpan(range) {
  const span = document.createElement('span');
  attachDraftQuoteSpan(span);
  try {
    range.surroundContents(span);
  } catch (_err) {
    const frag = range.extractContents();
    span.appendChild(frag);
    range.insertNode(span);
  }
}

function wrapMatchAcrossTextNodes(textNodes, matchStart, matchEnd, wrapRange) {
  if (!Array.isArray(textNodes) || textNodes.length === 0 || matchEnd <= matchStart) {
    return false;
  }
  let wrappedAny = false;
  let cursor = 0;
  for (const node of textNodes) {
    const len = node.nodeValue.length;
    const nodeStart = cursor;
    const nodeEnd = cursor + len;
    cursor = nodeEnd;
    if (matchEnd <= nodeStart) {
      break;
    }
    if (matchStart >= nodeEnd) {
      continue;
    }
    const localStart = Math.max(0, matchStart - nodeStart);
    const localEnd = Math.min(len, matchEnd - nodeStart);
    if (localEnd <= localStart) {
      continue;
    }
    const segmentRange = document.createRange();
    segmentRange.setStart(node, localStart);
    segmentRange.setEnd(node, localEnd);
    wrapRange(segmentRange);
    wrappedAny = true;
  }
  return wrappedAny;
}

/**
 * Offsets are in "spaced" string: textNodes.map(n => n.nodeValue).join(' ');
 * Used when selection.toString() inserts word boundaries between blocks but join('') does not.
 */
function wrapMatchAcrossSpacedTextNodes(textNodes, matchStart, matchEnd, wrapRange) {
  if (!Array.isArray(textNodes) || textNodes.length === 0 || matchEnd <= matchStart) {
    return false;
  }
  let wrappedAny = false;
  let cursor = 0;
  for (let i = 0; i < textNodes.length; i += 1) {
    const node = textNodes[i];
    const len = node.nodeValue.length;
    const nodeStart = cursor;
    const nodeEnd = cursor + len;
    cursor = nodeEnd;
    if (i < textNodes.length - 1) {
      cursor += 1;
    }
    if (matchEnd <= nodeStart) {
      break;
    }
    if (matchStart >= nodeEnd) {
      continue;
    }
    const localStart = Math.max(0, matchStart - nodeStart);
    const localEnd = Math.min(len, matchEnd - nodeStart);
    if (localEnd <= localStart) {
      continue;
    }
    const segmentRange = document.createRange();
    segmentRange.setStart(node, localStart);
    segmentRange.setEnd(node, localEnd);
    wrapRange(segmentRange);
    wrappedAny = true;
  }
  return wrappedAny;
}

/** First character index in compact join('') for a given index into spaced join(' '). */
function spacedIndexToCompactOffset(textNodes, spacedIndex) {
  let s = 0;
  for (let i = 0; i < textNodes.length; i += 1) {
    const len = textNodes[i].nodeValue.length;
    if (spacedIndex < s + len) {
      let compact = 0;
      for (let j = 0; j < i; j += 1) {
        compact += textNodes[j].nodeValue.length;
      }
      return compact + (spacedIndex - s);
    }
    s += len;
    if (i < textNodes.length - 1) {
      s += 1;
    }
  }
  return 0;
}

/**
 * Try compact DOM text first (join text nodes). If that fails, try spaced join (simulates
 * block boundaries that appear in selection.toString() / scrubbed quotes).
 */
function findQuoteMatchForDom(textNodes, quoteRaw) {
  const compact = textNodes.map((n) => n.nodeValue).join('');
  let match = findFlexibleQuoteMatch(compact, quoteRaw);
  if (match) {
    return { mode: 'compact', match, compactStart: match.start };
  }
  const spaced = textNodes.map((n) => n.nodeValue).join(' ');
  match = findFlexibleQuoteMatch(spaced, quoteRaw);
  if (match) {
    return {
      mode: 'spaced',
      match,
      compactStart: spacedIndexToCompactOffset(textNodes, match.start),
    };
  }
  match = findLongQuoteInSpaced(spaced, quoteRaw);
  if (match) {
    return {
      mode: 'spaced',
      match,
      compactStart: spacedIndexToCompactOffset(textNodes, match.start),
    };
  }
  return null;
}

export function applyDraftQuoteHighlight(root, quoteRaw) {
  if (!root) {
    return;
  }
  const quote = String(quoteRaw || '').trim();
  if (!quote || !scrubAnnotationQuoteText(quote)) {
    return;
  }
  const textNodes = collectAnnotationTextNodes(root);
  const result = findQuoteMatchForDom(textNodes, quote);
  if (!result) {
    return;
  }
  if (result.mode === 'compact') {
    wrapMatchAcrossTextNodes(textNodes, result.match.start, result.match.end, (range) => {
      wrapRangeWithDraftQuoteSpan(range);
    });
  } else {
    wrapMatchAcrossSpacedTextNodes(textNodes, result.match.start, result.match.end, (range) => {
      wrapRangeWithDraftQuoteSpan(range);
    });
  }
}

export function setActiveHighlightInRoot(root, activeThreadId) {
  if (!root) {
    return;
  }
  const highlights = root.querySelectorAll('span[data-annotation-thread-id]');
  highlights.forEach((node) => {
    const isActive = node.dataset.annotationThreadId === activeThreadId;
    node.dataset.annotationActive = isActive ? 'true' : 'false';
    node.style.setProperty(
      'background-color',
      isActive ? ANNOTATION_HIGHLIGHT_ACTIVE : ANNOTATION_HIGHLIGHT_INACTIVE,
      'important'
    );
  });
}

export function escapeAttrValue(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function computeSelectionPromptPosition(rect) {
  const margin = 8;
  const gap = 8;
  const approxBtnHeight = 40;
  const approxBtnWidth = 148;
  let top = rect.bottom + gap;
  if (top + approxBtnHeight > window.innerHeight - margin) {
    top = Math.max(margin, rect.top - gap - approxBtnHeight);
  }
  let left = rect.left;
  left = Math.max(margin, Math.min(left, window.innerWidth - approxBtnWidth - margin));
  return { top, left };
}

/** Some browsers return a zero rect for very large multi-block ranges; union client rects instead. */
export function rangeAnchorRect(range) {
  if (!range) {
    return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
  }
  const rect = range.getBoundingClientRect();
  if (rect.width > 0 || rect.height > 0) {
    return rect;
  }
  const rects = range.getClientRects();
  if (rects.length === 0) {
    return rect;
  }
  let top = Infinity;
  let left = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (let i = 0; i < rects.length; i += 1) {
    const r = rects[i];
    if (r.width === 0 && r.height === 0) {
      continue;
    }
    top = Math.min(top, r.top);
    left = Math.min(left, r.left);
    right = Math.max(right, r.right);
    bottom = Math.max(bottom, r.bottom);
  }
  if (top === Infinity) {
    return rects[0];
  }
  return {
    top,
    left,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

export function expandCollapsedAncestorsForNode(node) {
  if (!node || typeof document === 'undefined') {
    return;
  }
  const ancestors = [];
  let current = node.parentElement;
  while (current && current !== document.body) {
    ancestors.push(current);
    current = current.parentElement;
  }

  ancestors.reverse().forEach((ancestor) => {
    if (ancestor.tagName === 'DETAILS' && !ancestor.open) {
      ancestor.open = true;
    }
    if (!ancestor.id) {
      return;
    }
    const id = escapeAttrValue(ancestor.id);
    const trigger = document.querySelector(
      `[aria-controls="${id}"][aria-expanded="false"]`
    );
    if (trigger instanceof HTMLElement) {
      trigger.click();
    }
  });
}

function escapeRegexChars(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Text nodes in order, excluding scripts only.
 * Include whitespace-only nodes so concatenation matches the DOM.
 */
function collectAnnotationTextNodes(root) {
  const nodes = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parentTag = node.parentElement?.tagName;
      if (parentTag === 'SCRIPT' || parentTag === 'STYLE' || parentTag === 'NOSCRIPT') {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  while (walker.nextNode()) {
    nodes.push(walker.currentNode);
  }
  return nodes;
}

/** Above this, RegExp construction becomes slow and can fail on some engines. */
const MAX_REGEX_WORDS = 200;

function findFlexibleQuoteMatch(fullText, quoteRaw) {
  const q = scrubAnnotationQuoteText(quoteRaw);
  if (!q) {
    return null;
  }
  const parts = q.split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return null;
  }
  if (parts.length > MAX_REGEX_WORDS) {
    return null;
  }
  const pattern = parts.map(escapeRegexChars).join('\\s+');
  const re = new RegExp(pattern, 'u');
  const m = re.exec(fullText);
  if (!m) {
    return null;
  }
  return { start: m.index, end: m.index + m[0].length };
}

/**
 * Map indices in spaced.replace(/\s+/g, ' ').trim() back to offsets in the original spaced string.
 */
function mapTrimmedNormRangeToSpacedExclusive(spaced, normStart, normEndExclusive) {
  let norm = '';
  const charStart = [];
  for (let i = 0; i < spaced.length; i += 1) {
    const ch = spaced[i];
    if (/\s/.test(ch)) {
      if (norm.length === 0 || norm[norm.length - 1] !== ' ') {
        norm += ' ';
        charStart[norm.length - 1] = i;
      }
    } else {
      norm += ch;
      charStart[norm.length - 1] = i;
    }
  }
  const trimmed = norm.trim();
  if (!trimmed.length) {
    return null;
  }
  const lead = norm.indexOf(trimmed[0]);
  if (lead < 0) {
    return null;
  }
  const absStart = lead + normStart;
  const absEndChar = lead + normEndExclusive - 1;
  if (absStart < 0 || absStart >= norm.length || absEndChar < absStart || absEndChar >= norm.length) {
    return null;
  }
  return { start: charStart[absStart], end: charStart[absEndChar] + 1 };
}

/**
 * Long quotes: substring match on normalized spaced text (avoids giant regex).
 */
function findLongQuoteInSpaced(spaced, quoteRaw) {
  const q = scrubAnnotationQuoteText(quoteRaw);
  if (!q) {
    return null;
  }
  const normSpaced = spaced.replace(/\s+/g, ' ').trim();
  const normIdx = normSpaced.indexOf(q);
  if (normIdx === -1) {
    return null;
  }
  const normEndExclusive = normIdx + q.length;
  const span = mapTrimmedNormRangeToSpacedExclusive(spaced, normIdx, normEndExclusive);
  if (!span) {
    return null;
  }
  return { start: span.start, end: span.end };
}

function attachHighlightSpan(span, thread, onThreadClick) {
  span.dataset.annotationThreadId = thread.id;
  span.style.setProperty('background-color', ANNOTATION_HIGHLIGHT_INACTIVE, 'important');
  span.style.borderRadius = '2px';
  span.style.cursor = 'pointer';
  span.style.transition = 'background-color 120ms ease';
  span.style.boxDecorationBreak = 'clone';
  span.style.webkitBoxDecorationBreak = 'clone';
  span.dataset.annotationActive = 'false';
  span.title = 'Open comment';
  span.addEventListener('mouseenter', () => {
    const nextCount = (threadHoverCounts.get(thread.id) || 0) + 1;
    threadHoverCounts.set(thread.id, nextCount);
    const allThreadSpans = document.querySelectorAll(
      `span[data-annotation-thread-id="${escapeAttrValue(thread.id)}"]`
    );
    allThreadSpans.forEach((node) => {
      const isActive = node.dataset.annotationActive === 'true';
      node.style.setProperty(
        'background-color',
        isActive ? ANNOTATION_HIGHLIGHT_ACTIVE_HOVER : ANNOTATION_HIGHLIGHT_INACTIVE_HOVER,
        'important'
      );
    });
  });
  span.addEventListener('mouseleave', () => {
    const currentCount = threadHoverCounts.get(thread.id) || 0;
    const nextCount = Math.max(0, currentCount - 1);
    if (nextCount > 0) {
      threadHoverCounts.set(thread.id, nextCount);
      return;
    }
    threadHoverCounts.delete(thread.id);
    const allThreadSpans = document.querySelectorAll(
      `span[data-annotation-thread-id="${escapeAttrValue(thread.id)}"]`
    );
    allThreadSpans.forEach((node) => {
      const isActive = node.dataset.annotationActive === 'true';
      node.style.setProperty(
        'background-color',
        isActive ? ANNOTATION_HIGHLIGHT_ACTIVE : ANNOTATION_HIGHLIGHT_INACTIVE,
        'important'
      );
    });
  });
  span.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onThreadClick(thread);
  });
}

function wrapRangeWithHighlightSpan(range, thread, onThreadClick) {
  const span = document.createElement('span');
  attachHighlightSpan(span, thread, onThreadClick);
  try {
    range.surroundContents(span);
  } catch (_err) {
    const frag = range.extractContents();
    span.appendChild(frag);
    range.insertNode(span);
  }
}

/** Same character-offset space as threadOrderById (excludes thread highlight spans). */
export function computeQuoteDocumentOrder(root, quoteRaw) {
  if (!root) {
    return null;
  }
  const quote = String(quoteRaw || '').trim();
  if (!quote || !scrubAnnotationQuoteText(quote)) {
    return null;
  }
  const textNodes = collectAnnotationTextNodes(root);
  const result = findQuoteMatchForDom(textNodes, quote);
  if (!result) {
    return null;
  }
  return result.compactStart;
}

export function applyThreadHighlights(root, threads, onThreadClick) {
  if (!root) {
    return {};
  }

  clearDraftQuoteHighlights(root);
  clearThreadHighlights(root);
  const orderByThreadId = {};
  const highlightableThreads = threads.filter(
    (t) => t && (t.status || 'open') !== 'resolved'
  );
  const sortedThreads = [...highlightableThreads].sort(
    (a, b) => String(b.quote_text || '').length - String(a.quote_text || '').length
  );

  for (const thread of sortedThreads) {
    const quoteRaw = thread.quote_text;
    if (!scrubAnnotationQuoteText(quoteRaw)) {
      continue;
    }
    const textNodes = collectAnnotationTextNodes(root);
    const result = findQuoteMatchForDom(textNodes, quoteRaw);
    if (!result) {
      continue;
    }
    orderByThreadId[thread.id] = result.compactStart;
    if (result.mode === 'compact') {
      wrapMatchAcrossTextNodes(textNodes, result.match.start, result.match.end, (range) => {
        wrapRangeWithHighlightSpan(range, thread, onThreadClick);
      });
    } else {
      wrapMatchAcrossSpacedTextNodes(textNodes, result.match.start, result.match.end, (range) => {
        wrapRangeWithHighlightSpan(range, thread, onThreadClick);
      });
    }
  }
  return orderByThreadId;
}
