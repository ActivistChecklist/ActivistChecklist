'use client';

import React, { useEffect } from 'react';
import { CircleCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTableOfContents } from '@/contexts/TableOfContentsContext';
import { useAllSectionProgress } from '@/contexts/ChecklistProgressContext';
import SectionProgressBar from '@/components/guides/SectionProgressBar';
import { cn } from '@/lib/utils';
import { SidebarGroup, SidebarMenu, SidebarMenuItem } from '@/components/ui/sidebar';

// This function can be used both client and server side
export function extractHeaders(content, enableH3 = true) {
  if (!content) return [];

  const headerElements = content.querySelectorAll(enableH3 ? 'h2, h3' : 'h2');
  const headersData = Array.from(headerElements).map((header) => ({
    id:
      header.id ||
      header.innerText
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-+$/, ''),
    text: header.innerText,
    level: parseInt(header.tagName[1]),
  }));

  // Add IDs to headers that don't have them
  headerElements.forEach((header, index) => {
    if (!header.id) {
      header.id = headersData[index].id;
    }
  });

  return headersData;
}

/**
 * Row label that keeps the same size whether or not it is bold. An invisible
 * bold copy shares the grid cell, so turning active never re-wraps the text or
 * pushes the rows below it.
 */
function TocLabel({ text, isActive, className }) {
  return (
    <span className={cn('grid', className)}>
      <span className={cn('col-start-1 row-start-1', isActive && 'font-bold')}>{text}</span>
      <span className="invisible col-start-1 row-start-1 font-bold" aria-hidden>
        {text}
      </span>
    </span>
  );
}

export function TableOfContentsSidebar({ initialHeaders = [], tocDepth = 2, tocPageTitle }) {
  const { headers, setHeaders, activeId, setActiveId, setTocLeadScrollTargetId } =
    useTableOfContents();
  const sectionProgress = useAllSectionProgress();
  const t = useTranslations();

  const includeH3 = Number(tocDepth) >= 3;

  useEffect(() => {
    // Only run client-side header detection if we don't have initial headers
    if (initialHeaders.length === 0) {
      const mainContent = document.getElementById('main-content');
      if (!mainContent) return;

      const headersData = extractHeaders(mainContent, includeH3);
      setHeaders(headersData);
    } else {
      setHeaders(initialHeaders);
    }
  }, [setHeaders, initialHeaders, includeH3]);

  useEffect(() => {
    const lead = includeH3 && tocPageTitle?.trim() ? 'main-content' : null;
    setTocLeadScrollTargetId(lead);
    return () => setTocLeadScrollTargetId(null);
  }, [includeH3, tocPageTitle, setTocLeadScrollTargetId]);

  const displayHeaders = headers.length > 0 ? headers : initialHeaders;

  const leadTitle = tocPageTitle?.trim();
  const headersToRender =
    includeH3 && leadTitle
      ? [
          {
            id: 'toc-page-overview',
            text: leadTitle,
            level: 2,
            /** Scroll target (main has id="main-content"); link uses this for href/# */
            scrollTargetId: 'main-content',
          },
          ...displayHeaders,
        ]
      : displayHeaders;

  if (headersToRender.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        'sticky top-20 max-w-80 max-h-[calc(100vh-6rem)] overflow-y-auto overflow-x-hidden',
        '[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden',
      )}
    >
      <SidebarGroup className="max-w-80">
        <SidebarMenu className="">
          <h5 className="flex items-center gap-2 font-bold mb-4">On this page</h5>
          {headersToRender.map((header) => {
            const linkId = header.scrollTargetId ?? header.id;
            const isActive = activeId === linkId;
            const progress = sectionProgress[header.id];
            return (
              <SidebarMenuItem key={header.id} className="overflow-visible">
                <a
                  href={`#${linkId}`}
                  className={cn(
                    'block py-1 text-sm text-pretty',
                    'pl-3 border-l-2',
                    header.level === 3 && 'ml-4',
                    !isActive &&
                      'text-muted-foreground border-transparent hover:text-foreground hover:border-muted-foreground',
                    isActive &&
                      (progress?.complete
                        ? 'text-success border-success'
                        : 'text-link border-link'),
                  )}
                  onClick={(e) => {
                    document.getElementById(linkId)?.scrollIntoView();
                    setActiveId(linkId);
                  }}
                >
                  {progress ? (
                    <>
                      <span className="flex items-start gap-1.5">
                        <TocLabel text={header.text} isActive={isActive} className="min-w-0" />
                        {progress.complete && (
                          <CircleCheck
                            className="mt-0.5 size-4 shrink-0 text-success motion-safe:animate-success-icon-pop"
                            aria-hidden
                          />
                        )}
                      </span>
                      <span className="mt-1.5 mb-1 flex items-center gap-2">
                        <SectionProgressBar progress={progress} className="flex-1" />
                        {/* Slot is always laid out so the bar keeps its width when the row turns active */}
                        <span
                          className={cn(
                            'w-[5ch] shrink-0 text-right text-xs tabular-nums leading-none',
                            progress.complete ? 'text-success' : 'text-muted-foreground',
                            !isActive && 'invisible',
                          )}
                          aria-hidden
                        >
                          {t('sectionProgress.count', {
                            done: progress.done,
                            total: progress.total,
                          })}
                        </span>
                      </span>
                      <span className="sr-only">
                        {t('sectionProgress.label', { done: progress.done, total: progress.total })}
                      </span>
                    </>
                  ) : (
                    <TocLabel text={header.text} isActive={isActive} />
                  )}
                </a>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroup>
    </div>
  );
}
