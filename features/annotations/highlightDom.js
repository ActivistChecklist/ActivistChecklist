import { normalizeQuoteMatchText, scrubAnnotationQuoteText } from '@/lib/annotations/sanitize';

/**
 * Quote-match diagnostics. In the browser console:
 *   window.__ANNOTATION_HIGHLIGHT_DEBUG__ = true   // force logs (e.g. production preview)
 *   window.__ANNOTATION_HIGHLIGHT_DEBUG__ = false  // silence logs in development
 * Default: log when NODE_ENV === 'development' unless explicitly disabled.
 */
export function isAnnotationHighlightDebugEnabled() {
  if (typeof window !== 'undefined' && window.__ANNOTATION_HIGHLIGHT_DEBUG__ === false) {
    return false;
  }
  if (typeof window !== 'undefined' && window.__ANNOTATION_HIGHLIGHT_DEBUG__ === true) {
    return true;
  }
  return typeof process !== 'undefined' && process.env.NODE_ENV === 'development';
}

function snippet(str, head = 96, tail = 48) {
  if (str == null || typeof str !== 'string') {
    return String(str);
  }
  if (str.length <= head + tail + 5) {
    return str;
  }
  return `${str.slice(0, head)} …[${str.length} chars]… ${str.slice(-tail)}`;
}

function logHighlight(stage, payload) {
  if (!isAnnotationHighlightDebugEnabled()) {
    return;
  }
  console.log(`[annotations:highlight] ${stage}`, payload);
}

/** First index where a and b differ; -1 if equal up to min length. */
function firstDiffIndex(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    if (a[i] !== b[i]) {
      return i;
    }
  }
  return a.length === b.length ? -1 : n;
}

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

/** Above this, RegExp construction becomes slow and can fail on some engines. */
const MAX_REGEX_WORDS = 200;

/**
 * Detailed reason long spaced matcher failed (indexOf vs mapping).
 * Must stay below mapNormTrimmedRangeToRawExclusive in source order is not required at runtime.
 */
function logLongQuoteSpacedMiss(spaced, quoteRaw) {
  if (!isAnnotationHighlightDebugEnabled()) {
    return;
  }
  const q = scrubAnnotationQuoteText(quoteRaw);
  if (!q) {
    logHighlight('miss: longQuote+spaced', { reason: 'empty q after scrub' });
    return;
  }
  const normSpaced = normalizeQuoteMatchText(spaced);
  const normIdx = normSpaced.indexOf(q);
  if (normIdx === -1) {
    const take = Math.min(q.length, normSpaced.length);
    const prefixA = normSpaced.slice(0, take);
    const prefixB = q.slice(0, take);
    logHighlight('miss: longQuote+spaced', {
      reason: 'indexOf === -1 (quote not found in normalized spaced DOM text)',
      qLen: q.length,
      normSpacedLen: normSpaced.length,
      firstDiffInComparablePrefix: firstDiffIndex(prefixA, prefixB),
      normSpacedHead: snippet(normSpaced, 160, 80),
      qHead: snippet(q, 160, 80),
    });
    return;
  }
  const span = mapNormTrimmedRangeToRawExclusive(spaced, normIdx, normIdx + q.length);
  if (!span) {
    logHighlight('miss: longQuote+spaced', {
      reason: 'mapNormTrimmedRangeToRawExclusive returned null',
      normIdx,
      qLen: q.length,
    });
  }
}

function logLongQuoteCompactMiss(compact, quoteRaw) {
  if (!isAnnotationHighlightDebugEnabled()) {
    return;
  }
  const q = scrubAnnotationQuoteText(quoteRaw);
  if (!q) {
    logHighlight('miss: longQuote+compact', { reason: 'empty q after scrub' });
    return;
  }
  const normCompact = normalizeQuoteMatchText(compact);
  const normIdx = normCompact.indexOf(q);
  if (normIdx === -1) {
    const take = Math.min(q.length, normCompact.length);
    logHighlight('miss: longQuote+compact', {
      reason: 'indexOf === -1',
      qLen: q.length,
      normCompactLen: normCompact.length,
      firstDiffInComparablePrefix: firstDiffIndex(normCompact.slice(0, take), q.slice(0, take)),
      normCompactHead: snippet(normCompact, 160, 80),
      qHead: snippet(q, 160, 80),
    });
    return;
  }
  const span = mapNormTrimmedRangeToRawExclusive(compact, normIdx, normIdx + q.length);
  if (!span) {
    logHighlight('miss: longQuote+compact', {
      reason: 'mapNormTrimmedRangeToRawExclusive returned null',
      normIdx,
      qLen: q.length,
    });
  }
}

/**
 * Try compact DOM text first (join text nodes). If that fails, try spaced join (simulates
 * block boundaries that appear in selection.toString() / scrubbed quotes).
 */
