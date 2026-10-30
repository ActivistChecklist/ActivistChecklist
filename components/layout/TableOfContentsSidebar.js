'use client';

import React, { useEffect } from 'react';
import { ChevronDown, CircleCheck, TableOfContents } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTableOfContents } from '@/contexts/TableOfContentsContext';
import { useAllSectionProgress } from '@/contexts/ChecklistProgressContext';
import SectionProgressBar from '@/components/guides/SectionProgressBar';
import { cn } from '@/lib/utils';
import { assignHeadingIds } from '@/lib/heading-anchor';
import { SidebarGroup, SidebarMenu, SidebarMenuItem } from '@/components/ui/sidebar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

// This function can be used both client and server side
export function extractHeaders(content, enableH3 = true) {
  if (!content) return [];

  const headerElements = Array.from(content.querySelectorAll(enableH3 ? 'h2, h3' : 'h2'));
  const ids = assignHeadingIds(
    headerElements.map((header) => ({ id: header.id, text: header.innerText })),
  );
  const headersData = headerElements.map((header, index) => ({
    id: ids[index],
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

/**
 * Rows the TOC shows. At h3 depth with a page title, a lead row for the page
 * itself comes first so readers can jump back to the top.
 */
function buildTocEntries(headers, includeH3, tocPageTitle) {
  const leadTitle = tocPageTitle?.trim();
  if (!includeH3 || !leadTitle) return headers;
  return [
    {
      id: 'toc-page-overview',
      text: leadTitle,
      level: 2,
      /** Scroll target (main has id="main-content"); link uses this for href/# */
      scrollTargetId: 'main-content',
    },
    ...headers,
  ];
}

function TocList({ entries, onNavigate, linkClassName }) {
  const { activeId } = useTableOfContents();
  const sectionProgress = useAllSectionProgress();
  const t = useTranslations();

  return (
    <SidebarMenu>
      {entries.map((header) => {
        const linkId = header.scrollTargetId ?? header.id;
        const isActive = activeId === linkId;
        const progress = sectionProgress[header.id];
        return (
          <SidebarMenuItem key={header.id} className="overflow-visible">
            <a
              href={`#${linkId}`}
              aria-current={isActive ? 'location' : undefined}
              className={cn(
                'block py-1 text-sm text-pretty',
                'pl-3 border-l-2',
                linkClassName,
                header.level === 3 && 'ml-4',
                !isActive &&
                  'text-muted-foreground border-transparent hover:text-foreground hover:border-muted-foreground',
                isActive &&
                  (progress?.complete ? 'text-success border-success' : 'text-link border-link'),
              )}
              onClick={(e) => onNavigate(e, linkId)}
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
  );
}

export function TableOfContentsSidebar({ initialHeaders = [], tocDepth = 2, tocPageTitle }) {
  const { headers, setHeaders, setActiveId, setTocLeadScrollTargetId } = useTableOfContents();
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
  const entries = buildTocEntries(displayHeaders, includeH3, tocPageTitle);

  if (entries.length === 0) {
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
        <h5 className="flex items-center gap-2 font-bold mb-4">{t('tableOfContents.title')}</h5>
        <TocList
          entries={entries}
          onNavigate={(e, linkId) => {
            document.getElementById(linkId)?.scrollIntoView();
            setActiveId(linkId);
          }}
        />
      </SidebarGroup>
    </div>
  );
}

/**
 * Phone and small-tablet version of the TOC: a collapsed "On this page" box
 * near the top of the content, like Wikipedia's. The desktop sidebar is
 * hidden below `md`, so this fills in. Headers come from context, which
 * TableOfContentsSidebar fills even while it is hidden.
 *
 * The box renders before headers arrive so it doesn't shift the page when
 * they do. It has no h2/h3 of its own, which would end up in the TOC.
 */
export function MobileTableOfContents({ className }) {
  const { headers, setActiveId } = useTableOfContents();
  const t = useTranslations();

  return (
    <Collapsible
      className={cn('not-annotatable md:hidden print:hidden mb-6 rounded-lg border', className)}
      data-pagefind-ignore
    >
      <CollapsibleTrigger className="group flex w-full items-center gap-2 px-4 py-3 text-left font-semibold">
        <TableOfContents className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="flex-1">{t('tableOfContents.title')}</span>
        <ChevronDown
          className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-3">
        <TocList
          entries={headers}
          linkClassName="py-2"
          onNavigate={(e, linkId) => {
            document.getElementById(linkId)?.scrollIntoView();
            setActiveId(linkId);
          }}
        />
      </CollapsibleContent>
    </Collapsible>
  );
}
