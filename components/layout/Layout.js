'use client';
import { Suspense } from 'react';
import TopNav from "./nav-top";
import Footer from "./Footer";
import Debug from "../development/Debug";
import { DebugProvider } from '@/contexts/DebugContext';
import { NavigationSidebar } from "@/components/layout/sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { ThemeProvider } from "@/components/layout/ThemeProvider"
import { TableOfContentsProvider } from "@/contexts/TableOfContentsContext";
import { TableOfContentsSidebar } from "@/components/layout/TableOfContentsSidebar";
import { LayoutProvider, useLayout } from "@/contexts/LayoutContext";
import SkipLink from "./SkipLink";
import PageCounter from "./PageCounter";
import AnnouncementBar from "./AnnouncementBar";
import LanguageDetectionBanner from '@/components/LanguageDetectionBanner';
import Script from 'next/script';
import { extractHeaders } from "@/components/layout/TableOfContentsSidebar";
import { cn } from "@/lib/utils";

const LayoutContent = ({ children, className, fullWidthMain = false, searchable = true}) => {
  const { sidebarType } = useLayout();
  const maxWidth = "max-w-5xl";

  // Extract headers from children if they're available server-side
  let initialHeaders = [];
  if (typeof children === 'object' && children.props?.id === 'main-content') {
    const content = children.props.children;
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = content;
    initialHeaders = extractHeaders(tempDiv);
  }

  return (
    <ThemeProvider>
      <DebugProvider>
        <SidebarProvider>
          <TableOfContentsProvider>
            <div className="flex flex-col min-h-screen">
              <SkipLink />
              <LanguageDetectionBanner />
              <AnnouncementBar />
              <TopNav maxWidth={maxWidth} />
              <div className="flex-1">
                <div className={`${maxWidth} mx-auto px-4`}>
                  <div className={`flex gap-4 py-6 print:py-1 ${!sidebarType ? 'justify-center' : ''}`}>
                   {sidebarType === 'toc' && (
                      <aside 
                        className={`w-60 hidden md:block`}
                        role="complementary" 
                        aria-label="Sidebar navigation"
                      >
                        {/* {sidebarType === 'navigation' && <NavigationSidebar />} */}
                        {sidebarType === 'toc' && <TableOfContentsSidebar initialHeaders={initialHeaders} />}
                      </aside>
                    )}
                    <main 
                      id="main-content" 
                      className={cn("flex-1 min-w-0 m-auto mb-12", fullWidthMain ? "max-w-full" : "max-w-3xl", className)} 
                      aria-label="Main content"
                      role="main" 
                      {...(searchable && { 'data-pagefind-body': true })}
                    >
                      {children}
                    </main>
                  </div>
                </div>
              </div>
              <Suspense><Debug /></Suspense>
              <Footer />
              <PageCounter />
            </div>
          </TableOfContentsProvider>
        </SidebarProvider>
      </DebugProvider>
    </ThemeProvider>
  );
};

const Layout = ({ children, sidebarType: initialSidebarType = 'navigation', ...props }) => {
  return (
    <LayoutProvider initialSidebarType={initialSidebarType}>
      <LayoutContent {...props}>
        {children}
      </LayoutContent>
    </LayoutProvider>
  );
};

export default Layout;
