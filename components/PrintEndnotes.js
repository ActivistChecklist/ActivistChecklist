'use client';

import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { useTranslations } from 'next-intl';
import { assignEndnotes } from '@/lib/pdf-export.mjs';

// Links that never reach paper. Checked by class as well as by layout because
// in a browser `beforeprint` fires while the page is still laid out for screen.
const NOT_PRINTED = 'nav, [role=navigation], .no-print, .print\\:hidden, .no-print-url';

/**
 * Numbers each printed link in <main> and lists the URLs at the end, so paper
 * keeps every address without spelling it out mid-sentence. Runs for Ctrl+P and
 * for the PDF export (scripts/build-pdfs.mjs fires `beforeprint` itself).
 *
 * The number is a `data-endnote` attribute drawn by CSS (globals.css), not a
 * node inserted next to the link, so React's DOM is left as it rendered it.
 *
 * Listens in the bubbling phase on purpose: useIsPrinting listens in the
 * capture phase, so collapsed sections have already rendered their links by
 * the time this collects them.
 */
export default function PrintEndnotes() {
  const t = useTranslations();
  const [notes, setNotes] = useState([]);

  useEffect(() => {
    const main = document.getElementById('main-content');
    if (!main) return undefined;

    const before = () => {
      const links = [...main.querySelectorAll('a[href]')].filter(
        (a) =>
          !a.closest(NOT_PRINTED) &&
          !a.closest('[data-endnotes]') &&
          a.getClientRects().length > 0 &&
          getComputedStyle(a).display.startsWith('inline'),
      );
      const pageUrl = document.querySelector('link[rel="canonical"]')?.href || window.location.href;
      const result = assignEndnotes(
        links.map((a) => a.getAttribute('href')),
        pageUrl,
      );
      links.forEach((a, i) => {
        if (result.refs[i]) a.setAttribute('data-endnote', String(result.refs[i]));
      });
      flushSync(() => setNotes(result.notes));
    };
    const after = () => {
      for (const a of main.querySelectorAll('[data-endnote]')) a.removeAttribute('data-endnote');
      setNotes([]);
    };
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);

  // Rendered (hidden) even with no notes so the heading is in the static HTML,
  // where the PDF build's change detection sees a new translation of it.
  return (
    <section
      data-endnotes
      data-pagefind-ignore
      className={notes.length > 0 ? 'hidden print:block print-endnotes' : 'hidden'}
    >
      <h2>{t('printNotice.linksHeading')}</h2>
      <ol>
        {notes.map((note) => (
          <li key={note.href}>
            <a href={note.href}>{note.text}</a>
          </li>
        ))}
      </ol>
    </section>
  );
}
