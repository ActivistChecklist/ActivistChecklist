#!/usr/bin/env node
/**
 * Build `public/llms.txt` (English, mirrored to root) and `out/es/llms.txt`
 * (Spanish) at postbuild time.
 *
 * llms.txt is an emerging convention (llmstxt.org) for sites to advertise a
 * curated index of their content for LLM crawlers. We list every guide, page,
 * and checklist item with a one-line description and its canonical URL. Items
 * are linked under their parent guide via hash anchor (`/essentials/#password-manager`).
 *
 * Pure functions are exported for vitest; the script's filesystem layer is
 * only exercised at build time.
 */

const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

const SITE_NAME = 'Activist Checklist';
const SITE_TAGLINE =
  'Plain-language digital security guides for activists and organizers. Free, CC BY-SA licensed, field-tested.';

const CONTENT_ROOT = path.join(process.cwd(), 'content');

// ─── Pure helpers (exported for tests) ─────────────────────────

/** Strip MDX/JSX tags, markdown link syntax, and most punctuation noise. */
function stripMdxToPlainText(s) {
  if (!s) return '';
  return String(s)
    .replace(/<[A-Za-z][^>]*\/>/g, '')      // self-closing JSX
    .replace(/<\/?[A-Za-z][^>]*>/g, '')     // open/close JSX tags
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // markdown links → text
    .replace(/`([^`]+)`/g, '$1')             // inline code
    .replace(/[*_]+/g, '')                   // emphasis markers
    .replace(/\s+/g, ' ')
    .trim();
}

/** First sentence (or first 160 chars) of a body string, stripped of MDX. */
function firstSentence(body, maxChars = 160) {
  const plain = stripMdxToPlainText(body || '');
  if (!plain) return '';
  // Find first sentence terminator after at least 20 chars of content.
  const m = /[.!?](\s|$)/.exec(plain.slice(20));
  if (m) {
    const cut = 20 + m.index + 1;
    let out = plain.slice(0, cut).trim();
    if (out.length > maxChars) out = out.slice(0, maxChars - 1).trim() + '…';
    return out;
  }
  // No terminator found — truncate with ellipsis if content was longer than maxChars.
  if (plain.length > maxChars) {
    return plain.slice(0, maxChars - 1).trim() + '…';
  }
  return plain;
}

/** Resolve a one-line description for a guide/page using the same priority as <meta>. */
function resolveEntryDescription({ frontmatter, body }) {
  const fm = frontmatter || {};
  return (
    fm.seoDescription ||
    fm.excerpt ||
    fm.summary ||
    fm.description ||
    firstSentence(body) ||
    ''
  );
}

/** Build a URL for a guide/page from its slug and locale. */
function buildUrl(siteUrl, locale, slug) {
  const base = siteUrl.replace(/\/+$/, '');
  return locale === 'en'
    ? `${base}/${slug}/`
    : `${base}/${locale}/${slug}/`;
}

/** Build a URL for a checklist-item under its parent guide. */
function buildChecklistItemUrl(siteUrl, locale, parentGuideSlug, itemSlug) {
  return `${buildUrl(siteUrl, locale, parentGuideSlug)}#${itemSlug}`;
}

/** Format a single list entry as `- [title](url): description`. */
function formatListEntry(title, url, description) {
  const desc = (description || '').trim();
  return desc ? `- [${title}](${url}): ${desc}` : `- [${title}](${url})`;
}

/**
 * Build a slug → parent-guide-slug map by scanning `<ChecklistItem slug="..." />`
 * occurrences in guide bodies. If an item appears in multiple guides, the
 * alphabetically first guide wins (deterministic, mirrors what `extractChecklistItems`
 * sees first in a sorted walk).
 */
function buildItemParentMap(guides) {
  const sortedGuides = [...guides].sort((a, b) => a.slug.localeCompare(b.slug));
  const map = new Map();
  for (const g of sortedGuides) {
    const refs = extractChecklistItemSlugs(g.content);
    for (const ref of refs) {
      if (!map.has(ref)) map.set(ref, g.slug);
    }
  }
  return map;
}

const CHECKLIST_ITEM_RE = /<ChecklistItem\s+slug=["']([^"']+)["']\s*\/?>/g;
function extractChecklistItemSlugs(mdxContent) {
  if (!mdxContent) return [];
  const seen = new Set();
  const out = [];
  let m;
  CHECKLIST_ITEM_RE.lastIndex = 0;
  while ((m = CHECKLIST_ITEM_RE.exec(mdxContent)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      out.push(m[1]);
    }
  }
  return out;
}

// ─── llms.txt body builder ─────────────────────────────────────

/**
 * Build the full text body for an llms.txt file.
 *
 * @param {object} args
 * @param {string} args.siteUrl - e.g. https://activistchecklist.org
 * @param {string} args.locale  - 'en' | 'es'
 * @param {Array<{slug:string, frontmatter:object, content:string}>} args.guides
 * @param {Array<{slug:string, frontmatter:object, content:string}>} args.pages
 * @param {Array<{slug:string, frontmatter:object, content:string}>} args.checklistItems
 */
