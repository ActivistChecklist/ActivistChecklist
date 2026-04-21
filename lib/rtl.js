const RTL_LOCALES = new Set(['ar']);

export function isRtlLocale(locale) {
  if (!locale) return false;
  return RTL_LOCALES.has(String(locale).toLowerCase());
}

export function getLocaleDir(locale) {
  return isRtlLocale(locale) ? 'rtl' : 'ltr';
}

