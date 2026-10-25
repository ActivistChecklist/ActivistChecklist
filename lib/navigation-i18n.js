/**
 * Wraps next-intl `t` so a missing key returns `fallback` instead of the raw
 * key path. Nav items only have the fields their kind needs (checklists have
 * no `label`, explainers no `description`), so callers ask for all three.
 * @param {function(string): string} t
 * @returns {(key: string, fallback: string | undefined) => string}
 */
export function createIntlTranslator(t) {
  return function translateText(key, fallback) {
    if (typeof t.has === 'function' && !t.has(key)) return fallback;
    try {
      return t(key);
    } catch {
      return fallback;
    }
  };
}

// Top-level nav entries use the short `nav.*` label wherever they appear.
const MAIN_NAV_KEYS = new Set(['home', 'checklists', 'news', 'resources', 'about']);

/**
 * messages/en.json namespace for a navigation.json item key:
 * `police-door-poster` -> `navItems.policeDoorPoster`.
 * @param {string} navKey
 */
export function navItemMessageKey(navKey) {
  return `navItems.${navKey.replace(/-([a-z])/g, (_, c) => c.toUpperCase())}`;
}

/**
 * Same title/description/label resolution as the header dropdown and footer links,
 * for any component that has a navigation item `key` (not the full tree).
 *
 * @param {string | undefined} navKey - navigation.json item key (e.g. `essentials`, `police-door-poster`)
 * @param {{ title?: string, description?: string, label?: string }} fallbacks - used when a message is missing
 * @param {(key: string, fallback: string | undefined) => string} translateText - from {@link createIntlTranslator}
 */
export function getTranslatedNavItemFields(navKey, fallbacks, translateText) {
  if (!navKey) {
    return { ...fallbacks };
  }
  const base = navItemMessageKey(navKey);
  const title = translateText(`${base}.title`, fallbacks.title);
  return {
    ...fallbacks,
    title,
    description: translateText(`${base}.description`, fallbacks.description),
    // Explainers and printables have a shorter list label; checklists reuse the title.
    label: translateText(`${base}.label`, fallbacks.label ?? title),
  };
}

export function translateNavigationItem(item, translateText) {
  const topLevelKey = MAIN_NAV_KEYS.has(item.key) ? `nav.${item.key}` : undefined;
  const merged = getTranslatedNavItemFields(item.key, item, translateText);

  const translatedItem = {
    ...item,
    label: topLevelKey ? translateText(topLevelKey, item.label) : merged.label,
    // Footer and other UIs use `title || label`; top-level nav items (home, news)
    // only had label translated, so align title with the same string.
    title: topLevelKey ? translateText(topLevelKey, item.title ?? item.label) : merged.title,
    description: merged.description,
  };

  if (item.items?.length) {
    translatedItem.items = item.items.map((subItem) =>
      translateNavigationItem(subItem, translateText),
    );
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