function buildLlmsTxt({ siteUrl, locale, guides, pages, checklistItems }) {
  const lines = [];
  lines.push(`# ${SITE_NAME}`);
  lines.push('');
  lines.push(`> ${SITE_TAGLINE}`);
  lines.push('');

  // Guides
  lines.push('## Guides');
  lines.push('');
  for (const g of [...guides].sort((a, b) => a.slug.localeCompare(b.slug))) {
    const title = g.frontmatter?.title || g.slug;
    const desc = resolveEntryDescription({ frontmatter: g.frontmatter, body: g.content });
    lines.push(formatListEntry(title, buildUrl(siteUrl, locale, g.slug), desc));
  }
  lines.push('');

  // Pages
  lines.push('## Pages');
  lines.push('');
  for (const p of [...pages].sort((a, b) => a.slug.localeCompare(b.slug))) {
    const title = p.frontmatter?.title || p.slug;
    const desc = resolveEntryDescription({ frontmatter: p.frontmatter, body: p.content });
    lines.push(formatListEntry(title, buildUrl(siteUrl, locale, p.slug), desc));
  }
  lines.push('');

  // Checklist items (linked under their parent guide)
  const itemParents = buildItemParentMap(guides);
  const itemEntries = [];
  for (const item of checklistItems) {
    const parent = itemParents.get(item.slug);
    if (!parent) continue; // skip orphans (not currently referenced by any guide)
    const title = item.frontmatter?.title || item.slug;
    const desc = resolveEntryDescription({ frontmatter: item.frontmatter, body: item.content });
    itemEntries.push({
      title,
      url: buildChecklistItemUrl(siteUrl, locale, parent, item.slug),
      desc,
    });
  }
  if (itemEntries.length) {
    lines.push('## Checklist items');
    lines.push('');
    for (const e of itemEntries.sort((a, b) => a.title.localeCompare(b.title))) {
      lines.push(formatListEntry(e.title, e.url, e.desc));
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ─── Filesystem layer ──────────────────────────────────────────

function listMdxDir(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs
    .readdirSync(dirPath)
    .filter((f) => f.endsWith('.mdx'))
    .map((f) => {
      const raw = fs.readFileSync(path.join(dirPath, f), 'utf8');
      const { data, content } = matter(raw);
      return {
        slug: f.replace(/\.mdx$/, ''),
        frontmatter: data,
        content,
      };
    });
}

function readLocale(locale) {
  // For non-default locales fall back to English when the translated MDX doesn't
  // exist. Match the runtime fallback behavior in lib/content.js.
  const guidesEn = listMdxDir(path.join(CONTENT_ROOT, 'en', 'guides'));
  const pagesEn = listMdxDir(path.join(CONTENT_ROOT, 'en', 'pages'));
  const itemsEn = listMdxDir(path.join(CONTENT_ROOT, 'en', 'checklist-items'));

  if (locale === 'en') {
    return { guides: guidesEn, pages: pagesEn, checklistItems: itemsEn };
  }

  const guidesLoc = new Map(
    listMdxDir(path.join(CONTENT_ROOT, locale, 'guides')).map((x) => [x.slug, x])
  );
  const pagesLoc = new Map(
    listMdxDir(path.join(CONTENT_ROOT, locale, 'pages')).map((x) => [x.slug, x])
  );
  const itemsLoc = new Map(
    listMdxDir(path.join(CONTENT_ROOT, locale, 'checklist-items')).map((x) => [x.slug, x])
  );

  return {
    guides: guidesEn.map((g) => guidesLoc.get(g.slug) || g),
    pages: pagesEn.map((p) => pagesLoc.get(p.slug) || p),
    checklistItems: itemsEn.map((i) => itemsLoc.get(i.slug) || i),
  };
}

function writeFile(outputPath, body) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, body, 'utf8');
}

function main() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://activistchecklist.org';

  const outDir = path.join(process.cwd(), 'out');

  // llms.txt is a production-only artifact, mirroring sitemap.xml — written to
  // out/ at build time, not committed to git. Crawlers only see the deployed
  // version, so a dev server copy isn't useful.
  if (!fs.existsSync(outDir)) {
    // eslint-disable-next-line no-console
    console.log('llms.txt skipped: out/ does not exist (run after next build).');
    return;
  }

  // English: /llms.txt (root) — also mirrored to /en/ for the intermediate
  // static-export structure before postbuild copies en/* to the root.
  const en = readLocale('en');
  const enBody = buildLlmsTxt({ siteUrl, locale: 'en', ...en });
  writeFile(path.join(outDir, 'llms.txt'), enBody);
  writeFile(path.join(outDir, 'en', 'llms.txt'), enBody);

  // Spanish: /es/llms.txt
  const es = readLocale('es');
  const esBody = buildLlmsTxt({ siteUrl, locale: 'es', ...es });
  writeFile(path.join(outDir, 'es', 'llms.txt'), esBody);

  // eslint-disable-next-line no-console
  console.log(
    `llms.txt built — en: ${en.guides.length} guides, ${en.pages.length} pages, ${en.checklistItems.length} items`
  );
}

if (require.main === module) {
  main();
}

module.exports = {
  buildLlmsTxt,
  buildItemParentMap,
  buildUrl,
  buildChecklistItemUrl,
  extractChecklistItemSlugs,
  firstSentence,
  formatListEntry,
  resolveEntryDescription,
  stripMdxToPlainText,
};
