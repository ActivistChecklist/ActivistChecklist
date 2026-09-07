const RTL_LOCALES = new Set(['ar']);
const OPEN_GRAPH_LOCALE_MAP = {
  en: 'en_US',
  es: 'es_ES',
  ar: 'ar_AR',
};

export function isRtlLocale(locale) {
  if (!locale) return false;
  return RTL_LOCALES.has(String(locale).toLowerCase());
}

export function getLocaleDir(locale) {
  return isRtlLocale(locale) ? 'rtl' : 'ltr';
}

export function getOpenGraphLocale(locale) {
  const normalized = String(locale || '').toLowerCase();
  return OPEN_GRAPH_LOCALE_MAP[normalized] || OPEN_GRAPH_LOCALE_MAP.en;
}

