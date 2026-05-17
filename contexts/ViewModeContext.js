'use client';
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
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
 */

const ViewModeContext = createContext({
  viewMode: VIEW_MODES.DETAILED,
  setViewMode: () => {},
});

export function ViewModeProvider({ guideSlug, children }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Initial paint: use URL only (server can read it). localStorage hydrates post-mount.
  const urlParam = searchParams.get('view');
  const initial = isValidViewMode(urlParam) ? urlParam : VIEW_MODES.DETAILED;
  const [viewMode, setViewModeState] = useState(initial);

  useEffect(() => {
    if (!guideSlug) return;
    let stored = null;
    try {
      stored = localStorage.getItem(storageKeyForGuide(guideSlug));
    } catch {}
    const resolved = resolveViewMode(urlParam, stored);
    if (resolved !== viewMode) setViewModeState(resolved);
    // Mount-only: react to guide changes. URL-driven changes from our own
    // setViewMode call avoid a race where the URL hasn't repainted yet.
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
      const params = new URLSearchParams(searchParams.toString());
      if (next === VIEW_MODES.DETAILED) params.delete('view');
      else params.set('view', next);
      const qs = params.toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      router.replace(url, { scroll: false });
    },
    [guideSlug, pathname, router, searchParams]
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
