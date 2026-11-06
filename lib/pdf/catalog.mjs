/**
 * Where designed PDFs (config/pdfs.mjs) are served and which to offer first.
 * Imported by the download button, so nothing here may touch Node built-ins.
 */

import { DEFAULT_LOCALE } from '../i18n-config.mjs';
import { PDFS } from '../../config/pdfs.mjs';

/** Public URL path of a designed PDF. Served from out/files/pdf/ (public/files/pdf/ in dev). */
export function designedPdfPath(locale, slug) {
  return `/files/pdf/${locale}/${slug}.pdf`;
}

/**
 * The languages to offer for a PDF, main one first: the page's own language
 * when the PDF is published in it, otherwise English. Empty for an unknown slug.
 */
export function pdfDownloadOrder(slug, pageLocale, pdfs = PDFS) {
  const locales = Object.hasOwn(pdfs, slug) ? pdfs[slug].locales : [];
  const first = [pageLocale, DEFAULT_LOCALE].find((l) => locales.includes(l)) ?? locales[0];
  return first ? [first, ...locales.filter((l) => l !== first)] : [];
}
