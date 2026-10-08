export const LANGUAGE_BANNER_STORAGE_KEY = 'language-banner-dismissed';

export function getDetectedLocaleFromNavigatorLanguage(
  navigatorLanguage,
  defaultLocale,
  locales = [],
) {
  const browserLang = navigatorLanguage?.split('-')[0];
  if (!browserLang) return null;
  if (browserLang === defaultLocale) return null;
  if (!locales.includes(browserLang)) return null;
  return browserLang;
}

export function shouldShowLanguageBanner({
  currentLocale,
  defaultLocale,
  dismissed,
  detectedLocale,
}) {
  if (currentLocale !== defaultLocale) return false;
  if (dismissed) return false;
  if (!detectedLocale) return false;
  return true;
}
