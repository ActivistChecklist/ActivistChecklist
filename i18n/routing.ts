import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['en', 'es', 'ar'],
  defaultLocale: 'en',
  // English has no URL prefix: / → /en internally
  // Spanish keeps /es/ prefix
  localePrefix: 'as-needed',
  // Default: negotiate locale from URL, then NEXT_LOCALE cookie, then Accept-Language.
  // Switching locale via the globe updates the cookie for later visits.
});
