'use client';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { IoSearch, IoChevronForward } from "react-icons/io5";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useDebug } from '@/contexts/DebugContext';
import { cn } from '@/lib/utils';
import Link from '@/components/Link';
import { SECURITY_CHECKLISTS } from '@/config/navigation';
import { useAnalytics } from '@/hooks/use-analytics';
import { useTranslations } from 'next-intl';
import { createIntlTranslator, getTranslatedNavItemFields } from '@/lib/navigation-i18n';

const MAX_SUB_RESULTS = 3; // Maximum number of sub-results to show per result
const MAX_CURRENT_PAGE_SUB_RESULTS = 6; // Maximum sub-results for current page

const TOP_GUIDES = SECURITY_CHECKLISTS.items.slice(0, 4);
const SUGGESTION_COUNT = 5;

const SearchSuggestion = ({ query, onClick }) => (
  <button 
    onClick={() => onClick(query)}
    className="px-3 py-1.5 text-sm bg-muted hover:bg-muted/80 rounded-md transition-colors"
  >
    {query}
  </button>
);

const GuideCard = ({ href, icon: Icon, title, description, onClose }) => (
  <Link 
    href={href}
    onClick={onClose}
    className="flex items-center text-start gap-4 hover:bg-muted p-3 rounded-md transition-colors group"
  >
    <div className="p-2 rounded-lg bg-primary/10 text-primary">
      <Icon className="h-5 w-5" />
    </div>
    <div className="flex-1">
      <div className="text-sm font-medium group-hover:text-primary transition-colors">{title}</div>
      <div className="text-xs text-muted-foreground">{description}</div>
    </div>
    <IoChevronForward className="h-4 w-4 text-muted-foreground transition-all group-hover:text-primary group-hover:translate-x-0.5 [dir=rtl]:rotate-180 [dir=rtl]:group-hover:-translate-x-0.5" />
  </Link>
);

