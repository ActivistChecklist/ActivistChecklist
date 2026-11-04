'use client';

import { RefreshCw } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useIsPrinting } from '@/hooks/use-is-printing';
import { getIntlLocale } from '@/lib/i18n-config';
import { shortenUrlForPrint } from '@/lib/pdf-export.mjs';

/**
 * Print-only notice at the top of a guide: when this copy was made and where
 * the live version is. Paper and PDF copies outlive the content they hold.
 *
 * Filled in on `beforeprint` (which the PDF export fires too), so the date is
 * when the copy was made, not when the page was built.
 */
export default function PrintNotice() {
  const t = useTranslations();
  const locale = useLocale();
  const isPrinting = useIsPrinting();

  if (!isPrinting) return <div className="hidden" aria-hidden="true" />;

  const url = document.querySelector('link[rel="canonical"]')?.href || window.location.href;
  const date = new Date().toLocaleDateString(getIntlLocale(locale), {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="hidden print:flex gap-3 items-start mb-4 rounded-md border border-border px-4 py-3 break-inside-avoid">
      <RefreshCw className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" aria-hidden="true" />
      <p className="m-0">
        <strong>{t('printNotice.madeOn', { date })}</strong> {t('printNotice.updatesOften')}{' '}
        <a href={url} className="no-print-url font-semibold underline">
          {shortenUrlForPrint(url, 'https://invalid/') ?? url}
        </a>
      </p>
    </div>
  );
}
