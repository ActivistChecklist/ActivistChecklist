import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  // Keep in sync with LOCALES in lib/i18n-config.mjs (checked in __tests__/i18n-config.test.js).
  // Listed literally so next-intl's Locale type stays a union of string literals.
  locales: ['en', 'es', 'fr', 'it', 'ja'],
  defaultLocale: 'en',
  // English has no URL prefix: / → /en internally
  // Other locales keep their prefix (/es/, /fr/, /it/, /ja/)
  localePrefix: 'as-needed',
  // The URL alone decides the locale. By default next-intl writes a NEXT_LOCALE
  // cookie from the browser when someone switches language, and the privacy
  // page promises no cookies. The live static site has no proxy and Apache
  // serves bare URLs as English, so detection is off too. With detection on
  // and no cookie, the dev and preview proxy would send a Spanish browser from
  // /x/ to /es/x/ every time, even right after a switch back to English.
  // LanguageDetectionBanner does the suggesting instead.
  localeCookie: false,
  localeDetection: false,
});
