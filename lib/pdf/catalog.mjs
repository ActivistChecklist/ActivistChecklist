/**
 * Where designed PDFs (config/pdfs.mjs) are served and which to offer.
 * Imported by the download button, so nothing here may touch Node built-ins.
 */

import { DEFAULT_LOCALE } from '../i18n-config.mjs';
import { PDFS } from '../../config/pdfs.mjs';

/** Public URL path of a designed PDF. Served from out/files/pdf/ (public/files/pdf/ in dev). */
export function designedPdfPath(locale, slug) {
  return `/files/pdf/${locale}/${slug}.pdf`;
}

/** Public URL path of the PDF's preview image, rendered from the same page as the PDF. */
export function designedPreviewPath(locale, slug) {
  return `/files/pdf/${locale}/${slug}.webp`;
}

/**
 * Add a content version to a URL, so a browser or CDN that cached an older
 * copy fetches the new one (see lib/pdf/versions.cjs). No version, no change.
 */
export function withVersion(url, version) {
  return version ? `${url}?v=${encodeURIComponent(version)}` : url;
}

/**
 * The languages to offer for a PDF, main one first. The main one is the
 * page's own language when the PDF is published in it, otherwise English.
 * Only English pages list the other languages too: a reader on a translated
 * page already has the poster in their language, or in English when it
 * isn't translated yet. Empty for an unknown slug.
 */
export function pdfDownloadOrder(slug, pageLocale, pdfs = PDFS) {
  const locales = Object.hasOwn(pdfs, slug) ? pdfs[slug].locales : [];
  const first = [pageLocale, DEFAULT_LOCALE].find((l) => locales.includes(l)) ?? locales[0];
  if (!first) return [];
  if (pageLocale !== DEFAULT_LOCALE) return [first];
  return [first, ...locales.filter((l) => l !== first)];
}
