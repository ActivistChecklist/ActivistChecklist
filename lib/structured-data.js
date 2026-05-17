/**
 * Build schema.org JSON-LD graphs for content pages.
 *
 * Pure logic — no React, no Next.js imports. Tested in
 * __tests__/structured-data.test.js. Consumed by <JsonLd /> for inline
 * rendering and by lib/build-llms-txt.cjs for derived outputs.
 */

const SITE_NAME = 'Activist Checklist';
const SITE_LICENSE = 'https://creativecommons.org/licenses/by-sa/4.0/';
const ORG_SAME_AS = [
  'https://bsky.app/profile/activistchecklist.org',
  'https://github.com/ActivistChecklist',
];

/**
 * Guides where SEO investment is concentrated: they get seoTitle, answerCapsule,
 * and HowTo JSON-LD. Shared by lib/structured-data, the SEO audit script, and
 * anywhere else that needs the priority list. Ordered by user-stated popularity.
 */
export const TOP_GUIDE_SLUGS = [
  'signal',
  'essentials',
  'travel',
  'ice',
  'protest',
  'doxxing',
  'secondary',
  'emergency',
];

/** Guides that get an FAQ section drafted in this SEO pass. */
export const FAQ_GUIDE_SLUGS = ['signal', 'essentials', 'travel'];

// ─── URL helpers ───────────────────────────────────────────────

/** Strip leading/trailing slashes from a slug. */
function normalizeSlug(slug) {
  return String(slug || '').replace(/^\/+|\/+$/g, '');
}

/**
 * Canonical URL for a content page. English (default locale) has no prefix.
 * Always trailing-slash to match the site's URL convention.
 */
export function canonicalUrl(baseUrl, locale, slug) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  const normalized = normalizeSlug(slug);
  if (!normalized) {
    return locale === 'en' ? `${base}/` : `${base}/${locale}/`;
  }
  return locale === 'en'
    ? `${base}/${normalized}/`
    : `${base}/${locale}/${normalized}/`;
}

// ─── Frontmatter description ───────────────────────────────────

/**
 * Resolve the description for schema use. Mirrors the precedence in
 * generateMetadata so JSON-LD and <meta name="description"> agree.
 */
export function resolveDescription(frontmatter, fallback) {
  return (
    frontmatter?.seoDescription ||
    frontmatter?.excerpt ||
    frontmatter?.summary ||
    frontmatter?.description ||
    fallback ||
    ''
  );
}

// ─── estimatedTime → ISO 8601 duration ─────────────────────────

/**
 * Parse "45 minutes", "1 hour", "30-60 minutes", "3 hours" etc. into an
 * ISO 8601 duration like PT45M / PT1H / PT3H. Ranges use the upper bound.
 * Returns null for unparseable input — caller should omit `totalTime`.
 */
export function parseEstimatedTimeToIso(value) {
  if (!value) return null;
  const s = String(value).toLowerCase();
  // Find the last number (handles "30-60 minutes" → 60, "1 hour to start, 4 hours to finish" → 4)
  const nums = s.match(/\d+(?:\.\d+)?/g);
  if (!nums || nums.length === 0) return null;
  const n = parseFloat(nums[nums.length - 1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (/hour|hr\b/.test(s)) return `PT${Math.round(n)}H`;
  if (/minute|min\b/.test(s)) return `PT${Math.round(n)}M`;
  return null;
}

// ─── Checklist-item step extraction ────────────────────────────

const CHECKLIST_ITEM_RE = /<ChecklistItem\s+slug=["']([^"']+)["']\s*\/?>/g;

/**
 * Extract checklist-item slugs from a guide's MDX body, preserving order
 * and deduplicating. Same regex as lib/content.js extractChecklistItems
 * (kept local so this module can be required from build scripts).
 */
export function extractChecklistItemSlugsFromMdx(mdxContent) {
  if (!mdxContent) return [];
  const seen = new Set();
  const result = [];
  let m;
  CHECKLIST_ITEM_RE.lastIndex = 0;
  while ((m = CHECKLIST_ITEM_RE.exec(mdxContent)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      result.push(m[1]);
    }
  }
  return result;
}

/**
 * Strip everything between `<` and matching `>` by tracking bracket depth.
 *
 * Correctly handles adversarial nested input like `<scr<Alert />ipt>` in a
 * single pass: each `<` increments depth, each `>` decrements, characters
 * outside any bracket pair survive. A single regex pass would leave a
 * residual `<script>` for the above input; this avoids that class of bug
 * entirely and satisfies CodeQL's "incomplete multi-character sanitization"
 * check (no regex pattern for the analyzer to flag).
 *
 * Side effect: bare `<` and `>` in prose are also consumed. Acceptable for
 * MDX-derived text where bare brackets wouldn't appear (they'd be `&lt;`).
 */
function stripBracketContent(s) {
  if (!s) return '';
  let out = '';
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '<') depth++;
    else if (c === '>' && depth > 0) depth--;
    else if (depth === 0) out += c;
  }
  return out;
}

