import { describe, it, expect } from 'vitest';
import {
  LANGUAGE_BANNER_STORAGE_KEY,
  getDetectedLocaleFromNavigatorLanguage,
  shouldShowLanguageBanner,
} from '../lib/language-detection';

describe('language detection helpers', () => {
  it('exposes stable storage key for banner dismissal', () => {
    expect(LANGUAGE_BANNER_STORAGE_KEY).toBe('language-banner-dismissed');
  });

  describe('getDetectedLocaleFromNavigatorLanguage', () => {
    it('detects supported non-default browser locale', () => {
      expect(getDetectedLocaleFromNavigatorLanguage('es-MX', 'en', ['en', 'es'])).toBe('es');
      expect(getDetectedLocaleFromNavigatorLanguage('es', 'en', ['en', 'es'])).toBe('es');
    });

    it('returns null for default locale browser language', () => {
      expect(getDetectedLocaleFromNavigatorLanguage('en-US', 'en', ['en', 'es'])).toBe(null);
    });

    it('returns null for unsupported locales', () => {
      expect(getDetectedLocaleFromNavigatorLanguage('fr-FR', 'en', ['en', 'es'])).toBe(null);
    });

    it('returns null for missing browser language', () => {
      expect(getDetectedLocaleFromNavigatorLanguage(undefined, 'en', ['en', 'es'])).toBe(null);
    });
  });

  describe('shouldShowLanguageBanner', () => {
    it('shows banner only on default locale when not dismissed and locale detected', () => {
      expect(
        shouldShowLanguageBanner({
          currentLocale: 'en',
          defaultLocale: 'en',
          dismissed: false,
          detectedLocale: 'es',
        }),
      ).toBe(true);
    });

    it('hides banner on non-default locale routes', () => {
      expect(
        shouldShowLanguageBanner({
          currentLocale: 'es',
          defaultLocale: 'en',
          dismissed: false,
          detectedLocale: 'es',
        }),
      ).toBe(false);
    });

    it('hides banner when dismissed', () => {
      expect(
        shouldShowLanguageBanner({
          currentLocale: 'en',
          defaultLocale: 'en',
          dismissed: true,
          detectedLocale: 'es',
        }),
      ).toBe(false);
    });

    it('hides banner when no locale was detected', () => {
      expect(
        shouldShowLanguageBanner({
          currentLocale: 'en',
          defaultLocale: 'en',
          dismissed: false,
          detectedLocale: null,
        }),
      ).toBe(false);
    });
  });
});
