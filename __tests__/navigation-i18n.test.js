import { describe, it, expect } from 'vitest';
import {
  createIntlTranslator,
  getTranslatedNavItemFields,
  translateMainNavigation,
} from '../lib/navigation-i18n';
import { navigationConfig } from '../config/navigation';

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

  it('falls back to existing labels when translation is missing', () => {
    const t = (_key, fallback) => fallback;
    const translated = translateMainNavigation(navigationConfig.mainNav, t);

    const home = translated.find((item) => item.key === 'home');
    const resources = translated.find((item) => item.key === 'resources');

    expect(home.label).toBe('Home');
    expect(resources.label).toBe('Resources');
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
      translateText
    );
    expect(out.title).toBe('Póster policía');
    expect(out.description).toBe('Desc');
  });

  it('returns fallbacks unchanged when the nav key has no message map entry', () => {
    const translateText = (_key, fallback) => fallback;
    const out = getTranslatedNavItemFields(
      'unknown-guide',
      { title: 'T', description: 'D' },
      translateText
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
});
