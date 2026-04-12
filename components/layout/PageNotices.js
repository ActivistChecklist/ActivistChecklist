'use client';

import { useEffect, useState } from 'react';
import { IoWarning, IoInformationCircle } from 'react-icons/io5';
import styles from '@/styles/PageNotices.module.css';

const ICONS = {
  warning: IoWarning,
  info: IoInformationCircle,
};

function Notice({ type = 'warning', message }) {
  const Icon = ICONS[type] ?? ICONS.warning;
  return (
    <div className={`${styles.notice} ${styles[type]}`}>
      <div className={styles.iconCol}>
        <Icon className={styles.icon} aria-hidden />
      </div>
      <div className={styles.textCol}>{message}</div>
    </div>
  );
}

/**
 * PageNotices — page-level status notices rendered above article content.
 * Distinct from inline <Alert>: no left-border accent, feels like page metadata.
 *
 * @param {Array<{ id: string, type: 'warning'|'info', message: string|ReactNode }>} initialNotices
 *
 * Dev console API (development only):
 *   window.__pageNotice('my-id', 'Message text', 'warning')  — add/replace a notice
 *   window.__clearPageNotices()                               — remove all dev-added notices
 */
export default function PageNotices({ initialNotices = [] }) {
  const [devNotices, setDevNotices] = useState([]);

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
  if (allNotices.length === 0) return null;

  return (
    <div className={styles.container} role="status" aria-label="Page notices">
      {allNotices.map(n => (
        <Notice key={n.id} type={n.type} message={n.message} />
      ))}
    </div>
  );
}
