const MAX_PATH_LEN = 300;
const MAX_LOCALE_LEN = 16;
/** Long cross-block selections (e.g. heading through nested lists) need a higher cap than 1200. */
export const ANNOTATION_MAX_QUOTE_LEN = 10000;
const MAX_QUOTE_LEN = ANNOTATION_MAX_QUOTE_LEN;
const MAX_COMMENT_LEN = 3000;
const MAX_AUTHOR_LEN = 80;

/** RFC 4122 UUID (any version), lowercase normalized for storage and comparison. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_ANCHOR_DEPTH = 4;
const MAX_ANCHOR_KEYS_PER_LEVEL = 24;
const MAX_ANCHOR_STRING_LEN = 500;

const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** Same normalization as scrubbed quotes, without length cap (for full-document substring search). */
export function normalizeQuoteMatchText(value: string): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scrubText(value: string, maxLen: number): string {
  if (typeof value !== 'string') {
    return '';
  }
  return normalizeQuoteMatchText(value).slice(0, maxLen);
}

/** Strips dangerous control chars but keeps line breaks (LF); used for comment bodies only. */
function scrubCommentBody(value: string, maxLen: number): string {
  if (typeof value !== 'string') {
    return '';
  }
  let s = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  s = s.replace(/[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F]/g, '');
  s = s.replace(/[ \t]+/g, ' ');
  return s.trim().slice(0, maxLen);
}

/**
 * Validates thread / comment ids from URLs or JSON before they reach MongoDB filters
 * (plain string equality only; still reject malformed or non-string-shaped input).
 */
export function sanitizeUuidParam(value: string | undefined): string {
  const s = String(value || '').trim();
  if (!UUID_RE.test(s)) {
    return '';
  }
  return s.toLowerCase();
}

function sanitizePlainObjectForAnchor(
  input: Record<string, unknown>,
  depth: number
): Record<string, unknown> {
  if (depth > MAX_ANCHOR_DEPTH) {
    return {};
  }
  const out: Record<string, unknown> = {};
  let count = 0;
  for (const [rawKey, v] of Object.entries(input)) {
    if (count >= MAX_ANCHOR_KEYS_PER_LEVEL) {
      break;
    }
    const key = String(rawKey);
    if (UNSAFE_OBJECT_KEYS.has(key) || key.startsWith('$')) {
      continue;
    }
    if (!/^[a-zA-Z][a-zA-Z0-9_.-]*$/.test(key) || key.length > 64) {
      continue;
    }
    count += 1;
    if (v === null || typeof v === 'boolean') {
      out[key] = v;
    } else if (typeof v === 'number') {
      if (!Number.isFinite(v) || Math.abs(v) > 1e15) {
        continue;
      }
      out[key] = v;
    } else if (typeof v === 'string') {
      out[key] = scrubText(v, MAX_ANCHOR_STRING_LEN);
    } else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      const nested = sanitizePlainObjectForAnchor(v as Record<string, unknown>, depth + 1);
      if (Object.keys(nested).length > 0) {
        out[key] = nested;
      }
    }
  }
  return out;
}

/**
 * Strips Mongo-style operators and prototype keys from client-supplied anchor metadata
 * before persisting or returning it.
 */
export function sanitizeAnchorSelector(input: unknown): Record<string, unknown> {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }
  return sanitizePlainObjectForAnchor(input as Record<string, unknown>, 0);
}

export function sanitizeDocumentInput({
  path,
  locale,
  contentHash,
}: {
  path: string;
  locale: string;
  contentHash?: string;
}): { path: string; locale: string; contentHash: string } {
  const safePath = scrubText(path, MAX_PATH_LEN);
  const safeLocale = scrubText(locale, MAX_LOCALE_LEN);
  const safeHash = scrubText(contentHash || '', 128);
  return { path: safePath, locale: safeLocale, contentHash: safeHash };
}

export function sanitizeThreadInput({
  quoteText,
  createdBy,
  anchorSelector,
  startOffset,
  endOffset,
}: {
  quoteText: string;
  createdBy: string;
  anchorSelector: unknown;
  startOffset: unknown;
  endOffset: unknown;
}): {
  quoteText: string;
  createdBy: string;
  anchorSelector: Record<string, unknown>;
  startOffset: number | null;
  endOffset: number | null;
} {
  return {
    quoteText: scrubText(quoteText, MAX_QUOTE_LEN),
    createdBy: scrubText(createdBy, MAX_AUTHOR_LEN) || 'Anonymous',
    anchorSelector: sanitizeAnchorSelector(anchorSelector),
    startOffset: Number.isInteger(startOffset) ? (startOffset as number) : null,
    endOffset: Number.isInteger(endOffset) ? (endOffset as number) : null,
  };
}

export function sanitizeCommentInput({
  body,
  createdBy,
}: {
  body: string;
  createdBy: string;
}): { body: string; createdBy: string } {
  return {
    body: scrubCommentBody(body, MAX_COMMENT_LEN),
    createdBy: scrubText(createdBy, MAX_AUTHOR_LEN) || 'Anonymous',
  };
}

/** Same normalization as stored thread quotes (for client-side highlight matching). */
export function scrubAnnotationQuoteText(value: string): string {
  return scrubText(value, MAX_QUOTE_LEN);
}
