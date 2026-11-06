'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CircleAlert, CircleCheck } from 'lucide-react';
import Link from '@/components/Link';
import { getCanaryStatus } from '@/lib/canary-status.mjs';
import { getIntlLocale } from '@/lib/i18n-config';
import { cn } from '@/lib/utils';

// Same origin on the clearnet site and the onion, so only our own server sees
// the request (CSP connect-src 'self'). This replaced a third-party badge
// image that sent every visitor's IP address to another company.
const CANARY_URL = '/files/canary.txt';

/**
 * Shows whether the warrant canary is up to date, checked in the visitor's
 * browser against the date signed into canary.txt (see lib/canary-status.mjs).
 *
 * Renders nothing until the check finishes, so the static HTML and visitors
 * without JavaScript (Tor Browser's Safest level) see no status at all rather
 * than a stale one.
 */
export default function CanaryStatus() {
  const t = useTranslations();
  const locale = useLocale();
  const [status, setStatus] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    // no-cache revalidates, so a newly deployed canary shows up right away
    fetch(CANARY_URL, { cache: 'no-cache', signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => setStatus(getCanaryStatus(text)))
      .catch((err) => {
        if (err.name !== 'AbortError') setStatus({ state: 'unknown' });
      });
    return () => controller.abort();
  }, []);

  if (!status) return null;

  if (status.state === 'unknown') {
    return (
      <p className="text-muted-foreground">
        {t.rich('canaryStatus.unknown', {
          link: (chunks) => <Link href={CANARY_URL}>{chunks}</Link>,
        })}
      </p>
    );
  }

  const overdue = status.state === 'overdue';
  const Icon = overdue ? CircleAlert : CircleCheck;
  // The canary's datestamp is UTC, so show UTC calendar dates in every timezone
  const formatDate = (d) =>
    d.toLocaleDateString(getIntlLocale(locale), { dateStyle: 'long', timeZone: 'UTC' });

  // Overdue is a solid red box so it can't be missed. bg-error is a dark red
  // in light mode and a light red in dark mode, so text-background (white or
  // near black) keeps the text readable in both.
  const tone = overdue ? 'text-background' : 'text-success';

  return (
    <p
      className={cn(
        'flex items-start gap-2',
        overdue && 'rounded-lg bg-error p-4 font-medium text-background',
      )}
    >
      <Icon className={cn('mt-1 h-5 w-5 shrink-0', tone)} aria-hidden="true" />
      <span>
        {t.rich(overdue ? 'canaryStatus.overdue' : 'canaryStatus.current', {
          date: formatDate(status.updatedAt),
          validThrough: formatDate(status.validThrough),
          b: (chunks) => <strong className={tone}>{chunks}</strong>,
        })}
      </span>
    </p>
  );
}
