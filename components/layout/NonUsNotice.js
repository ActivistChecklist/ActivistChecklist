'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import styles from '@/styles/PageNotices.module.css';
import Notice from './Notice';
import {
  isUsTimezone,
  detectBrowserTimezone,
  NON_US_NOTICE_STORAGE_KEY,
} from '@/lib/us-timezone';

/**
 * Site-wide warning shown to visitors whose browser timezone is not on the US
 * allowlist. Default-visible on first render (fail-safe); hidden once the
 * browser confirms a US timezone or the user dismisses it (persisted in
 * localStorage).
 */
export default function NonUsNotice() {
  const t = useTranslations();
  const [show, setShow] = useState(true);

  useEffect(() => {
    try {
      if (localStorage.getItem(NON_US_NOTICE_STORAGE_KEY) === 'true') {
        setShow(false);
        return;
      }
    } catch {
      // localStorage may be unavailable (private mode, etc.) — fail safe, keep showing
    }
    if (isUsTimezone(detectBrowserTimezone())) {
      setShow(false);
    }
  }, []);

  if (!show) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(NON_US_NOTICE_STORAGE_KEY, 'true');
    } catch {
      // localStorage may be unavailable — still hide for this session
    }
    setShow(false);
  };

  return (
    <div
      className={styles.container}
      role="status"
      aria-label="Page notices"
      data-non-us-notice
    >
      <Notice
        type="warning"
        message={t('pageNotices.nonUsThreatModel')}
        onDismiss={dismiss}
        dismissLabel={t('pageNotices.dismiss')}
      />
    </div>
  );
}
