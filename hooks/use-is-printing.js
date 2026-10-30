'use client';

import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

/**
 * True while the browser is printing (Ctrl+P, or the build-time PDF export in
 * scripts/build-pdfs.mjs, which fires `beforeprint` itself).
 *
 * For content CSS cannot reveal: Radix Collapsible does not render its children
 * at all while closed, so a print stylesheet has nothing to show. flushSync is
 * what makes this work, because the browser lays out the print copy as soon as
 * the `beforeprint` handlers return, before a normally scheduled render.
 */
export function useIsPrinting() {
  const [isPrinting, setIsPrinting] = useState(false);

  useEffect(() => {
    const before = () => flushSync(() => setIsPrinting(true));
    const after = () => setIsPrinting(false);
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);

  return isPrinting;
}
