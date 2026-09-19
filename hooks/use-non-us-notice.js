'use client';

import { useEffect, useState } from 'react';
import {
  detectBrowserTimezone,
  shouldShowNonUsNotice,
  NON_US_NOTICE_STORAGE_KEY,
} from '@/lib/us-timezone';

/**
 * Visibility + dismissal state for the non-US threat-model notice.
 *
 * Hidden on first render by design, and only revealed once client-side JS has
 * actually checked the browser timezone. Visitors with JS disabled therefore
 * never see it: without JS we cannot tell where someone is, and showing a
 * warning about tools being illegal abroad to every no-JS visitor (most of whom
 * are in the US) is noise rather than protection.
 *
 * Note this is the render default only. Once JS runs, shouldShowNonUsNotice
 * still fails safe: an undetectable timezone counts as non-US and shows.
 */
export function useNonUsNotice() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(NON_US_NOTICE_STORAGE_KEY) === 'true';
    } catch {
      // localStorage may be unavailable (private mode, etc.) — treat as not dismissed
    }
    if (shouldShowNonUsNotice({ dismissed, timezone: detectBrowserTimezone() })) {
      setShow(true);
    }
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(NON_US_NOTICE_STORAGE_KEY, 'true');
    } catch {
      // localStorage may be unavailable — still hide for this session
    }
    setShow(false);
  };

  return { show, dismiss };
}