function findQuoteMatchForDom(textNodes, quoteRaw) {
  const compact = textNodes.map((n) => n.nodeValue).join('');
  const spaced = textNodes.map((n) => n.nodeValue).join(' ');
  const q = scrubAnnotationQuoteText(quoteRaw);

  let match = findFlexibleQuoteMatch(compact, quoteRaw);
  if (match) {
    logHighlight('match: flexibleRegex+compact', { textNodeCount: textNodes.length, mode: 'compact', match });
    return { mode: 'compact', match, compactStart: match.start };
  }
  logHighlight('miss: flexibleRegex+compact', {
    textNodeCount: textNodes.length,
    compactLen: compact.length,
    qLen: q ? q.length : 0,
    regexWordCount: q ? q.split(/\s+/).filter(Boolean).length : 0,
    overRegexWordCap: q ? q.split(/\s+/).filter(Boolean).length > MAX_REGEX_WORDS : false,
  });

  match = findFlexibleQuoteMatch(spaced, quoteRaw);
  if (match) {
    logHighlight('match: flexibleRegex+spaced', { textNodeCount: textNodes.length, mode: 'spaced', match });
    return {
      mode: 'spaced',
      match,
      compactStart: spacedIndexToCompactOffset(textNodes, match.start),
    };
  }
  logHighlight('miss: flexibleRegex+spaced', { spacedLen: spaced.length, qLen: q ? q.length : 0 });

  match = findLongQuoteInSpaced(spaced, quoteRaw);
  if (match) {
    logHighlight('match: longQuote+spaced', { mode: 'spaced', match });
    return {
      mode: 'spaced',
      match,
      compactStart: spacedIndexToCompactOffset(textNodes, match.start),
    };
  }
  logLongQuoteSpacedMiss(spaced, quoteRaw);

  match = findLongQuoteInCompact(compact, quoteRaw);
  if (match) {
    logHighlight('match: longQuote+compact', { mode: 'compact', match });
    return {
      mode: 'compact',
      match,
      compactStart: match.start,
    };
  }
  logLongQuoteCompactMiss(compact, quoteRaw);

  const anchorResult = findQuoteMatchByAnchors(textNodes, spaced, compact, quoteRaw);
  if (anchorResult) {
    logHighlight('match: anchor head+tail', {
      mode: anchorResult.mode,
      match: anchorResult.match,
    });
    return anchorResult;
  }

  logHighlight('miss: all matchers failed', {
    textNodeCount: textNodes.length,
    compactLen: compact.length,
    spacedLen: spaced.length,
    qLen: q ? q.length : 0,
    qHead: q ? snippet(q, 120, 60) : '',
    normCompactHead: snippet(normalizeQuoteMatchText(compact), 120, 60),
    normSpacedHead: snippet(normalizeQuoteMatchText(spaced), 120, 60),
  });
  return null;
}

