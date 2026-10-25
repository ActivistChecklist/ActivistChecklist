import { describe, it, expect } from 'vitest';
import {
  createIntlTranslator,
  getTranslatedNavItemFields,
  navItemMessageKey,
  translateMainNavigation,
} from '../lib/navigation-i18n';
import { navigationConfig } from '../config/navigation';
import navData from '../config/navigation.json';
import messages from '../messages/en.json';

/** A next-intl-like `t` over the real English messages, with `t.has`. */
function englishT() {
  const lookup = (key) => key.split('.').reduce((node, part) => node?.[part], messages);
  const t = (key) => {
    const value = lookup(key);
    if (typeof value !== 'string') throw new Error(`MISSING_MESSAGE: ${key}`);
    return value;
  };
  t.has = (key) => typeof lookup(key) === 'string';
  return t;
}

describe('navigation i18n translation mapping', () => {
  it('translates top-level nav labels when keys are available', () => {
    const t = (key, fallback) => {
      const map = {
        'nav.home': 'Inicio',
        'nav.checklists': 'Listas de seguridad',
        'nav.news': 'Noticias',
      };
      return map[key] || fallback;
    };

    const translated = translateMainNavigation(navigationConfig.mainNav, t);

    expect(translated[0].label).toBe('Inicio');
    expect(translated[1].label).toBe('Listas de seguridad');
    expect(translated[2].label).toBe('Noticias');
  });

  it('translates dropdown items and footer link', () => {
    const t = (key, fallback) => {
      const map = {
        'navItems.essentials.title': 'Fundamentos de seguridad',
        'navItems.essentials.description': 'Practicas basicas.',
        'nav.browseAllChecklists': 'Ver todas las listas',
      };
      return map[key] || fallback;
    };

    const translated = translateMainNavigation(navigationConfig.mainNav, t);
    const checklists = translated.find((item) => item.key === 'checklists');
    const essentials = checklists.items.find((item) => item.key === 'essentials');

    expect(essentials.title).toBe('Fundamentos de seguridad');
    expect(essentials.description).toBe('Practicas basicas.');
    expect(checklists.footerLink.title).toBe('Ver todas las listas');
  });

  it('takes every top-level label from the English messages', () => {
    const translated = translateMainNavigation(
      navigationConfig.mainNav,
      createIntlTranslator(englishT()),
    );

    expect(translated.find((item) => item.key === 'home').label).toBe('Home');
    expect(translated.find((item) => item.key === 'resources').label).toBe('Resources');
  });
});

// navigation.json carries no text, so a missing message would render an empty link.
describe('every navigation entry has English strings', () => {
  const t = englishT();
  const mainNavKeys = new Set(navData.mainNav);

  it.each(Object.entries(navData.items))('%s has a title', (key, item) => {
    const titleKey = mainNavKeys.has(key) ? `nav.${key}` : `${navItemMessageKey(key)}.title`;
    expect(t.has(titleKey), titleKey).toBe(true);
    if (item.kind) {
      expect(t.has(`${navItemMessageKey(key)}.label`), `${key} needs a label`).toBe(true);
    }
  });

  it('checklists in sections have a description', () => {
    const keys = navData.checklistSections.flatMap((section) => section.items);
    for (const key of keys) {
      const descriptionKey = `${navItemMessageKey(key)}.description`;
      expect(t.has(descriptionKey), descriptionKey).toBe(true);
    }
  });

  it('menus, footer sections, and social links have their strings', () => {
    for (const key of Object.keys(navData.menus)) expect(t.has(`nav.${key}`), key).toBe(true);
    for (const section of navData.footer.sections) {
      expect(t.has(`footer.sections.${section.key}`), section.key).toBe(true);
    }
    for (const key of Object.keys(navData.social)) {
      expect(t.has(`footer.social.${key}AriaLabel`), key).toBe(true);
    }
    expect(t.has('nav.browseAllChecklists')).toBe(true);
  });
});

describe('getTranslatedNavItemFields', () => {
  it('maps kebab-case nav keys to the same messages as the header (police-door-poster)', () => {
    const translateText = (key, fallback) => {
      if (key === 'navItems.policeDoorPoster.title') return 'Póster policía';
      return fallback;
    };
    const out = getTranslatedNavItemFields(
      'police-door-poster',
      { title: 'Police poster', description: 'Desc' },
      translateText,
    );
    expect(out.title).toBe('Póster policía');
    expect(out.description).toBe('Desc');
  });

  it('uses the title as the label when the item has no separate label', () => {
    const out = getTranslatedNavItemFields('protest', {}, createIntlTranslator(englishT()));
    expect(out.label).toBe(out.title);
    expect(out.title).toBe(messages.navItems.protest.title);
  });

  it('returns fallbacks unchanged when the nav key has no message map entry', () => {
    const translateText = (_key, fallback) => fallback;
    const out = getTranslatedNavItemFields(
      'unknown-guide',
      { title: 'T', description: 'D' },
      translateText,
    );
    expect(out.title).toBe('T');
    expect(out.description).toBe('D');
  });
});

describe('createIntlTranslator', () => {
  it('returns fallback when t throws', () => {
    const translateText = createIntlTranslator(() => {
      throw new Error('missing');
    });
    expect(translateText('nav.home', 'Home')).toBe('Home');
  });

  it('returns fallback without calling t when t.has says the key is missing', () => {
    const t = () => {
      throw new Error('should not be called');
    };
    t.has = () => false;
    expect(createIntlTranslator(t)('navItems.vpn.description', undefined)).toBeUndefined();
  });
});