/**
 * First paragraph of a checklist-item body, lightly stripped of MDX tags
 * and markdown so it can serve as a HowToStep `text` field. Input is our
 * own MDX (trusted at build time) and the output is later re-encoded via
 * serializeJsonLd before reaching any HTML context, but the helper above
 * is robust to nested-tag adversarial input regardless.
 */
export function checklistItemStepText(body) {
  if (!body) return '';
  const trimmed = String(body).trim();
  // Take content up to the first blank line.
  const firstPara = trimmed.split(/\n\s*\n/)[0] || '';
  return stripBracketContent(firstPara)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Builders ──────────────────────────────────────────────────

/**
 * Organization node (publisher/author). Used by Article and emitted standalone
 * on the home page.
 */
export function buildOrganization(baseUrl) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  return {
    '@type': 'Organization',
    '@id': `${base}/#organization`,
    name: SITE_NAME,
    url: `${base}/`,
    logo: {
      '@type': 'ImageObject',
      url: `${base}/images/logo-stacked-color-transparent.png`,
    },
    sameAs: ORG_SAME_AS,
    description:
      'Plain-language digital security guides for activists and organizers. Field-tested, community-verified, CC BY-SA licensed.',
  };
}

/**
 * WebSite node. Emitted on the home page once per locale.
 */
export function buildWebSite(baseUrl, locale = 'en') {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  const url = locale === 'en' ? `${base}/` : `${base}/${locale}/`;
  return {
    '@type': 'WebSite',
    '@id': `${base}/#website-${locale}`,
    url,
    name: SITE_NAME,
    inLanguage: locale,
    publisher: { '@id': `${base}/#organization` },
    license: SITE_LICENSE,
  };
}

/**
 * BreadcrumbList. Always Home → Page (the site is shallow). Skipped on home.
 */
export function buildBreadcrumb({ baseUrl, locale, slug, title }) {
  const normalized = normalizeSlug(slug);
  if (!normalized) return null;
  const homeUrl = canonicalUrl(baseUrl, locale, '');
  const pageUrl = canonicalUrl(baseUrl, locale, normalized);
  return {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: homeUrl },
      { '@type': 'ListItem', position: 2, name: title, item: pageUrl },
    ],
  };
}

/**
 * Article (or BlogPosting for news). Builds the core content node.
 *
 * @param {object} args
 * @param {string} args.baseUrl
 * @param {string} args.locale
 * @param {string} args.slug
 * @param {object} args.frontmatter
 * @param {string} [args.imageUrl]
 * @param {string} [args.type] - 'Article' (default) or 'BlogPosting'
 */
export function buildArticle({ baseUrl, locale, slug, frontmatter = {}, imageUrl, type = 'Article' }) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  const url = canonicalUrl(baseUrl, locale, slug);
  const headline = frontmatter.title || frontmatter.seoTitle || '';
  const description = resolveDescription(frontmatter);
  const datePublished = frontmatter.firstPublished || frontmatter.date || null;
  const dateModified = frontmatter.lastUpdated || datePublished || null;

  const article = {
    '@type': type,
    '@id': `${url}#article`,
    headline,
    description,
    url,
    mainEntityOfPage: url,
    inLanguage: locale,
    isPartOf: { '@id': `${base}/#website-${locale}` },
    publisher: { '@id': `${base}/#organization` },
    author: { '@id': `${base}/#organization` },
    license: SITE_LICENSE,
  };

  if (datePublished) article.datePublished = datePublished;
  if (dateModified) article.dateModified = dateModified;
  if (imageUrl) article.image = imageUrl;

  return article;
}

