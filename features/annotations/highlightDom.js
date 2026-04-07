import { scrubAnnotationQuoteText } from '@/lib/annotations/sanitize';

export function clearThreadHighlights(root) {
  if (!root) {
    return;
  }
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

export function applyDraftQuoteHighlight(root, quoteRaw) {
  if (!root) {
    return;
  }
  const quote = String(quoteRaw || '').trim();
  if (!quote || !scrubAnnotationQuoteText(quote)) {
    return;
  }
  const textNodes = collectAnnotationTextNodes(root);
  const fullText = textNodes.map((n) => n.nodeValue).join('');
  const match = findFlexibleQuoteMatch(fullText, quote);
  if (!match) {
    return;
  }
  const startPoint = mapGlobalOffsetToPoint(textNodes, match.start);
  const endPoint = mapGlobalOffsetToPoint(textNodes, match.end);
  if (!startPoint || !endPoint) {
    return;
  }
  const range = document.createRange();
  range.setStart(startPoint.node, startPoint.offset);
  range.setEnd(endPoint.node, endPoint.offset);
  wrapRangeWithDraftQuoteSpan(range);
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
 * Text nodes in order, excluding scripts and text inside thread highlights.
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
      if (node.parentElement?.closest('[data-annotation-thread-id]')) {
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
  const pattern = parts.map(escapeRegexChars).join('\\s+');
  const re = new RegExp(pattern, 'u');
  const m = re.exec(fullText);
  if (!m) {
    return null;
  }
  return { start: m.index, end: m.index + m[0].length };
}

function mapGlobalOffsetToPoint(nodes, pos) {
  let cum = 0;
  for (const node of nodes) {
    const len = node.nodeValue.length;
    if (pos < cum + len) {
      return { node, offset: pos - cum };
    }
    cum += len;
  }
  if (nodes.length > 0 && pos === cum) {
    const last = nodes[nodes.length - 1];
    return { node: last, offset: last.nodeValue.length };
  }
  return null;
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
    const isActive = span.dataset.annotationActive === 'true';
    span.style.setProperty(
      'background-color',
      isActive ? ANNOTATION_HIGHLIGHT_ACTIVE_HOVER : ANNOTATION_HIGHLIGHT_INACTIVE_HOVER,
      'important'
    );
  });
  span.addEventListener('mouseleave', () => {
    const isActive = span.dataset.annotationActive === 'true';
    span.style.setProperty(
      'background-color',
      isActive ? ANNOTATION_HIGHLIGHT_ACTIVE : ANNOTATION_HIGHLIGHT_INACTIVE,
      'important'
    );
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
  const fullText = textNodes.map((n) => n.nodeValue).join('');
  const match = findFlexibleQuoteMatch(fullText, quote);
  if (!match) {
    return null;
  }
  return match.start;
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
    const fullText = textNodes.map((n) => n.nodeValue).join('');
    const match = findFlexibleQuoteMatch(fullText, quoteRaw);
    if (!match) {
      continue;
    }
    orderByThreadId[thread.id] = match.start;

    const startPoint = mapGlobalOffsetToPoint(textNodes, match.start);
    const endPoint = mapGlobalOffsetToPoint(textNodes, match.end);
    if (!startPoint || !endPoint) {
      continue;
    }

    const range = document.createRange();
    range.setStart(startPoint.node, startPoint.offset);
    range.setEnd(endPoint.node, endPoint.offset);
    wrapRangeWithHighlightSpan(range, thread, onThreadClick);
  }
  return orderByThreadId;
}
