"use client"

import React, { useEffect } from 'react';
import { useTableOfContents } from '@/contexts/TableOfContentsContext';
import { cn } from '@/lib/utils';
import { IoBookOutline } from "react-icons/io5";
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
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

export function TableOfContentsSidebar({ initialHeaders = [] }) {
  const { headers, setHeaders, activeId, setActiveId } = useTableOfContents();

  const enableH3 = false;

  useEffect(() => {
    // Only run client-side header detection if we don't have initial headers
    if (initialHeaders.length === 0) {
      const mainContent = document.getElementById('main-content');
      if (!mainContent) return;
      
      const headersData = extractHeaders(mainContent, enableH3);
      setHeaders(headersData);
    } else {
      setHeaders(initialHeaders);
    }
  }, [setHeaders, initialHeaders]);

  const displayHeaders = headers.length > 0 ? headers : initialHeaders;

  if (displayHeaders.length === 0) {
    return null;
  }


  return (
    <SidebarGroup className="max-w-80 sticky top-20">
      <SidebarMenu className="">
        <h5 className="flex items-center gap-2 font-bold mb-4">
          On this page
        </h5>
        {displayHeaders.map((header) => (
          <SidebarMenuItem key={header.id} className="overflow-visible">
              <a
                href={`#${header.id}`}
                className={cn(
                  "block py-1 text-sm text-pretty",
                  "pl-3 border-l-2",
                  header.level === 3 && "ml-4",
                  activeId === header.id
                    ? "text-link border-link font-bold"
                    : "text-muted-foreground border-transparent hover:text-foreground hover:border-muted-foreground"
                )}
                onClick={(e) => {
                  document.getElementById(header.id)?.scrollIntoView();
                  setActiveId(header.id);
                }}
              >
                {header.text}
              </a>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
} 