import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  // Keep in sync with LOCALES in lib/i18n-config.mjs (checked in __tests__/i18n-config.test.js).
  // Listed literally so next-intl's Locale type stays a union of string literals.
  locales: ['en', 'es', 'fr', 'it'],
  defaultLocale: 'en',
  // English has no URL prefix: / → /en internally
  // Other locales keep their prefix (/es/, /fr/, /it/)
  localePrefix: 'as-needed',
  // Default: negotiate locale from URL, then NEXT_LOCALE cookie, then Accept-Language.
  // Switching locale via the globe updates the cookie for later visits.
});
