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
 * client-detected and applies to every page. It renders hidden and is only
 * revealed by useNonUsNotice once JS confirms a non-US timezone, so it is
 * absent from the server-rendered HTML and for visitors without JS.
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

  return (
    <div className={styles.container} role="status" aria-label="Page notices">
      {showNonUs && (
        <Notice
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