const Search = ({ variant = 'searchbar', className, ...props }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagefind, setPagefind] = useState(null);
  const [open, setOpen] = useState(false);
  const { addDebugData } = useDebug();
  const { trackEvent } = useAnalytics();
  const t = useTranslations();
  const translateText = useMemo(() => createIntlTranslator(t), [t]);

  const popularQueries = useMemo(
    () =>
      Array.from({ length: SUGGESTION_COUNT }, (_, i) =>
        t(`search.suggestion${i}`)
      ),
    [t]
  );

  const topGuidesForUi = useMemo(
    () =>
      TOP_GUIDES.map((guide) => {
        const fields = getTranslatedNavItemFields(
          guide.key,
          { title: guide.title, description: guide.description },
          translateText
        );
        return { ...guide, title: fields.title, description: fields.description };
      }),
    [translateText]
  );

  // Refs for tracking search queries
  const searchTrackingTimeoutRef = useRef(null);
  const lastTrackedQueryRef = useRef('');
  const pendingQueryRef = useRef('');

  // Track search query with generous timeout
  const trackSearchQuery = (searchQuery) => {
    if (!searchQuery.trim()) return;
    
    // Clear any existing timeout
    if (searchTrackingTimeoutRef.current) {
      clearTimeout(searchTrackingTimeoutRef.current);
    }
    
    // Update pending query
    pendingQueryRef.current = searchQuery.trim();
    
    // Set generous timeout (5 seconds) to track after user stops typing
    searchTrackingTimeoutRef.current = setTimeout(() => {
      const queryToTrack = pendingQueryRef.current;
      
      // Only track if it's different from what we last tracked and not empty
      if (queryToTrack && queryToTrack !== lastTrackedQueryRef.current) {
        trackEvent({
          name: 'search_query',
          data: {
            query: queryToTrack,
            query_length: queryToTrack.length,
            word_count: queryToTrack.split(/\s+/).length
          }
        });
        
        lastTrackedQueryRef.current = queryToTrack;
        addDebugData('search_tracked', { query: queryToTrack });
      }
    }, 5000); // 5 second generous timeout
  };

  // Cleanup function for tracking
  const cleanupSearchTracking = () => {
    if (searchTrackingTimeoutRef.current) {
      clearTimeout(searchTrackingTimeoutRef.current);
      searchTrackingTimeoutRef.current = null;
    }
    
    // Track any pending query before cleanup
    const pendingQuery = pendingQueryRef.current;
    if (pendingQuery && pendingQuery !== lastTrackedQueryRef.current) {
      trackEvent({
        name: 'search_query',
        data: {
          query: pendingQuery,
          query_length: pendingQuery.length,
          word_count: pendingQuery.split(/\s+/).length,
          cleanup_reason: 'dialog_closed'
        }
      });
      
      lastTrackedQueryRef.current = pendingQuery;
      addDebugData('search_tracked_cleanup', { query: pendingQuery });
    }
    
    // Reset refs
    pendingQueryRef.current = '';
  };

  // Initialize Pagefind
  useEffect(() => {
    const initPagefind = async () => {
      try {
        const module = await import(
          /* webpackIgnore: true */
          '/pagefind/pagefind.js'
        );
        setPagefind(module.default || module);
      } catch (error) {
        console.error("Error loading Pagefind:", error);
        setPagefind({ 
          search: () => ({ results: [] }) 
        });
      }
    };
    initPagefind();
  }, []);

  // Handle search
  const handleSearch = async (searchQuery) => {
    if (!pagefind || !searchQuery.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      const search = await pagefind.debouncedSearch(searchQuery);
      const currentPath = window.location.pathname;
      
      const data = await Promise.all(
        search.results.map(async (result) => {
          const resultData = await result.data();
          // Filter out sub-results that match the parent title
          if (resultData.sub_results) {
            const isCurrentPage = resultData.url === currentPath;
            const maxResults = isCurrentPage ? MAX_CURRENT_PAGE_SUB_RESULTS : MAX_SUB_RESULTS;
            
            resultData.sub_results = resultData.sub_results
              .filter(subResult => subResult.title !== resultData.meta?.title)
              .slice(0, maxResults);
              
            // If no sub-results remain, set to undefined
            if (resultData.sub_results.length === 0) {
              delete resultData.sub_results;
            }
          }
          return resultData;
        })
      );
      setResults(data);
      addDebugData('search_results', data);
    } catch (error) {
      console.error("Search error:", error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  // Debounce search and track queries
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      handleSearch(query);
      // Track the search query after user stops typing
      trackSearchQuery(query);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [query, pagefind]);

  // Handle dialog close - cleanup tracking
  useEffect(() => {
    if (!open) {
      cleanupSearchTracking();
    }
  }, [open]);

  // Handle tab close - cleanup tracking
  useEffect(() => {
    const handleBeforeUnload = () => {
      cleanupSearchTracking();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      cleanupSearchTracking();
    };
  }, []);

  // Parse HTML content from excerpt
  const createMarkup = (html) => {
    return { __html: html };
  };

  // Helper function to highlight keywords in text
  const highlightKeywords = (text, query) => {
    if (!query.trim()) return text;
    const keywords = query.trim().split(/\s+/);
    let highlightedText = text;
    
    keywords.forEach(keyword => {
      // Match complete words that contain the keyword
      const regex = new RegExp(`\\w*${keyword}\\w*`, 'gi');
      highlightedText = highlightedText.replace(regex, '<mark>$&</mark>');
    });
    
    return highlightedText;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen} className="search-dialog">
      <DialogTrigger asChild>
        {variant === 'searchbar' ? (
          <div className={cn("relative w-full max-w-3xl mx-auto", className)}>
            <div className="absolute inset-y-0 inset-s-3 flex items-center pointer-events-none">
              <IoSearch className="h-5 w-5 text-muted-foreground" />
            </div>
            <Input
              type="search"
              readOnly
              placeholder={t('search.placeholder')}
              onClick={() => setOpen(true)}
              className="ps-10 cursor-pointer"
            />
          </div>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setOpen(true)}
            className={cn("h-9 w-9 hover:bg-muted", className)}
          >
            <IoSearch className="h-5 w-5" />
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className={cn("sm:max-w-3xl h-[80vh] flex flex-col p-0 gap-0")} {...props}>
        <div className="p-6 pb-4 border-b pe-14">
          <DialogTitle className="sr-only">{t('search.dialogTitle')}</DialogTitle>
          <DialogDescription className="sr-only">
            {t('search.dialogDescription')}
          </DialogDescription>
          <div className="relative">
            <div className="absolute inset-y-0 inset-s-3 flex items-center pointer-events-none">
              <IoSearch className="h-5 w-5 text-muted-foreground" />
            </div>
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('search.placeholder')}
              autoFocus
              className="ps-10"
            />
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-8 pt-4">
          {/* Loading State */}
          {loading && (
            <div className="text-center text-muted-foreground">
              {t('search.searching')}
            </div>
          )}

          {/* Initial State - show when no query */}
          {!loading && !query && (
            <div className="py-8 px-2">
              <div className="max-w-2xl mx-auto space-y-6">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-3">
                    {t('search.popularHeading')}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {popularQueries.map((q, index) => (
                      <SearchSuggestion
                        key={index}
                        query={q}
                        onClick={setQuery}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-3">
                    {t('search.topGuidesHeading')}
                  </h3>
                  <div className="grid grid-cols-1 gap-2">
                    {topGuidesForUi.map((guide) => (
                      <GuideCard
                        key={guide.key}
                        href={guide.href}
                        icon={guide.icon}
                        title={guide.title}
                        description={guide.description}
                        onClose={() => setOpen(false)}
                      />
                    ))}
                  </div>
                </div>

                <div className="text-xs text-center text-muted-foreground">
                  {t.rich('search.pressEnter', {
                    kbd: (chunks) => (
                      <kbd className="px-1.5 py-0.5 text-[10px] font-mono rounded border bg-muted">
                        {chunks}
                      </kbd>
                    ),
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Results */}
          {!loading && query && results.length > 0 && (
            <div className="divide-y divide-border">
              {results.map((result, index) => (
                <div key={index} className="py-2 first:pt-0 last:pb-0">
                  {/* Main Result */}
                  <a 
                    href={result.url}
                    className="block hover:bg-muted rounded-md group transition-colors p-3 -mx-3"
                    onClick={() => setOpen(false)}
                  >
                    <div className="text-lg font-semibold text-primary group-hover:underline">
                      {result.meta?.title || t('search.untitled')}
                    </div>
                    <div 
                      className="mt-2 text-muted-foreground"
                      dangerouslySetInnerHTML={createMarkup(result.excerpt)}
                    />
                  </a>

                  {/* Sub Results */}
                  {result.sub_results && result.sub_results.length > 0 && (
                    <div className="mt-2 space-y-3">
                      {result.sub_results.map((subResult, subIndex) => (
                        <a 
                          key={subIndex} 
                          href={subResult.url}
                          className="block text-sm ps-10 relative before:content-['\2937'] before:absolute before:inset-s-4 before:top-2 before:text-primary before:text-lg hover:bg-muted rounded-md group transition-colors p-3 -mx-3"
                          onClick={() => setOpen(false)}
                        >
                          <div 
                            className="text-primary group-hover:underline font-medium"
                            dangerouslySetInnerHTML={{ __html: highlightKeywords(subResult.title, query) }}
                          />
                          <div 
                            className="mt-1 text-muted-foreground"
                            dangerouslySetInnerHTML={createMarkup(subResult.excerpt)}
                          />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* No Results */}
          {!loading && query && results.length === 0 && (
            <div className="text-center text-muted-foreground">
              {t('search.noResults', { query })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default Search;