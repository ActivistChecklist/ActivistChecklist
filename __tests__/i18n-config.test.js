import { describe, it, expect } from 'vitest';
import { LOCALES, getIntlLocale } from '../lib/i18n-config';
import { routing } from '../i18n/routing';

describe('i18n locale metadata', () => {
  it('has name and intlLocale for each supported locale', () => {
    for (const [locale, config] of Object.entries(LOCALES)) {
      expect(config.name, `Missing name for ${locale}`).toBeDefined();
      expect(config.intlLocale, `Missing intlLocale for ${locale}`).toBeDefined();
    }
  });

  it('uses expected locale display values', () => {
    expect(LOCALES.en.name).toBe('English');
    expect(LOCALES.es.name).toBe('Español');
    expect(LOCALES.fr.name).toBe('Français');
    expect(LOCALES.it.name).toBe('Italiano');
    expect(LOCALES.ar.name).toBe('العربية');
  });

  it('routes exactly the locales that have metadata', () => {
    expect([...routing.locales].sort()).toEqual(Object.keys(LOCALES).sort());
  });

  it('getIntlLocale maps app locale to Intl BCP 47 tag', () => {
    expect(getIntlLocale('en')).toBe('en-US');
    expect(getIntlLocale('es')).toBe('es-MX');
    expect(getIntlLocale('fr')).toBe('fr-FR');
    expect(getIntlLocale('it')).toBe('it-IT');
    expect(getIntlLocale('ar')).toBe('ar');
    expect(getIntlLocale('unknown')).toBe('en-US');
  });
});
