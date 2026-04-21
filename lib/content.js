import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import yaml from 'js-yaml';
import { DEFAULT_LOCALE } from './i18n-config.mjs';

const CONTENT_DIR = path.join(process.cwd(), 'content');

/**
 * Get the content directory for a given locale, with English fallback.
 */
function getLocalePath(locale = DEFAULT_LOCALE) {
  return path.join(CONTENT_DIR, locale);
}

/**
 * Read and parse an MDX file. Returns { frontmatter, content, slug } or null.
 *
 * Frontmatter is parsed with gray-matter; keys are whatever authors put in YAML. When you add
 * a new field that should not be translated (IDs, dates, URLs, layout flags like `showToc`, etc.),
 * add its name to `UNTRANSLATABLE_FRONTMATTER_SCALARS` in `scripts/crowdin-hide-strings.mjs` so
 * Crowdin does not send those values to translators.
 */
function readMdxFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf-8');
  const { data, content } = matter(raw);
  const slug = path.basename(filePath, '.mdx');
  return { frontmatter: data, content, slug };
}

/**
 * Read an MDX file with locale fallback to English.
 */
function readMdxFileWithFallback(relativePath, locale = DEFAULT_LOCALE) {
  const localePath = path.join(getLocalePath(locale), relativePath);
  const result = readMdxFile(localePath);
  if (result) return { ...result, isFallback: false };

  if (locale !== DEFAULT_LOCALE) {
    const fallbackPath = path.join(getLocalePath(DEFAULT_LOCALE), relativePath);
    const fallbackResult = readMdxFile(fallbackPath);
    if (fallbackResult) return { ...fallbackResult, isFallback: true };
  }

  return null;
}

/**
 * List all MDX files in a directory (non-recursive).
 */
function listMdxFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath)
    .filter(f => f.endsWith('.mdx'))
    .map(f => path.join(dirPath, f));
}

/**
 * Read all items from a content collection directory (non-recursive).
 * Returns array of { frontmatter, content, slug, isFallback }.
 */
function readCollection(collectionPath, locale = DEFAULT_LOCALE) {
  const localeDir = path.join(getLocalePath(locale), collectionPath);
  const fallbackDir = path.join(getLocalePath(DEFAULT_LOCALE), collectionPath);

  const listFn = listMdxFiles;

  // Get all files from the default locale as the base set
  const defaultFiles = listFn(fallbackDir);
  const defaultSlugs = new Map(
    defaultFiles.map(f => {
      const rel = path.relative(fallbackDir, f);
      return [rel, f];
    })
  );

  // If requesting a non-default locale, overlay translated files
  if (locale !== DEFAULT_LOCALE) {
    const localeFiles = listFn(localeDir);
    const localeSlugs = new Map(
      localeFiles.map(f => {
        const rel = path.relative(localeDir, f);
        return [rel, f];
      })
    );

    return Array.from(defaultSlugs.keys()).map(rel => {
      if (localeSlugs.has(rel)) {
        const parsed = readMdxFile(localeSlugs.get(rel));
        return parsed ? { ...parsed, isFallback: false } : null;
      }
      const parsed = readMdxFile(defaultSlugs.get(rel));
      return parsed ? { ...parsed, isFallback: true } : null;
    }).filter(Boolean);
  }

  return defaultFiles.map(f => {
    const parsed = readMdxFile(f);
    return parsed ? { ...parsed, isFallback: false } : null;
  }).filter(Boolean);
}

// ─── Serialization helpers ───────────────────────────────────

/**
 * Recursively convert Date objects to ISO strings so frontmatter is
 * JSON-serializable for Next.js getStaticProps.
 *
 * Untranslatable frontmatter keys for Crowdin: see `readMdxFile` and `scripts/crowdin-hide-strings.mjs`.
 */
export function serializeFrontmatter(obj) {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date) return obj.toISOString().split('T')[0]; // YYYY-MM-DD
  if (Array.isArray(obj)) return obj.map(serializeFrontmatter);
  if (typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = serializeFrontmatter(v);
    }
    return out;
  }
  return obj;
}

// ─── Public API ──────────────────────────────────────────────

export function getChecklistItem(slug, locale = DEFAULT_LOCALE) {
  return readMdxFileWithFallback(`checklist-items/${slug}.mdx`, locale);
}

export function getAllChecklistItems(locale = DEFAULT_LOCALE) {
  return readCollection('checklist-items', locale);
}

export function getGuide(slug, locale = DEFAULT_LOCALE) {
  return readMdxFileWithFallback(`guides/${slug}.mdx`, locale);
}

export function getAllGuides(locale = DEFAULT_LOCALE) {
  return readCollection('guides', locale);
}

export function getPage(slug, locale = DEFAULT_LOCALE) {
  return readMdxFileWithFallback(`pages/${slug}.mdx`, locale);
}

export function getAllPages(locale = DEFAULT_LOCALE) {
  return readCollection('pages', locale);
}

export function getNewsItem(slug, locale = DEFAULT_LOCALE) {
  return readMdxFileWithFallback(`news/${slug}.mdx`, locale);
}

export function getAllNewsItems(locale = DEFAULT_LOCALE) {
  const items = readCollection('news', locale);
  // Sort by date, newest first
  return items.sort((a, b) => {
    const dateA = new Date(a.frontmatter.date || '1970-01-01');
    const dateB = new Date(b.frontmatter.date || '1970-01-01');
    return dateB - dateA;
  });
}

