'use client';

import { useEffect } from 'react';

function scrollToHash() {
  const id = window.location.hash?.slice(1);
  if (!id) return;
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ block: 'start', behavior: 'auto' });
}

/**
 * Scroll to `location.hash` once after client effects and layout settle.
 * Guide’s useEffect runs after all descendant useEffects (e.g. ChecklistItem
 * localStorage). Those updates paint in the next commit; double rAF runs after
 * that paint so expanded rows don’t leave the viewport wrong.
 */
export function useGuideHashScroll() {
  useEffect(() => {
    let raf2;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(scrollToHash);
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2 != null) cancelAnimationFrame(raf2);
    };
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      scrollToHash();
      requestAnimationFrame(() => {
        requestAnimationFrame(scrollToHash);
      });
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
}
