import { IoArrowForward, IoLogoGithub, IoLogoMastodon } from 'react-icons/io5';
import { SiBluesky } from 'react-icons/si';
import { GUIDE_ICONS, PAGE_ICONS } from './icons';
import navData from './navigation.json';

// --- Resolve helpers ---
//
// navigation.json holds structure only (hrefs, kinds, menus, sections). Every
// visible string comes from messages/en.json by key: see lib/navigation-i18n.js.

const SOCIAL_ICON_MAP = {
  bluesky: SiBluesky,
  mastodon: IoLogoMastodon,
  github: IoLogoGithub,
};

function resolveItem(key) {
  const raw = navData.items[key];
  if (!raw) throw new Error(`Unknown nav item: "${key}"`);
  const icon = GUIDE_ICONS[key];
  return {
    key,
    href: raw.href,
    ...(raw.kind && { kind: raw.kind }),
    ...(icon && { icon }),
  };
}

function resolveMenu(menuKey) {
  const menu = navData.menus[menuKey];
  const resolved = {
    key: menuKey,
    href: menu.href,
    type: 'dropdown',
    items: menu.items.map(resolveItem),
  };
  if (menu.columns) resolved.columns = menu.columns;
  if (menu.footerLink) {
    resolved.footerLink = {
      href: menu.href,
      type: 'full-width',
      icon: IoArrowForward,
      className: 'group',
      // rtl:rotate-180 flips the arrow to point left in Arabic; the hover nudge
      // has to be negated too, so it still travels the way the arrow points.
      iconClassName:
        'transition-transform duration-200 group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1',
    };
  }
  return resolved;
}

function resolveSocialLink(key) {
  const raw = navData.social[key];
  return { key, ...raw, icon: SOCIAL_ICON_MAP[key] };
}

// --- Exports ---

export const SITE_BRANDING = navData.site;

/** Paths not represented as nav items (downloads, keys, etc.) */
export const STATIC_PATHS = navData.staticPaths;

export const SOCIAL_LINKS = Object.fromEntries(
  Object.keys(navData.social).map((key) => [key.toUpperCase(), resolveSocialLink(key)]),
);

export const NAV_ITEMS = Object.fromEntries(
  Object.keys(navData.items).map((key) => {
    const upperKey = key.toUpperCase().replace(/-/g, '_');
    return [upperKey, resolveItem(key)];
  }),
);

export const SECURITY_CHECKLISTS = resolveMenu('checklists');

/**
 * The four groups every checklist, explainer, and printable sits in. `items`
 * are the section's checklists; `featured` get full cards on the homepage and
 * a bold row in the menu (a how-to can be featured too); `reads` are the
 * explainers and printables listed under them. See lib/checklist-sections.js.
 */
// Pages featured in a section (the security party) get an icon here only, so
// other menus that list the same page (Resources) keep their plain rows.
function resolveSectionItem(key) {
  const item = resolveItem(key);
  return PAGE_ICONS[key] ? { ...item, icon: PAGE_ICONS[key] } : item;
}

export const CHECKLIST_SECTIONS = navData.checklistSections.map((section) => ({
  key: section.key,
  href: `${navData.menus.checklists.href}#${section.key}`,
  items: section.items.map(resolveSectionItem),
  featured: section.featured.map(resolveSectionItem),
  reads: section.reads.map(resolveSectionItem),
}));

/** Raw section keys, for the pure helpers in lib/checklist-sections.js. */
export const CHECKLIST_SECTION_KEYS = navData.checklistSections;

/** Raw navigation items, for `findPairedExplainer`. */
export const NAV_ITEM_DATA = navData.items;
export const RESOURCES_SECTION = resolveMenu('resources');
export const ABOUT_SECTION = resolveMenu('about');

export const navigationConfig = {
  logo: {
    href: navData.items.home.href,
    label: SITE_BRANDING.title,
    ariaLabel: `${SITE_BRANDING.title} Home`,
    image: '/images/logo-bg-white.png',
  },
  mainNav: navData.mainNav.map((key) => {
    if (navData.menus[key]) return resolveMenu(key);
    return { ...resolveItem(key), type: 'link' };
  }),
  socialLinks: [resolveSocialLink('bluesky')],
};

export const footerConfig = {
  branding: SITE_BRANDING,
  sections: navData.footer.sections.map((section) => ({
    key: section.key,
    items: section.fromMenu ? resolveMenu(section.fromMenu).items : section.items.map(resolveItem),
  })),
  socialLinks: navData.footer.social.map(resolveSocialLink),
};

// --- Active-state helpers (normalize for Next.js trailingSlash: true vs bare paths) ---

function normalizePathForMatch(p) {
  if (p == null || p === '') return '';
  if (p === '/') return '/';
  return p.endsWith('/') ? p : `${p}/`;
}

function pathsEqual(a, b) {
  return normalizePathForMatch(a) === normalizePathForMatch(b);
}

export function isNavItemActive(item, pathname) {
  if (item.href?.startsWith('#')) return false;
  if (item.items) {
    return item.items.some((subItem) => isSubItemActive(subItem, pathname));
  }
  if (item.href === '/' && (pathname === '/' || pathname === '')) return true;
  return pathsEqual(item.href, pathname);
}

export function findActiveSection(pathname) {
  return navigationConfig.mainNav.find((section) => isNavItemActive(section, pathname));
}

export function isSubItemActive(item, pathname) {
  if (item.href?.startsWith('#')) return false;
  if (item.href === '/' || item.href === '') {
    return pathname === '/' || pathname === '';
  }
  if (pathsEqual(item.href, pathname)) return true;
  const base = normalizePathForMatch(item.href);
  const full = normalizePathForMatch(pathname);
  if (base === '/') return false;
  return full.startsWith(base);
}
