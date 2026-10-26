export const DEFAULT_LOCALE = 'en';
export const LOCALES = {
  en: { name: 'English', intlLocale: 'en-US' },
  es: { name: 'Español', intlLocale: 'es-MX' },
  fr: { name: 'Français', intlLocale: 'fr-FR' },
  it: { name: 'Italiano', intlLocale: 'it-IT' },
};

/** BCP 47 locale for `Intl` formatters (dates, relative time). */
export function getIntlLocale(appLocale) {
  return LOCALES[appLocale]?.intlLocale ?? LOCALES[DEFAULT_LOCALE].intlLocale;
}
