'use client';

import { useLocale } from 'next-intl';
import { IoCloudDownloadOutline } from 'react-icons/io5';
import { Button } from '@/components/ui/button';
import { LOCALES } from '@/lib/i18n-config.mjs';
import { designedPdfPath, pdfDownloadOrder } from '@/lib/pdf/catalog.mjs';
import { pdfDownloadName } from '@/lib/pdf-export.mjs';
import { trackFileDownload } from '@/lib/download-tracker';

/**
 * Download buttons for a designed PDF (config/pdfs.mjs). The big button is
 * the page's own language, or English when the PDF isn't published in it; each
 * other language gets a smaller button named in that language, so a reader
 * finds theirs without reading the page's.
 *
 * `title` is the big button's text, translated along with the page.
 */
export default function PdfDownload({ slug, title }) {
  const pageLocale = useLocale();
  const [first, ...others] = pdfDownloadOrder(slug, pageLocale);
  if (!first) {
    console.warn(`PdfDownload: no PDF "${slug}" in config/pdfs.mjs`);
    return null;
  }

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
    </div>
  );
}

function PdfButton({ slug, locale, children, ...buttonProps }) {
  const fileName = pdfDownloadName(locale, slug);
  return (
    <Button asChild {...buttonProps}>
      <a
        href={designedPdfPath(locale, slug)}
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
