/**
 * Wraps next-intl `t` in the same try/catch pattern used for nav labels
 * (missing keys fall back to English from navigation config).
 * @param {function(string): string} t
 * @returns {(key: string, fallback: string | undefined) => string}
 */
export function createIntlTranslator(t) {
  return function translateText(key, fallback) {
    try {
      return t(key);
    } catch {
      return fallback;
    }
  };
}

const MAIN_NAV_TRANSLATION_KEYS = {
  home: 'nav.home',
  checklists: 'nav.checklists',
  news: 'nav.news',
  resources: 'nav.resources',
  about: 'nav.about',
};

const ITEM_TRANSLATION_KEYS = {
  essentials: {
    title: 'navItems.essentials.title',
    description: 'navItems.essentials.description',
  },
  signal: {
    title: 'navItems.signal.title',
    description: 'navItems.signal.description',
  },
  protest: {
    title: 'navItems.protest.title',
    description: 'navItems.protest.description',
  },
  ice: {
    title: 'navItems.ice.title',
    description: 'navItems.ice.description',
  },
  doxxing: {
    title: 'navItems.doxxing.title',
    description: 'navItems.doxxing.description',
  },
  travel: {
    title: 'navItems.travel.title',
    description: 'navItems.travel.description',
  },
  emergency: {
    title: 'navItems.emergency.title',
    description: 'navItems.emergency.description',
  },
  secondary: {
    title: 'navItems.secondary.title',
    description: 'navItems.secondary.description',
  },
  links: {
    title: 'navItems.links.title',
    label: 'navItems.links.label',
  },
  'police-door-poster': {
    title: 'navItems.policeDoorPoster.title',
    label: 'navItems.policeDoorPoster.label',
  },
  flyer: {
    title: 'navItems.flyer.title',
    label: 'navItems.flyer.label',
  },
  movies: {
    title: 'navItems.movies.title',
    label: 'navItems.movies.label',
  },
  resources: {
    title: 'navItems.resources.title',
    label: 'navItems.resources.label',
  },
  about: {
    title: 'navItems.about.title',
    label: 'navItems.about.label',
  },
  changelog: {
    title: 'navItems.changelog.title',
    label: 'navItems.changelog.label',
  },
  contact: {
    title: 'navItems.contact.title',
    label: 'navItems.contact.label',
  },
  privacy: {
    title: 'navItems.privacy.title',
    label: 'navItems.privacy.label',
  },
};

/**
 * Same title/description/label resolution as the header dropdown and footer links,
 * for any component that has a navigation item `key` (not the full tree).
 *
 * @param {string | undefined} navKey - navigation.json item key (e.g. `essentials`, `police-door-poster`)
 * @param {{ title?: string, description?: string, label?: string }} fallbacks - usually from `resolveItem`
 * @param {(key: string, fallback: string | undefined) => string} translateText - from {@link createIntlTranslator}
 */
export function getTranslatedNavItemFields(navKey, fallbacks, translateText) {
  if (!navKey) {
    return { ...fallbacks };
  }
  const itemKey = ITEM_TRANSLATION_KEYS[navKey] || {};
  return {
    ...fallbacks,
    title: itemKey.title ? translateText(itemKey.title, fallbacks.title) : fallbacks.title,
    description: itemKey.description
      ? translateText(itemKey.description, fallbacks.description)
      : fallbacks.description,
    label: itemKey.label
      ? translateText(itemKey.label, fallbacks.label ?? fallbacks.title)
      : fallbacks.label,
  };
}

export function translateNavigationItem(item, translateText) {
  const topLevelKey = MAIN_NAV_TRANSLATION_KEYS[item.key];
  const merged = getTranslatedNavItemFields(item.key, item, translateText);

  const translatedItem = {
    ...item,
    label: topLevelKey ? translateText(topLevelKey, item.label) : merged.label,
    title: merged.title,
    description: merged.description,
  };

  if (item.items?.length) {
    translatedItem.items = item.items.map((subItem) => translateNavigationItem(subItem, translateText));
  }

  if (item.footerLink) {
    translatedItem.footerLink = {
      ...item.footerLink,
      title: translateText('nav.browseAllChecklists', item.footerLink.title),
    };
  }

  return translatedItem;
}

export function translateMainNavigation(mainNav, translateText) {
  return mainNav.map((item) => translateNavigationItem(item, translateText));
}
