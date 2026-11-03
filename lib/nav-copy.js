/**
 * How a guide or page is listed: header menus, footer, homepage cards,
 * /checklists/, related guides and search. It comes from the page's own
 * frontmatter: `navTitle` (falls back to `title`) and `navDescription` (none
 * if blank). Server only: it reads content files. Client components get it
 * through the next-intl messages (see withNavCopy).
 */
import navData from '@/config/navigation.json';
import { slugFromHref } from '@/lib/checklist-sections';
import { getGuide, getPage } from '@/lib/content';
import { DEFAULT_LOCALE } from '@/lib/i18n-config.mjs';
import { navItemMessageId } from '@/lib/navigation-i18n';

const clean = (value) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');

/**
 * Picks the title and description one locale shows. A translated field that
 * still equals the English one is treated as untranslated, in case Crowdin
 * fills missing strings with the source text.
 *
 * Title: translated navTitle, previous translation, translated title, English
 * navTitle, English title. Description: translated navDescription, previous
 * translation, English navDescription.
 *
 * @param {Record<string, unknown>} english - English frontmatter
 * @param {Record<string, unknown> | null} translated - the locale's own frontmatter; null for English or when the locale has no file
 * @param {{ title?: string, description?: string }} [previous] - see previousTranslation
 * @returns {{ title: string, description?: string }}
 */
export function resolveNavCopy(english, translated, previous) {
  const ownText = (field) => {
    const value = clean(translated?.[field]);
    return value && value !== clean(english[field]) ? value : '';
  };
  const title =
    ownText('navTitle') ||
    previous?.title ||
    ownText('title') ||
    clean(english.navTitle) ||
    clean(english.title);
  const description =
    ownText('navDescription') || previous?.description || clean(english.navDescription);
  return description ? { title, description } : { title };
}

/**
 * A page's copy on a related-page card: its nav copy, or, when it has no
 * navDescription, its summary or SEO description, so the card isn't bare next
 * to the guide cards beside it. The locale's own text comes first.
 *
 * @param {Record<string, unknown>} english - English frontmatter
 * @param {Record<string, unknown> | null} translated - the locale's own frontmatter; null for English or when the locale has no file
 * @returns {{ title: string, description?: string }}
 */
export function resolveRelatedPageCopy(english, translated) {
  const copy = resolveNavCopy(english, translated);
  if (copy.description) return copy;
  const description =
    clean(translated?.excerpt) ||
    clean(translated?.seoDescription) ||
    clean(english.excerpt) ||
    clean(english.seoDescription);
  return description ? { ...copy, description } : copy;
}

/**
 * Card data for the pages a relatedGuides list names, keyed by the slug as
 * written. Guides are left out (RelatedGuides finds those in navigation), and
 * so is any slug that matches nothing.
 *
 * @param {string[]} slugs - from parseRelatedGuides
 * @param {string} locale
 * @returns {Record<string, { href: string, kind?: string, title: string, description?: string }>}
 */
export function getRelatedPages(slugs, locale = DEFAULT_LOCALE) {
  const pages = {};
  for (const written of slugs) {
    const slug = slugFromHref(written);
    const english = !getGuide(slug, DEFAULT_LOCALE) && getPage(slug, DEFAULT_LOCALE);
    if (!english) continue;
    const own = locale === DEFAULT_LOCALE ? null : getPage(slug, locale);
    const translated = own && !own.isFallback ? own : null;
    // Explainer, printable... from the page's navigation item, if it has one.
    const kind = Object.values(navData.items).find(
      (item) => slugFromHref(item.href) === slug,
    )?.kind;
    pages[written] = {
      href: `/${slug}/`,
      ...(kind && { kind }),
      ...resolveRelatedPageCopy(english.frontmatter, translated?.frontmatter ?? null),
    };
  }
  return pages;
}

/**
 * The strings messages/<locale>.json still has from when nav copy lived in
 * en.json: `navItems.<key>`, and `checklistSections.descriptions` for the
 * party. Crowdin deletes them on its first sync after they left en.json, and a
 * translation-memory pre-translate fills in `navTitle`/`navDescription` in the
 * translated MDX instead. Delete this (and resolveNavCopy's `previous`) once
 * that sync has landed: `grep -c '"essentials"' messages/es.json` prints 0.
 */
function previousTranslation(messages, key) {
  const entry = messages.navItems?.[navItemMessageId(key)];
  const description = entry?.description ?? messages.checklistSections?.descriptions?.[key];
  if (!entry && !description) return undefined;
  // Lists show the label; only the police poster's differs from its title.
  return { title: entry?.label || entry?.title, description };
}

function readFrontmatter(slug, locale) {
  return (getGuide(slug, locale) ?? getPage(slug, locale)) || null;
}

/**
 * Title and description for every navigation.json item backed by a guide or
 * page, keyed by navigation.json key. Items with no MDX file (home, news,
 * tools, contact...) keep their strings in messages/en.json.
 *
 * @param {string} locale
 * @param {Record<string, any>} [messages] - the locale's next-intl messages, for previousTranslation
 * @returns {Record<string, { title: string, description?: string }>}
 */
export function getNavCopy(locale = DEFAULT_LOCALE, messages = {}) {
  const copy = {};
  for (const [key, item] of Object.entries(navData.items)) {
    const slug = item.href.replace(/^\/+|\/+$/g, '');
    const english = slug && readFrontmatter(slug, DEFAULT_LOCALE);
    if (!english) continue;
    if (locale === DEFAULT_LOCALE) {
      copy[key] = resolveNavCopy(english.frontmatter, null);
      continue;
    }
    const own = readFrontmatter(slug, locale);
    copy[key] = resolveNavCopy(
      english.frontmatter,
      own && !own.isFallback ? own.frontmatter : null,
      previousTranslation(messages, key),
    );
  }
  return copy;
}

/**
 * Adds getNavCopy's strings to next-intl messages under `navItems`, where
 * lib/navigation-i18n.js looks up every nav item, so server and client
 * components read guides and pages the same way as everything else.
 *
 * @param {Record<string, any>} messages
 * @param {string} locale
 */
export function withNavCopy(messages, locale) {
  const navItems = { ...messages.navItems };
  for (const [key, copy] of Object.entries(getNavCopy(locale, messages))) {
    navItems[navItemMessageId(key)] = copy;
  }
  return { ...messages, navItems };
}