export function applyDraftQuoteHighlight(root, quoteRaw) {
  if (!root) {
    logHighlight('draft highlight: skip (no root)', {});
    return;
  }
  const quote = String(quoteRaw || '').trim();
  if (!quote) {
    logHighlight('draft highlight: skip (empty quote)', {});
    return;
  }
  const scrubbed = scrubAnnotationQuoteText(quote);
  if (!scrubbed) {
    logHighlight('draft highlight: skip (empty after scrub)', { rawLen: quote.length });
    return;
  }
  const textNodes = collectAnnotationTextNodes(root);
  logHighlight('draft highlight: input', {
    textNodeCount: textNodes.length,
    quoteLen: quote.length,
    scrubbedLen: scrubbed.length,
  });
  const result = findQuoteMatchForDom(textNodes, quote);
  if (!result) {
    logHighlight('draft highlight: abort — no DOM match (no yellow highlight)', {});
    return;
  }
  let wrappedAny = false;
  if (result.mode === 'compact') {
    wrappedAny = wrapMatchAcrossTextNodes(textNodes, result.match.start, result.match.end, (range) => {
      wrapRangeWithDraftQuoteSpan(range);
    });
  } else {
    wrappedAny = wrapMatchAcrossSpacedTextNodes(textNodes, result.match.start, result.match.end, (range) => {
      wrapRangeWithDraftQuoteSpan(range);
    });
  }
  if (!wrappedAny && isAnnotationHighlightDebugEnabled()) {
    console.warn('[annotations:highlight] draft highlight: match found but wrap produced no spans', {
      mode: result.mode,
      match: result.match,
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
 * Walk only the primary article/main region. The annotation `root` wraps the whole page
 * (skip link, nav, footer, etc.); selection and highlights refer to article text only.
 */
function getAnnotationTextSearchRoot(root) {
  if (!root || typeof root.querySelector !== 'function') {
    return root;
  }
  const main =
    root.querySelector('#main-content') ||
    root.querySelector('main[role="main"]') ||
    root.querySelector('article') ||
    root.querySelector('main');
  if (main instanceof HTMLElement && root.contains(main)) {
    return main;
  }
  return root;
}

/**
 * Text nodes in order, excluding scripts only.
 * Include whitespace-only nodes so concatenation matches the DOM.
 */
function collectAnnotationTextNodes(root) {
  const searchRoot = getAnnotationTextSearchRoot(root);
  const nodes = [];
  const walker = document.createTreeWalker(searchRoot, NodeFilter.SHOW_TEXT, {
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
 * Map indices in normalizeQuoteMatchText(raw) back to [start, end) offsets in raw.
 * Mirrors scrubText: control chars to space, then collapse whitespace (same as normalizeQuoteMatchText).
 */
function mapNormTrimmedRangeToRawExclusive(raw, normStart, normEndExclusive) {
  const norm = normalizeQuoteMatchText(raw);
  if (normStart < 0 || normEndExclusive > norm.length || normEndExclusive <= normStart) {
    return null;
  }
  let step1 = '';
  for (let i = 0; i < raw.length; i += 1) {
    let ch = raw[i];
    const c = ch.charCodeAt(0);
    if (c <= 0x1f || c === 0x7f) {
      ch = ' ';
    }
    step1 += ch;
  }
  let collapsed = '';
  const cMap = [];
  for (let i = 0; i < step1.length; i += 1) {
    const ch = step1[i];
    if (/\s/.test(ch)) {
      if (collapsed.length === 0 || collapsed[collapsed.length - 1] !== ' ') {
        collapsed += ' ';
        cMap[collapsed.length - 1] = i;
      }
    } else {
      collapsed += ch;
      cMap[collapsed.length - 1] = i;
    }
  }
  const trimmed = collapsed.trim();
  if (!trimmed.length) {
    return null;
  }
  const lead = collapsed.indexOf(trimmed[0]);
  if (lead < 0) {
    return null;
  }
  const absStart = lead + normStart;
  const absEndChar = lead + normEndExclusive - 1;
  if (absStart < 0 || absStart >= collapsed.length || absEndChar < absStart || absEndChar >= collapsed.length) {
    return null;
  }
  const rawStart = cMap[absStart];
  const rawEnd = cMap[absEndChar] + 1;
  return { start: rawStart, end: rawEnd };
}

/**
 * Long quotes: substring on normalizeQuoteMatchText(spaced) (same pipeline as scrubbed quotes).
 */
function findLongQuoteInSpaced(spaced, quoteRaw) {
  const q = scrubAnnotationQuoteText(quoteRaw);
  if (!q) {
    return null;
  }
  const normSpaced = normalizeQuoteMatchText(spaced);
  const normIdx = normSpaced.indexOf(q);
  if (normIdx === -1) {
    return null;
  }
  const span = mapNormTrimmedRangeToRawExclusive(spaced, normIdx, normIdx + q.length);
  if (!span) {
    return null;
  }
  return { start: span.start, end: span.end };
}

/**
 * When selection omits spaces that join(' ') inserts between nodes (e.g. inline elements), match on compact concat.
 */
function findLongQuoteInCompact(compact, quoteRaw) {
  const q = scrubAnnotationQuoteText(quoteRaw);
  if (!q) {
    return null;
  }
  const normCompact = normalizeQuoteMatchText(compact);
  const normIdx = normCompact.indexOf(q);
  if (normIdx === -1) {
    return null;
  }
  const span = mapNormTrimmedRangeToRawExclusive(compact, normIdx, normIdx + q.length);
  if (!span) {
    return null;
  }
  return { start: span.start, end: span.end };
}

/** When full quote is not a substring (e.g. duplicated accordion lines in selection), match head+tail. */
const ANCHOR_HEAD_CHARS = 96;
const ANCHOR_TAIL_CHARS = 96;
const ANCHOR_MIN_QUOTE_LEN = ANCHOR_HEAD_CHARS + ANCHOR_TAIL_CHARS + 64;

function findQuoteMatchByAnchors(textNodes, spaced, compact, quoteRaw) {
  const q = scrubAnnotationQuoteText(quoteRaw);
  if (!q || q.length < ANCHOR_MIN_QUOTE_LEN) {
    return null;
  }
  const head = q.slice(0, ANCHOR_HEAD_CHARS);
  const tail = q.slice(-ANCHOR_TAIL_CHARS);

  const tryRaw = (raw, mode) => {
    const norm = normalizeQuoteMatchText(raw);
    const start = norm.indexOf(head);
    if (start === -1) {
      return null;
    }
    const tailAt = norm.indexOf(tail, start + ANCHOR_HEAD_CHARS);
    if (tailAt === -1) {
      return null;
    }
    const endExclusive = tailAt + tail.length;
    if (endExclusive <= start) {
      return null;
    }
    const span = mapNormTrimmedRangeToRawExclusive(raw, start, endExclusive);
    if (!span) {
      return null;
    }
    if (mode === 'spaced') {
      return {
        mode: 'spaced',
        match: span,
        compactStart: spacedIndexToCompactOffset(textNodes, span.start),
      };
    }
    return {
      mode: 'compact',
      match: span,
      compactStart: span.start,
    };
  };

  return tryRaw(spaced, 'spaced') || tryRaw(compact, 'compact');
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
