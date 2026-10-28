/**
 * Checks for text that reaches lib/markdown-html.js instead of the MDX
 * pipeline: front matter strings (checklist-item preview/why/do/dont and the
 * rest) and changelog/news bodies. None of these need raw HTML, so any tag is
 * flagged. The renderer already strips it; this catches a bad translation in
 * review before it ships.
 */

export const UNSAFE_MARKUP_PATTERNS = [
  // `[\w-]` stops at ':' so markdown autolinks like <https://x> are not tags.
  { pattern: /<\/?[a-z][\w-]*(?=[\s/>]|$)/i, label: 'raw HTML tag' },
  { pattern: /<!/, label: 'raw HTML comment or declaration' },
  { pattern: /javascript\s*:/i, label: 'javascript: URL' },
  { pattern: /vbscript\s*:/i, label: 'vbscript: URL' },
  { pattern: /data\s*:\s*text\/html/i, label: 'data:text/html URL' },
  // Only inside a tag, so prose such as "one = two" does not trip it.
  { pattern: /<[^>]*\bon[a-z]+\s*=/i, label: 'event handler attribute' },
];

/** Collection folders whose MDX body is rendered by lib/markdown-html.js. */
export function bodyRendersAsMarkdown(relativePath) {
  return /^content\/[^/]+\/(changelog|news)\//.test(relativePath.split('\\').join('/'));
}

/**
 * @param {string} text
 * @returns {{ line: number, label: string, context: string }[]}
 */
export function findUnsafeMarkup(text) {
  const found = [];
  String(text)
    .split('\n')
    .forEach((line, i) => {
      for (const { pattern, label } of UNSAFE_MARKUP_PATTERNS) {
        if (pattern.test(line)) {
          found.push({ line: i + 1, label, context: line.trim().slice(0, 100) });
        }
      }
    });
  return found;
}

/**
 * Every string value in parsed front matter, with a readable key path.
 *
 * @param {unknown} value
 * @param {string} [keyPath]
 * @returns {{ keyPath: string, value: string }[]}
 */
export function collectStrings(value, keyPath = '') {
  if (typeof value === 'string') return [{ keyPath, value }];
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => collectStrings(v, `${keyPath}[${i}]`));
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.entries(value).flatMap(([k, v]) =>
      collectStrings(v, keyPath ? `${keyPath}.${k}` : k),
    );
  }
  return [];
}
