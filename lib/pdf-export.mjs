/**
 * Shared, dependency-free helpers for the build-time guide PDFs.
 *
 * Imported by the client (Guide.js, for the download link) and by
 * scripts/build-pdfs.mjs (for hashing and rebuild planning), so nothing here
 * may touch Node built-ins.
 */

import { DEFAULT_LOCALE, getIntlLocale } from './i18n-config.mjs';

/** Public URL path of a guide's PDF. Served from out/pdf/ (and public/pdf/ in dev). */
export function pdfPathFor(locale, slug) {
  return `/pdf/${locale}/${slug}.pdf`;
}

/** Filename the browser saves the PDF as. English stays unsuffixed. */
export function pdfDownloadName(locale, slug) {
  const suffix = locale === DEFAULT_LOCALE ? '' : `-${locale}`;
  return `activist-checklist-${slug}${suffix}.pdf`;
}

// Regions where US Letter is the everyday paper size; everywhere else uses A4.
const LETTER_REGIONS = new Set(['US', 'CA', 'MX', 'PH', 'CL', 'CO', 'VE', 'GT', 'CR', 'PR']);

/** Paper size for a locale's PDFs, from the region of its Intl locale (es-MX -> Letter, fr-FR -> A4). */
export function pdfPaperFormat(locale) {
  const region = getIntlLocale(locale).split('-')[1]?.toUpperCase();
  return LETTER_REGIONS.has(region) ? 'Letter' : 'A4';
}

const MAX_PRINT_URL_LENGTH = 60;

/**
 * Short, human-readable form of a link target, for PDF endnotes and the page
 * footer. A printed page cannot be clicked, so the reader has to be able to
 * type it; the full href stays on the PDF link annotation.
 *
 * Returns null when no URL should be printed (same-page anchors, mailto,
 * javascript:, unparseable values).
 */
export function shortenUrlForPrint(href, pageUrl, maxLength = MAX_PRINT_URL_LENGTH) {
  if (!href || href.startsWith('#')) return null;
  let url;
  try {
    url = new URL(href, pageUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  // Same page with a fragment: an in-document jump, not something to type.
  const page = new URL(pageUrl);
  if (url.origin === page.origin && url.pathname === page.pathname && url.hash) return null;

  // Archive links bury the real site under a long prefix; show the original.
  const archived = url.href.match(
    /^https?:\/\/web\.archive\.org\/web\/(?:\d+[a-z_]*\/)?(https?:\/\/.+)$/,
  );
  if (archived) {
    try {
      url = new URL(archived[1]);
    } catch {
      // keep the archive URL
    }
  }

  let text = url.host.replace(/^www\./, '') + url.pathname;
  if (url.pathname === '/') text = url.host.replace(/^www\./, '');
  if (url.search) text += url.search;

  if (text.length > maxLength) {
    text = `${text.slice(0, maxLength - 1)}…`;
  }
  return text;
}

/**
 * Reduce a built page to the parts that change what the PDF looks like, so a
 * rebuild with no content change hashes the same.
 *
 * Next.js writes per-build values into every page: hashed chunk names in
 * <script> tags and the inline RSC payload. Scripts never reach the PDF, so
 * they are dropped. Stylesheet and image URLs are kept and returned as
 * `assetPaths`: the caller hashes those files' bytes, which catches a style
 * change even if a filename were ever reused.
 */
export function normalizeHtmlForHash(html) {
  const head = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? '';
  const bodyMatch = html.match(/<body[^>]*>[\s\S]*<\/body>/i);
  let body = bodyMatch ? bodyMatch[0] : html;

  body = body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  // Hidden route-preload links Next.js scatters through the body.
  body = body.replace(/<link\b[^>]*\/_next\/static\/chunks\/[^>]*>/gi, '');

  const assetPaths = new Set();
  for (const m of head.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"/gi)) {
    assetPaths.add(m[1]);
  }
  for (const m of body.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"/gi)) {
    assetPaths.add(m[1]);
  }
  for (const m of body.matchAll(/<img\b[^>]*\ssrc="([^"]+)"/gi)) {
    assetPaths.add(m[1]);
  }

  // Asset URLs are accounted for by content; their names must not count twice.
  body = body.replace(/\/_next\/static\/[^"'\s)]+/g, '/_next/static/*');

  const localAssets = [...assetPaths]
    .filter((p) => p.startsWith('/') && !p.startsWith('//'))
    .sort();
  return { body, assetPaths: localAssets };
}

/**
 * Decide which PDFs to render.
 *
 * @param targets  [{ key, hash }]  every PDF this build should ship
 * @param manifest { [key]: hash }  what the cache holds from earlier builds
 * @param hasFile  (key) => boolean whether the cached PDF is still on disk
 */
export function planPdfBuild(targets, manifest, hasFile) {
  const stale = [];
  const fresh = [];
  for (const target of targets) {
    if (manifest[target.key] === target.hash && hasFile(target.key)) {
      fresh.push(target);
    } else {
      stale.push(target);
    }
  }
  const wanted = new Set(targets.map((t) => t.key));
  const orphaned = Object.keys(manifest).filter((key) => !wanted.has(key));
  return { stale, fresh, orphaned };
}

/**
 * Number a page's links for the endnote list at the end of a PDF.
 *
 * Inline "(url)" text after every link made the PDF hard to read, so links get
 * a small superscript number instead, and the URLs are listed once at the end
 * for anyone reading on paper. Links to the same page share a number. Endnote
 * URLs are never truncated: on paper the printed address is the only way to
 * reach it, and a long one is usually long because of a file name at the end.
 *
 * @param hrefs   link targets in document order
 * @param pageUrl the page's public URL, to resolve relative links against
 * @returns refs  endnote number per href (null when it needs none, e.g. #anchors)
 *          notes [{ href, text }] in number order
 */
export function assignEndnotes(hrefs, pageUrl) {
  const numbers = new Map();
  const notes = [];
  const refs = hrefs.map((href) => {
    const text = shortenUrlForPrint(href, pageUrl, Infinity);
    if (!text) return null;
    const url = new URL(href, pageUrl);
    url.hash = '';
    const key = url.href;
    if (!numbers.has(key)) {
      notes.push({ href: key, text });
      numbers.set(key, notes.length);
    }
    return numbers.get(key);
  });
  return { refs, notes };
}
