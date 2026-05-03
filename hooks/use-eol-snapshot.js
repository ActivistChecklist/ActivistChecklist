'use client';

import { useEffect, useState } from 'react';
import { loadSnapshot } from '@/lib/updates/snapshot';

/**
 * Hook that lazy-loads the eol-snapshot.json on mount.
 * Cached at module scope (in lib/updates/snapshot.js) so subsequent mounts are free.
 */
export function useEolSnapshot() {
  const [state, setState] = useState({ status: 'loading', snapshot: null, error: null });

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    loadSnapshot({ signal: controller.signal })
      .then((snapshot) => {
        if (!cancelled) setState({ status: 'ready', snapshot, error: null });
      })
      .catch((err) => {
        if (!cancelled && err.name !== 'AbortError') {
          setState({ status: 'error', snapshot: null, error: err });
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  return state;
}
