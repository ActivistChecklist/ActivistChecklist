'use client';

import { useLocale } from 'next-intl';
import { IoCloudDownloadOutline } from 'react-icons/io5';
import { Button } from '@/components/ui/button';
import { LOCALES } from '@/lib/i18n-config.mjs';
import {
  designedPdfPath,
  designedPreviewPath,
  pdfDownloadOrder,
  withVersion,
} from '@/lib/pdf/catalog.mjs';
import { pdfDownloadName, pdfPaperFormat } from '@/lib/pdf-export.mjs';
import { trackFileDownload } from '@/lib/download-tracker';

// Set by next.config.js from lib/pdf/versions.cjs: { 'en/<slug>': 'a1b2c3d4e5' }.
const VERSIONS = JSON.parse(process.env.NEXT_PUBLIC_DESIGNED_PDF_VERSIONS || '{}');

// Image size in CSS px at 1x, so the page keeps the space before it loads.
const PAPER_PX = { Letter: [816, 1056], A4: [794, 1123] };

/**
 * Download buttons for a designed PDF (config/pdfs.mjs). The big button is
 * the page's own language, or English when the PDF isn't published in it.
 * English pages also get a smaller button for each other language, named in
 * that language, so a reader finds theirs without reading English.
 *
 * `title` is the big button's text, translated along with the page.
 * `preview` shows the main language's poster below the buttons. The build
 * renders it from the same page as the PDF, so it always matches.
 */
export default function PdfDownload({ slug, title, preview = false }) {
  const pageLocale = useLocale();
  const [first, ...others] = pdfDownloadOrder(slug, pageLocale);
  if (!first) {
    console.warn(`PdfDownload: no PDF "${slug}" in config/pdfs.mjs`);
    return null;
  }
  const [width, height] = PAPER_PX[pdfPaperFormat(first)];

  return (
    <div className="my-4 flex flex-col items-center gap-3">
      <PdfButton slug={slug} locale={first} size="xl">
        <span>
          {title}
          {first !== pageLocale && (
            <>
              {' · '}
              <span lang={first}>{LOCALES[first].name}</span>
            </>
          )}
        </span>
      </PdfButton>
      {others.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2">
          {others.map((locale) => (
            <PdfButton key={locale} slug={slug} locale={locale} variant="outline">
              {/* One span, so the button's flex gap only sits after the icon */}
              <span>
                <span lang={locale}>{LOCALES[locale].name}</span> (PDF)
              </span>
            </PdfButton>
          ))}
        </div>
      )}
      {preview && (
        // A plain <img>: the static export's image loader rewrites every
        // src to /images/<file>, which would lose this path and its version.
        // Hidden if it fails to load, as on preview servers, which build no PDFs.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={withVersion(designedPreviewPath(first, slug), VERSIONS[`${first}/${slug}`])}
          alt=""
          width={width}
          height={height}
          loading="lazy"
          onError={(e) => {
            e.currentTarget.hidden = true;
          }}
          // An error before hydration fires no onError, so check on mount too.
          ref={(img) => {
            if (img?.complete && img.naturalWidth === 0) img.hidden = true;
          }}
          className="mt-1 h-auto w-full max-w-sm rounded-lg border border-border shadow-xs sm:max-w-md print:max-h-[4.5in] print:w-auto print:shadow-none"
        />
      )}
    </div>
  );
}

function PdfButton({ slug, locale, children, ...buttonProps }) {
  const fileName = pdfDownloadName(locale, slug);
  return (
    <Button asChild {...buttonProps}>
      <a
        href={withVersion(designedPdfPath(locale, slug), VERSIONS[`${locale}/${slug}`])}
        hrefLang={locale}
        download={fileName}
        onClick={() => trackFileDownload(fileName)}
      >
        <IoCloudDownloadOutline aria-hidden="true" />
        {children}
      </a>
    </Button>
  );
}