/**
 * HowTo node from a guide. One HowToStep per <ChecklistItem>, NOT per Section
 * (Section is a category, not a step).
 *
 * @param {object} args
 * @param {string} args.baseUrl
 * @param {string} args.locale
 * @param {string} args.slug
 * @param {object} args.frontmatter
 * @param {string[]} args.checklistItemSlugs - in body order
 * @param {Record<string, {frontmatter: object, content: string}>} args.checklistItemsBySlug
 */
export function buildHowTo({
  baseUrl,
  locale,
  slug,
  frontmatter = {},
  checklistItemSlugs = [],
  checklistItemsBySlug = {},
}) {
  if (!checklistItemSlugs.length) return null;

  const guideUrl = canonicalUrl(baseUrl, locale, slug);
  const steps = [];
  let position = 1;
  for (const itemSlug of checklistItemSlugs) {
    const item = checklistItemsBySlug[itemSlug];
    if (!item || !item.frontmatter?.title) continue;
    const step = {
      '@type': 'HowToStep',
      position: position++,
      name: item.frontmatter.title,
      url: `${guideUrl}#${itemSlug}`,
    };
    const text = checklistItemStepText(item.content);
    if (text) step.text = text;
    steps.push(step);
  }

  if (!steps.length) return null;

  const howTo = {
    '@type': 'HowTo',
    name: frontmatter.title || '',
    description: resolveDescription(frontmatter),
    inLanguage: locale,
    step: steps,
  };

  const totalTime = parseEstimatedTimeToIso(frontmatter.estimatedTime);
  if (totalTime) howTo.totalTime = totalTime;

  return howTo;
}

/**
 * FAQPage node from a list of {question, text} pairs. The FAQ MDX component
 * collects pairs and passes them to <JsonLd />.
 */
export function buildFaqPage(pairs) {
  const items = (pairs || []).filter((p) => p && p.question && p.text);
  if (!items.length) return null;
  return {
    '@type': 'FAQPage',
    mainEntity: items.map(({ question, text }) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: {
        '@type': 'Answer',
        text,
      },
    })),
  };
}

/**
 * Compose a full @graph for a content page (Article + BreadcrumbList +
 * optional HowTo). FAQPage is emitted separately by the <FAQ> component
 * because it can only know its pairs at render time.
 *
 * Returns null if there's nothing to emit (defensive).
 */
export function buildContentPageGraph(args) {
  const { howTo } = args;
  const article = buildArticle(args);
  const breadcrumb = buildBreadcrumb({
    baseUrl: args.baseUrl,
    locale: args.locale,
    slug: args.slug,
    title: args.frontmatter?.title,
  });
  const graph = [article];
  if (breadcrumb) graph.push(breadcrumb);
  if (howTo) graph.push(howTo);
  return { '@context': 'https://schema.org', '@graph': graph };
}

/**
 * Home-page graph: Organization + WebSite. (No Article, no breadcrumbs.)
 */
export function buildHomePageGraph({ baseUrl, locale }) {
  return {
    '@context': 'https://schema.org',
    '@graph': [buildOrganization(baseUrl), buildWebSite(baseUrl, locale)],
  };
}

// U+2028 and U+2029 — built from char codes so the regex literal can't
// trip bundler ASTs that don't accept raw line-terminator codepoints in source.
const LINE_TERMINATORS_RE = new RegExp(
  `[${String.fromCharCode(0x2028)}${String.fromCharCode(0x2029)}]`,
  'g'
);

/**
 * Safe JSON serialization for inlining inside <script type="application/ld+json">.
 *
 * Escapes the </script> closing-tag sequence and U+2028 / U+2029 line
 * terminators which are valid JSON but invalid in JavaScript string literals
 * (browser parses script innerHTML as text but some legacy parsers misbehave).
 * Also escapes < and > defensively so a stray HTML-significant character in
 * a description can't break out of the script body.
 */
export function serializeJsonLd(data) {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(LINE_TERMINATORS_RE, (ch) =>
      ch.charCodeAt(0) === 0x2028 ? '\\u2028' : '\\u2029'
    );
}
