'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import styles from '@/styles/PageNotices.module.css';
import Notice from './Notice';
import { useNonUsNotice } from '@/hooks/use-non-us-notice';

/**
 * PageNotices — page-level status notices rendered below the page title.
 * Distinct from inline <Alert>: no left-border accent, feels like page metadata.
 *
 * Every page-level notice belongs here so they stack in one place rather than
 * appearing above and below the title. Notices passed by the page come in via
 * initialNotices; the non-US threat-model notice is built in, because it is
 * client-detected and applies to every page.
 *
 * @param {Array<{ id: string, type: 'warning'|'info', message: string|ReactNode }>} initialNotices
 *
 * Dev console API (development only):
 *   window.__pageNotice('my-id', 'Message text', 'warning')  — add/replace a notice
 *   window.__clearPageNotices()                               — remove all dev-added notices
 */
export default function PageNotices({ initialNotices = [] }) {
  const t = useTranslations();
  const [devNotices, setDevNotices] = useState([]);
  const { show: showNonUs, dismiss: dismissNonUs } = useNonUsNotice();

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;

    window.__pageNotice = (id, message, type = 'warning') => {
      setDevNotices(prev => [...prev.filter(n => n.id !== id), { id, message, type }]);
      console.log(`[PageNotices] Added notice: "${id}"`);
    };
    window.__clearPageNotices = () => {
      setDevNotices([]);
      console.log('[PageNotices] Cleared dev notices');
    };
    console.log(
      '%c[PageNotices] Dev API ready:\n' +
      "  window.__pageNotice('my-id', 'Message', 'warning'|'info')\n" +
      '  window.__clearPageNotices()',
      'color: #888; font-size: 11px'
    );

    return () => {
      delete window.__pageNotice;
      delete window.__clearPageNotices;
    };
  }, []);

  const allNotices = [...initialNotices, ...devNotices];
  if (allNotices.length === 0 && !showNonUs) return null;

  // Pre-hydration hiding: an inline script in app/[locale]/layout.tsx flags an
  // already-dismissed notice on <html>, and globals.css hides anything marked
  // data-non-us-notice. When the non-US notice is the only one, tag the whole
  // container so its spacing collapses along with it.
  const nonUsIsOnlyNotice = showNonUs && allNotices.length === 0;

  return (
    <div
      className={styles.container}
      role="status"
      aria-label="Page notices"
      {...(nonUsIsOnlyNotice && { 'data-non-us-notice': '' })}
    >
      {showNonUs && (
        <Notice
          data-non-us-notice=""
          type="warning"
          message={t('pageNotices.nonUsThreatModel')}
          onDismiss={dismissNonUs}
          dismissLabel={t('pageNotices.dismiss')}
        />
      )}
      {allNotices.map(n => (
        <Notice key={n.id} type={n.type} message={n.message} />
      ))}
    </div>
  );
}
