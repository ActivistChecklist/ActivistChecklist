const MAX_PATH_LEN = 300;
const MAX_LOCALE_LEN = 16;
const MAX_QUOTE_LEN = 1200;
const MAX_COMMENT_LEN = 3000;
const MAX_AUTHOR_LEN = 80;
const MAX_SCOPE_LEN = 200;

function scrubText(value, maxLen) {
  if (typeof value !== 'string') {
    return '';
  }
  return value
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

export function sanitizeDocumentInput({ path, locale, contentHash }) {
  const safePath = scrubText(path, MAX_PATH_LEN);
  const safeLocale = scrubText(locale, MAX_LOCALE_LEN);
  const safeHash = scrubText(contentHash || '', 128);
  return { path: safePath, locale: safeLocale, contentHash: safeHash };
}

export function sanitizeScopeInput({ scopeKey, repoFullName, prNumber, deploymentKey }) {
  return {
    scopeKey: scrubText(scopeKey, MAX_SCOPE_LEN),
    repoFullName: scrubText(repoFullName, MAX_SCOPE_LEN),
    prNumber: scrubText(prNumber, 32),
    deploymentKey: scrubText(deploymentKey, MAX_SCOPE_LEN),
  };
}

export function sanitizeThreadInput({ quoteText, createdBy, anchorSelector, startOffset, endOffset }) {
  return {
    quoteText: scrubText(quoteText, MAX_QUOTE_LEN),
    createdBy: scrubText(createdBy, MAX_AUTHOR_LEN) || 'Anonymous',
    anchorSelector: anchorSelector && typeof anchorSelector === 'object' ? anchorSelector : {},
    startOffset: Number.isInteger(startOffset) ? startOffset : null,
    endOffset: Number.isInteger(endOffset) ? endOffset : null,
  };
}

export function sanitizeCommentInput({ body, createdBy }) {
  return {
    body: scrubText(body, MAX_COMMENT_LEN),
    createdBy: scrubText(createdBy, MAX_AUTHOR_LEN) || 'Anonymous',
  };
}

/** Same normalization as stored thread quotes (for client-side highlight matching). */
export function scrubAnnotationQuoteText(value) {
  return scrubText(value, MAX_QUOTE_LEN);
}
