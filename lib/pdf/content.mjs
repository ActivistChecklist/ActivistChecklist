/**
 * Text handling for designed PDFs such as posters (see scripts/build-designed-pdfs.mjs).
 *
 * A PDF's words live in content/<locale>/pdf/<slug>.json. The English
 * file is the Crowdin source and decides the poster's structure; a translation
 * only supplies strings for keys the English file already has.
 */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/**
 * Poster strings use the same inline markup as messages/en.json: <b>…</b> for
 * bold, nothing else. The whole string is escaped first and only a complete
 * <b>…</b> pair is turned back into a tag, so a translation can never put its
 * own HTML into the page. A stray or unclosed tag prints as typed.
 */
export function renderInline(text) {
  return escapeHtml(text).replace(/&lt;b&gt;([\s\S]*?)&lt;\/b&gt;/g, '<strong>$1</strong>');
}

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Lay a translation over the English source. The result has exactly the
 * source's keys in the source's order. Any string the translation lacks, or
 * leaves blank, falls back to English and is listed in `missing` by its dotted
 * key path, so a half-translated poster is visible in the build log.
 */
export function localizeContent(source, translation) {
  const missing = [];

  const walk = (src, tr, path) => {
    if (typeof src === 'string') {
      if (typeof tr === 'string' && tr.trim() !== '') return tr;
      missing.push(path);
      return src;
    }
    if (isPlainObject(src)) {
      const out = {};
      for (const [key, value] of Object.entries(src)) {
        const child = isPlainObject(tr) && Object.hasOwn(tr, key) ? tr[key] : undefined;
        out[key] = walk(value, child, path ? `${path}.${key}` : key);
      }
      return out;
    }
    throw new Error(`${path || 'poster'}: expected text or a group of keys, got ${typeof src}`);
  };

  return { content: walk(source, translation, ''), missing };
}
