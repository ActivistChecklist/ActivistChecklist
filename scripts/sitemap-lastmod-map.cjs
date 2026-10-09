/**
 * Build a map of canonical site paths → lastmod date (YYYY-MM-DD) from MDX frontmatter.
 * Used by next-sitemap.config.js so <lastmod> reflects lastUpdated / dates from content,
 * not the static export build time.
 *
 * Paths match post-canonical URLs: /signal/, /about/, /changelog/, etc.
 */

const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

/** @param {string[]} dates */
function maxIsoDate(dates) {
  const sorted = dates.filter(Boolean).sort();
  return sorted.length ? sorted[sorted.length - 1] : null;
}

/** @param {Record<string, unknown>} data */
function pickLastmodFromFm(data) {
  const v =
    data.lastUpdated ??
    data.last_updated ??
    data.firstPublished ??
    data.first_published ??
    data.date;
  if (v == null || v === '') return null;
  if (v instanceof Date) {
    return v.toISOString().split('T')[0];
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().split('T')[0];
}

/**
 * @param {string} dirPath
 * @returns {Map<string, string>}
 */
function readMdxDir(dirPath) {
  const map = new Map();
  if (!fs.existsSync(dirPath)) return map;
  for (const file of fs.readdirSync(dirPath)) {
    if (!file.endsWith('.mdx')) continue;
    const raw = fs.readFileSync(path.join(dirPath, file), 'utf8');
    const { data } = matter(raw);
    const fileSlug = file.replace(/\.mdx$/, '');
    const slug = data.slug != null ? String(data.slug) : fileSlug;
    const urlPath = `/${slug.replace(/^\/+/, '').replace(/\/+$/, '')}/`;
    const lm = pickLastmodFromFm(data);
    if (lm) map.set(urlPath, lm);
  }
  return map;
}

/**
 * @param {string} dirPath
 * @returns {string[]}
 */
function collectDatesFromDir(dirPath) {
  const dates = [];
  if (!fs.existsSync(dirPath)) return dates;
  for (const file of fs.readdirSync(dirPath)) {
    if (!file.endsWith('.mdx')) continue;
    const raw = fs.readFileSync(path.join(dirPath, file), 'utf8');
    const { data } = matter(raw);
    const d = pickLastmodFromFm(data);
    if (d) dates.push(d);
  }
  return dates;
}

function buildLastmodByPath() {
  const base = path.join(process.cwd(), 'content', 'en');
  const guides = readMdxDir(path.join(base, 'guides'));
  const pages = readMdxDir(path.join(base, 'pages'));

  /** @type {Map<string, string>} */
  const map = new Map(guides);
  for (const [k, v] of pages) {
    map.set(k, v);
  }

  const changelogDates = collectDatesFromDir(path.join(base, 'changelog'));
  const changelogMax = maxIsoDate(changelogDates);
  if (changelogMax) map.set('/changelog/', changelogMax);

  const newsDates = collectDatesFromDir(path.join(base, 'news'));
  const newsMax = maxIsoDate(newsDates);
  if (newsMax) map.set('/news/', newsMax);

  const guideDates = [...guides.values()];
  const checklistsMax = maxIsoDate(guideDates);
  if (checklistsMax) map.set('/checklists/', checklistsMax);

  const allForHome = [...map.values(), ...changelogDates, ...newsDates];
  const homeMax = maxIsoDate(allForHome);
  if (homeMax) {
    map.set('/', homeMax);
  }

  return map;
}

/**
 * Resolve lastmod for a canonical path from the export (may include /es/).
 * @param {string} canonicalLoc e.g. /signal/ or /es/signal/
 * @param {Map<string, string>} lastmodByPath
 */
function lookupContentLastmod(canonicalLoc, lastmodByPath) {
  let key = canonicalLoc.startsWith('/') ? canonicalLoc : `/${canonicalLoc}`;
  if (!key.endsWith('/')) key = `${key}/`;

  if (key.startsWith('/es/')) {
    const rest = key.slice(4);
    key = rest ? `/${rest.replace(/\/$/, '')}/` : '/';
  }
  if (key === '/en/' || key === '/en') key = '/';

  return lastmodByPath.get(key) || null;
}

module.exports = {
  buildLastmodByPath,
  lookupContentLastmod,
};
