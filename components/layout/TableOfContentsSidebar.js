"use client"

import React, { useEffect } from 'react';
import { useTableOfContents } from '@/contexts/TableOfContentsContext';
import { cn } from '@/lib/utils';
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

// This function can be used both client and server side
export function extractHeaders(content, enableH3 = true) {
  if (!content) return [];
  
  const headerElements = content.querySelectorAll(enableH3 ? 'h2, h3' : 'h2');
  const headersData = Array.from(headerElements).map(header => ({
    id: header.id || header.innerText.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, ''),
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

export function TableOfContentsSidebar({ initialHeaders = [], tocDepth = 2, tocPageTitle }) {
  const { headers, setHeaders, activeId, setActiveId, setTocLeadScrollTargetId } =
    useTableOfContents();

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
    const lead =
      includeH3 && tocPageTitle?.trim() ? 'main-content' : null;
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
        '[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'
      )}
    >
    <SidebarGroup className="max-w-80">
      <SidebarMenu className="">
        <h5 className="flex items-center gap-2 font-bold mb-4">
          On this page
        </h5>
        {headersToRender.map((header) => {
          const linkId = header.scrollTargetId ?? header.id;
          return (
          <SidebarMenuItem key={header.id} className="overflow-visible">
              <a
                href={`#${linkId}`}
                className={cn(
                  "block py-1 text-sm text-pretty",
                  "pl-3 border-l-2",
                  header.level === 3 && "ml-4",
                  activeId === linkId
                    ? "text-link border-link font-bold"
                    : "text-muted-foreground border-transparent hover:text-foreground hover:border-muted-foreground"
                )}
                onClick={(e) => {
                  document.getElementById(linkId)?.scrollIntoView();
                  setActiveId(linkId);
                }}
              >
                {header.text}
              </a>
          </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
    </div>
  );
} 