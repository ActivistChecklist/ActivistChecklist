import { describe, it, expect } from 'vitest';
import { LOCALES, getIntlLocale } from '../lib/i18n-config';

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
  });

  it('getIntlLocale maps app locale to Intl BCP 47 tag', () => {
    expect(getIntlLocale('en')).toBe('en-US');
    expect(getIntlLocale('es')).toBe('es-MX');
    expect(getIntlLocale('unknown')).toBe('en-US');
  });
});