export function getAllChangelogEntries(locale = DEFAULT_LOCALE) {
  const items = readCollection('changelog', locale);
  // Sort by date, newest first
  return items.sort((a, b) => {
    const dateA = new Date(a.frontmatter.date || '1970-01-01');
    const dateB = new Date(b.frontmatter.date || '1970-01-01');
    return dateB - dateA;
  });
}

/**
 * Keystatic singleton: `content/{locale}/announcement/index.yaml`
 * Legacy fallback: `content/{locale}/announcement.mdx` (frontmatter only).
 * Set `active: false` to hide the bar. `dismissKey` scopes localStorage dismissal.
 */
export function getAnnouncement(locale = DEFAULT_LOCALE) {
  const fm = readAnnouncementFrontmatter(locale);
  if (!fm) return null;
  if (fm.active === false) return null;
  return {
    dismissKey: String(fm.dismissKey || 'announcement'),
    title: fm.title != null ? String(fm.title) : '',
    message: fm.message != null ? String(fm.message) : '',
    buttonText: fm.buttonText != null ? String(fm.buttonText) : null,
    buttonUrl: fm.buttonUrl != null ? String(fm.buttonUrl) : null,
    secondaryButtonText: fm.secondaryButtonText != null ? String(fm.secondaryButtonText) : null,
    secondaryButtonUrl: fm.secondaryButtonUrl != null ? String(fm.secondaryButtonUrl) : null,
    allowDismiss: fm.allowDismiss !== false,
    colorScheme: fm.colorScheme != null ? String(fm.colorScheme) : 'primary',
    icon: fm.icon != null ? String(fm.icon) : 'megaphone',
    disableAfterDate: fm.disableAfterDate != null ? String(fm.disableAfterDate) : null,
  };
}

function readAnnouncementFrontmatter(locale) {
  const localePath = getLocalePath(locale);
  const keystaticYaml = path.join(localePath, 'announcement', 'index.yaml');
  if (fs.existsSync(keystaticYaml)) {
    try {
      const raw = fs.readFileSync(keystaticYaml, 'utf-8');
      const data = yaml.load(raw);
      return data && typeof data === 'object' ? data : null;
    } catch {
      return null;
    }
  }

  const legacy = readMdxFileWithFallback('announcement.mdx', locale);
  if (legacy) return legacy.frontmatter || null;
  return null;
}

/**
 * Get all slugs for getStaticPaths. Returns array of { slug, type } where type
 * is the content type (guide, page, checklist-item, news-item, etc.).
 */
export function getAllSlugs(locale = DEFAULT_LOCALE) {
  const slugs = [];

  for (const item of getAllGuides(locale)) {
    slugs.push({ slug: item.frontmatter.slug || item.slug, type: 'guide' });
  }
  for (const item of getAllPages(locale)) {
    slugs.push({ slug: item.frontmatter.slug || item.slug, type: 'page' });
  }
  for (const item of getAllChecklistItems(locale)) {
    slugs.push({ slug: item.frontmatter.slug || item.slug, type: 'checklist-item' });
  }
  for (const item of getAllNewsItems(locale)) {
    slugs.push({ slug: item.frontmatter.slug || item.slug, type: 'news-item' });
  }
  for (const item of getAllChangelogEntries(locale)) {
    slugs.push({ slug: item.frontmatter.slug || item.slug, type: 'changelog-entry' });
  }

  return slugs;
}

/**
 * Resolve an array of ChecklistItem slugs to their full content.
 * Used by guides to load referenced checklist items.
 */
export function resolveChecklistItems(refs, locale = DEFAULT_LOCALE) {
  const resolved = {};
  for (const ref of refs) {
    const item = getChecklistItem(ref, locale);
    if (item) {
      resolved[ref] = item;
    }
  }
  return resolved;
}

/**
 * Extract ChecklistItem slugs from MDX content string.
 */
export function extractChecklistItems(mdxContent) {
  const refs = [];
  const regex = /<ChecklistItem\s+slug=["']([^"']+)["']\s*\/?>/g;
  let match;
  while ((match = regex.exec(mdxContent)) !== null) {
    refs.push(match[1]);
  }
  return [...new Set(refs)];
}

/**
 * Resolve image path for a news item.
 * Priority: imageOverride frontmatter → /images/news/{slug}.jpg (if file exists)
 */
export function getNewsImagePath(slug, imageOverride) {
  if (imageOverride) return imageOverride;
  const autoPath = path.join(process.cwd(), 'public', 'images', 'news', `${slug}.jpg`);
  return fs.existsSync(autoPath) ? `/images/news/${slug}.jpg` : null;
}

// ─── List props helpers (getStaticProps) ─────────────────────
//
// Flatten MDX-derived data for NewsItem / ChangeLogEntry. All date fields
// are serialized to strings for Next.js props.

/**
 * Serialize a changelog MDX file for list props.
 * Changelog frontmatter uses `date` only (no separate first/last updated).
 */
export function toChangelogListEntry(entry) {
  const fm = serializeFrontmatter(entry.frontmatter);
  return {
    slug: entry.slug,
    first_published_at: fm.date,
    created_at: fm.date,
    type: fm.type || 'minor',
    bodyText: entry.content.trim() || null,
  };
}

/**
 * Serialize a news MDX file for list props.
 */
export function toNewsListItem(item) {
  const fm = serializeFrontmatter(item.frontmatter);
  const imagePath = getNewsImagePath(item.slug, fm.imageOverride || null);
  return {
    slug: item.slug,
    title: fm.title,
    imagePath,
    tags: fm.tags
      ? String(fm.tags).split(',').map((t) => t.trim()).filter(Boolean)
      : [],
    date: fm.date,
    source: fm.source || null,
    url: fm.url || null,
    commentText: item.content.trim() || null,
  };
}
