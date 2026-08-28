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
 * Visible on first render by design (fail-safe), so visitors with JS disabled
 * still see it. Once the browser confirms a US timezone, or the visitor
 * dismisses it, it hides; dismissal persists in localStorage.
 */
export function useNonUsNotice() {
  const [show, setShow] = useState(true);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(NON_US_NOTICE_STORAGE_KEY) === 'true';
    } catch {
      // localStorage may be unavailable (private mode, etc.) — fail safe, keep showing
    }
    if (!shouldShowNonUsNotice({ dismissed, timezone: detectBrowserTimezone() })) {
      setShow(false);
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
