'use client';
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  VIEW_MODES,
  isValidViewMode,
  resolveViewMode,
  storageKeyForGuide,
} from '@/lib/view-mode-resolver';

/**
 * Per-guide view mode: 'detailed' (default) or 'compact'.
 *
 * Persistence:
 *   - URL query param `?view=compact` (shareable; omitted in detailed mode)
 *   - localStorage key `checklist-view:{guideSlug}` (per-guide, not global)
 *
 * Resolution on mount: URL > localStorage > 'detailed'.
 * Toggling writes both.
 *
 * Reads/writes the URL via `window.location` + `history.replaceState` rather
 * than next/navigation, so this provider doesn't trigger Next.js static-gen
 * bailouts from `useSearchParams()`.
 */

const ViewModeContext = createContext({
  viewMode: VIEW_MODES.DETAILED,
  setViewMode: () => {},
});

function readUrlParam() {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('view');
}

function writeUrlParam(value) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (value === VIEW_MODES.DETAILED) {
    url.searchParams.delete('view');
  } else {
    url.searchParams.set('view', value);
  }
  // Drop a trailing `?` if there are no params.
  const newUrl = url.searchParams.toString()
    ? `${url.pathname}?${url.searchParams.toString()}${url.hash}`
    : `${url.pathname}${url.hash}`;
  window.history.replaceState(null, '', newUrl);
}

export function ViewModeProvider({ guideSlug, children }) {
  // Server render and first client paint default to 'detailed'.
  // After mount we resolve URL > localStorage > default.
  const [viewMode, setViewModeState] = useState(VIEW_MODES.DETAILED);

  useEffect(() => {
    if (!guideSlug) return;
    let stored = null;
    try {
      stored = localStorage.getItem(storageKeyForGuide(guideSlug));
    } catch {}
    const resolved = resolveViewMode(readUrlParam(), stored);
    if (resolved !== viewMode) setViewModeState(resolved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guideSlug]);

  const setViewMode = useCallback(
    (next) => {
      if (!isValidViewMode(next)) return;
      setViewModeState(next);
      if (guideSlug) {
        try {
          localStorage.setItem(storageKeyForGuide(guideSlug), next);
        } catch {}
      }
      writeUrlParam(next);
    },
    [guideSlug]
  );

  return (
    <ViewModeContext.Provider value={{ viewMode, setViewMode }}>
      {children}
    </ViewModeContext.Provider>
  );
}

export function useViewMode() {
  return useContext(ViewModeContext);
}

export { VIEW_MODES };
