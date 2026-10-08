'use client';

import { useEffect, useRef } from 'react';

/**
 * Aligns draft-preview GitHub repo cookies with Keystatic’s effective repo (upstream vs fork)
 * using the same GraphQL rules as Keystatic — no manual `repo=` URL param.
 */
export default function PreviewForkSync() {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (process.env.NEXT_PUBLIC_KEYSTATIC_STORAGE !== 'github') {
      return;
    }
    fetch('/api/preview/sync-repo', {
      method: 'POST',
      credentials: 'same-origin',
    }).catch(() => {});
  }, []);

  return null;
}
