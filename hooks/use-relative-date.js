'use client';

import { useEffect, useState } from 'react';
import { useLocale } from 'next-intl';
import { formatRelativeDate, formatStableContentDate } from '@/lib/utils';
import { getIntlLocale } from '@/lib/i18n-config';

/**
 * A relative date ("Today", "3 days ago") that is safe to server-render.
 *
 * This site is a static export, so server HTML is frozen at build time while the
 * browser evaluates at page load. Rendering `formatRelativeDate` directly meant
 * an item built as "Today" hydrated the next day as "Yesterday" — a text
 * mismatch that React aborts the whole tree on (minified error #418), taking
 * every client component on the page down with it.
 *
 * So the first render is deterministic (an absolute date, identical on server
 * and client) and the relative wording is applied only after mount. Entries
 * older than 30 days already display an absolute date, so for them the two
 * agree and nothing visibly changes.
 *
 * @param {string} dateString - ISO or YYYY-MM-DD
 * @returns {string} the text to render
 */
export function useRelativeDate(dateString) {
  const locale = useLocale();
  const dateLocale = getIntlLocale(locale);

  // Deterministic on both sides of hydration.
  const stable = formatStableContentDate(dateString, dateLocale);
  const [text, setText] = useState(stable);

  useEffect(() => {
    setText(formatRelativeDate(dateString, dateLocale));
  }, [dateString, dateLocale]);

  return text;
}
