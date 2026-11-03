import { describe, it, expect } from 'vitest';
import { getNavCopy, resolveNavCopy, withNavCopy } from '../lib/nav-copy';
import { navItemMessageId } from '../lib/navigation-i18n';
import navData from '../config/navigation.json';
import enMessages from '../messages/en.json';

const english = {
  title: 'Signal Security Checklist',
  navTitle: 'Signal security',
  navDescription: 'Secure your Signal messaging app.',
};
const previous = { title: 'Seguridad en Signal (antes)', description: 'Descripción de antes.' };

describe('resolveNavCopy in English', () => {
  it('uses navTitle and navDescription', () => {
    expect(resolveNavCopy(english, null)).toEqual({
      title: 'Signal security',
      description: 'Secure your Signal messaging app.',
    });
  });

  it('falls back to title and leaves out a blank description', () => {
    const out = resolveNavCopy({ title: 'How to use Proton safely', navDescription: '  ' }, null);
    expect(out).toEqual({ title: 'How to use Proton safely' });
    expect('description' in out).toBe(false);
  });

  it('flattens YAML block scalars', () => {
    const out = resolveNavCopy({ title: 'T', navDescription: 'Line one\nline two.\n' }, null);
    expect(out.description).toBe('Line one line two.');
  });
});

describe('resolveNavCopy in other locales', () => {
  const translated = {
    title: 'Lista de seguridad de Signal',
    navTitle: 'Seguridad en Signal',
    navDescription: 'Asegura Signal.',
  };

  it("prefers the locale's own navTitle and navDescription over the previous translation", () => {
    expect(resolveNavCopy(english, translated, previous)).toEqual({
      title: 'Seguridad en Signal',
      description: 'Asegura Signal.',
    });
  });

  it('uses the previous translation while the locale has no navTitle yet', () => {
    expect(resolveNavCopy(english, { title: translated.title }, previous)).toEqual(previous);
  });

  it('treats fields Crowdin left in English as untranslated', () => {
    expect(resolveNavCopy(english, { ...english }, previous)).toEqual(previous);
  });

  it("uses the locale's translated title when there is no previous translation", () => {
    expect(resolveNavCopy(english, { title: 'Lista de seguridad de Signal' })).toEqual({
      title: 'Lista de seguridad de Signal',
      description: 'Secure your Signal messaging app.',
    });
  });

  it('falls back to English when the locale has nothing of its own', () => {
    const expected = { title: 'Signal security', description: 'Secure your Signal messaging app.' };
    expect(resolveNavCopy(english, null)).toEqual(expected);
    expect(resolveNavCopy(english, { ...english, navTitle: '' })).toEqual(expected);
  });
});

describe('getNavCopy over the real content', () => {
  const copy = getNavCopy('en');

  it('covers guides and pages but not items without an MDX file', () => {
    expect(copy.essentials).toBeDefined();
    expect(copy['police-door-poster']).toBeDefined();
    for (const key of ['home', 'news', 'contact', 'tools', 'updates']) {
      expect(copy[key], key).toBeUndefined();
    }
  });

  it('gives every guide and page a title', () => {
    for (const [key, { title }] of Object.entries(copy)) expect(title, key).toBeTruthy();
  });

  it('gives every checklist and featured how-to a description for its card', () => {
    const keys = navData.checklistSections.flatMap((section) => [
      ...section.items,
      ...section.featured,
    ]);
    for (const key of keys) expect(copy[key]?.description, key).toBeTruthy();
  });

  it('keeps translated titles in the other locales', () => {
    expect(getNavCopy('es').essentials.title).not.toBe(copy.essentials.title);
  });
});

describe('one source of truth', () => {
  it('messages/en.json has no navItems entry for a guide or page', () => {
    for (const key of Object.keys(getNavCopy('en'))) {
      expect(enMessages.navItems[navItemMessageId(key)], key).toBeUndefined();
    }
  });
});

describe('withNavCopy', () => {
  it('adds guides and pages under navItems and keeps the en.json entries', () => {
    const messages = withNavCopy(enMessages, 'en');
    expect(messages.navItems.policeDoorPoster.title).toBe('"Police at the door" poster');
    expect(messages.navItems.updates).toEqual(enMessages.navItems.updates);
    expect(enMessages.navItems.policeDoorPoster).toBeUndefined();
  });

  // `xx` has no content of its own, so only the old locale messages can supply text.
  it("keeps a locale's old messages until Crowdin's sync removes them", () => {
    const stale = {
      ...enMessages,
      navItems: {
        ...enMessages.navItems,
        protest: { title: 'Prepárate', description: 'Para quienes van a una protesta.' },
        policeDoorPoster: { title: 'Póster policía', label: 'Póster "La poli"' },
      },
      checklistSections: { ...enMessages.checklistSections, descriptions: { party: 'Agenda.' } },
    };
    const { navItems } = withNavCopy(stale, 'xx');
    expect(navItems.protest).toEqual({
      title: 'Prepárate',
      description: 'Para quienes van a una protesta.',
    });
    expect(navItems.policeDoorPoster.title).toBe('Póster "La poli"');
    expect(navItems.party.description).toBe('Agenda.');
    expect(navItems.essentials.title).toBe(getNavCopy('en').essentials.title);
  });

  it('ignores stale en.json entries for English', () => {
    const stale = { ...enMessages, navItems: { protest: { title: 'Old' } } };
    expect(withNavCopy(stale, 'en').navItems.protest.title).toBe('Prepare for a protest');
  });
});
