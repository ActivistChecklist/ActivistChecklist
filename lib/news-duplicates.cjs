/**
 * Helpers for spotting a news link that's already on the site, so
 * scripts/news-wizard.js can stop before adding the same article twice. (It
 * used to add a second copy with "-2" on the end of the file name.)
 *
 * CommonJS so the wizard can require it.
 */

// Query parameters that only track where a click came from. Two links that
// differ only by these point to the same article.
const TRACKING_PARAM = /^(utm_[a-z]+|fbclid|gclid|mc_cid|mc_eid)$/i;

/**
 * A comparable form of an article URL: no scheme, no "www.", no #fragment, no
 * tracking parameters and no trailing slash.
 *
 * @param {string} url
 * @returns {string}
 */
function normalizeNewsUrl(url) {
  const text = String(url || '').trim();
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    return text.toLowerCase();
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const params = [...parsed.searchParams].filter(([key]) => !TRACKING_PARAM.test(key));
  const search = params.length ? `?${new URLSearchParams(params).toString()}` : '';
  const pathname = parsed.pathname.replace(/\/+$/, '');
  return `${host}${pathname}${search}`;
}

/**
 * The news items whose `url` points to the same article as `url`.
 *
 * @param {Array<{ slug: string, frontmatter: { url?: string } }>} items
 * @param {string} url
 */
function findNewsItemsWithUrl(items, url) {
  const target = normalizeNewsUrl(url);
  if (!target) return [];
  return items.filter(
    (item) => item.frontmatter?.url && normalizeNewsUrl(item.frontmatter.url) === target,
  );
}

/**
 * Splits the output of `git cat-file --batch` into each object's contents, in
 * the order they were asked for. A name git can't find comes back as null.
 * Sizes in the headers are in bytes, so this works on the raw Buffer.
 *
 * @param {Buffer} output
 * @returns {Array<string | null>}
 */
function parseGitCatFileBatch(output) {
  const contents = [];
  let pos = 0;
  while (pos < output.length) {
    const lineEnd = output.indexOf(0x0a, pos);
    if (lineEnd === -1) break;
    const header = output.subarray(pos, lineEnd).toString('utf8').split(' ');
    pos = lineEnd + 1;
    if (header[1] === 'missing') {
      contents.push(null);
      continue;
    }
    const size = Number(header[2]);
    contents.push(output.subarray(pos, pos + size).toString('utf8'));
    // Each object is followed by a newline.
    pos += size + 1;
  }
  return contents;
}

module.exports = { normalizeNewsUrl, findNewsItemsWithUrl, parseGitCatFileBatch };
