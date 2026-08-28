'use client';
import React, { createContext, useContext, useState, useEffect } from 'react';

const NAV_HEIGHT = 164; // Height of sticky nav in pixels (keep in sync with observer rootMargin)

/**
 * Which TOC row should be active: either the synthetic “page title” row (scrollTargetId)
 * when the first real heading is still below the nav, or the usual section from headers.
 */
function computeNextActiveId(headers, tocLeadScrollTargetId) {
  if (!headers.length) return undefined;

  if (tocLeadScrollTargetId) {
    const firstEl = document.getElementById(headers[0].id);
    if (firstEl && firstEl.getBoundingClientRect().top > NAV_HEIGHT) {
      return tocLeadScrollTargetId;
    }
  }

  const visibleHeaders = headers
    .map((header) => ({
      ...header,
      element: document.getElementById(header.id),
    }))
    .filter((header) => header.element)
    .sort(
      (a, b) =>
        a.element.getBoundingClientRect().top - b.element.getBoundingClientRect().top
    );

  if (visibleHeaders.length === 0) return undefined;

  const nextHeader = visibleHeaders.find(
    (header) => header.element.getBoundingClientRect().top > NAV_HEIGHT
  );

  const activeHeader = nextHeader
    ? visibleHeaders[Math.max(0, visibleHeaders.indexOf(nextHeader) - 1)]
    : visibleHeaders[visibleHeaders.length - 1];

  return activeHeader?.id;
}

const TableOfContentsContext = createContext({
  headers: [],
  activeId: '',
  tocLeadScrollTargetId: null,
  setHeaders: () => {},
  setActiveId: () => {},
  setTocLeadScrollTargetId: () => {},
});

export function TableOfContentsProvider({ children }) {
  const [headers, setHeaders] = useState([]);
  const [activeId, setActiveId] = useState('');
  const [tocLeadScrollTargetId, setTocLeadScrollTargetId] = useState(null);

  useEffect(() => {
    if (!headers.length) return;

    const observerOptions = {
      rootMargin: `-${NAV_HEIGHT}px 0px -80% 0px`,
      threshold: [0],
    };

    const update = () => {
      const next = computeNextActiveId(headers, tocLeadScrollTargetId);
      if (next !== undefined) {
        setActiveId((prev) => (prev !== next ? next : prev));
      }
    };

    const observer = new IntersectionObserver(update, observerOptions);

    headers.forEach((header) => {
      const element = document.getElementById(header.id);
      if (element) {
        observer.observe(element);
      }
    });

    let ticking = false;
    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          update();
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    update();

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
    };
  }, [headers, tocLeadScrollTargetId]);

  const value = {
    headers,
    activeId,
    tocLeadScrollTargetId,
    setHeaders,
    setActiveId,
    setTocLeadScrollTargetId,
  };

  return (
    <TableOfContentsContext.Provider value={value}>
      {children}
    </TableOfContentsContext.Provider>
  );
}

export function useTableOfContents() {
  const context = useContext(TableOfContentsContext);
  if (!context) {
    throw new Error('useTableOfContents must be used within a TableOfContentsProvider');
  }
  return context;
}
