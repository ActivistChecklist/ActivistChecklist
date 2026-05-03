'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Command as CommandPrimitive } from 'cmdk';
import { Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';
import { buildFuse, buildSearchIndex, searchIndex } from '@/lib/updates/search';

/**
 * Small visual category pill.
 */
function CategoryPill({ formFactor, kind }) {
  const t = useTranslations();
  const key = kind === 'os' ? 'os' : formFactor;
  const label = t(`updates.categoryPill.${key}`);
  return (
    <span className="inline-flex items-center rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-xs text-muted-foreground">
      {label}
    </span>
  );
}

export default function DeviceSearchInput({
  snapshot,
  platformFilter,
  onPlatformFilterClear,
  onSelect,
  autoFocus = false,
}) {
  const t = useTranslations();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);
  const containerRef = useRef(null);

  const rows = useMemo(() => buildSearchIndex(snapshot), [snapshot]);
  const fuse = useMemo(() => buildFuse(rows), [rows]);

  const results = useMemo(
    () => searchIndex(rows, fuse, query, platformFilter),
    [rows, fuse, query, platformFilter]
  );

  // Open the popover whenever there's a query OR a platform filter shows starter results.
  const showResults = open && (query.trim().length > 0 || (platformFilter && results.length > 0));

  // Close on outside click.
  useEffect(() => {
    function onDown(e) {
      if (!containerRef.current?.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  function handleSelect(item) {
    setQuery('');
    setOpen(false);
    onSelect?.(item);
  }

  function handleClear() {
    setQuery('');
    if (platformFilter) onPlatformFilterClear?.();
    inputRef.current?.focus();
  }

  function handleKey(e) {
    if (e.key === 'Escape') {
      if (query.trim()) {
        setQuery('');
      } else if (platformFilter) {
        onPlatformFilterClear?.();
      } else {
        setOpen(false);
      }
    }
  }

  // Auto-focus when requested (e.g., page mount).
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const showClearButton = query.length > 0 || Boolean(platformFilter);

  return (
    <div ref={containerRef} className="relative w-full">
      <CommandPrimitive
        shouldFilter={false}
        loop
        onKeyDown={handleKey}
        className="overflow-visible"
      >
        <div className="relative">
          <div
            className={cn(
              'flex items-center gap-2 rounded-lg border-2 border-input bg-background px-4 py-3 shadow-sm transition-colors',
              'focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20'
            )}
          >
            <Search className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <CommandPrimitive.Input
              ref={inputRef}
              value={query}
              onValueChange={setQuery}
              onFocus={() => setOpen(true)}
              placeholder={t('updates.searchPlaceholder')}
              aria-label={t('updates.searchAriaLabel')}
              className="flex-1 bg-transparent text-base outline-hidden placeholder:text-muted-foreground"
            />
            {showClearButton ? (
              <button
                type="button"
                onClick={handleClear}
                aria-label={t('updates.clearAriaLabel')}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          {showResults ? (
            <div
              className={cn(
                'absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-lg border border-border bg-popover shadow-lg'
              )}
            >
              <CommandPrimitive.List className="max-h-80 overflow-y-auto">
                {results.length === 0 ? (
                  <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                    {t('updates.noMatches')}{' '}
                    <a
                      href="https://endoflife.date"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline"
                    >
                      {t('updates.endoflifeLinkText')}
                    </a>
                  </div>
                ) : (
                  results.map((item) => (
                    <CommandPrimitive.Item
                      key={`${item.productId}/${item.releaseId}`}
                      value={`${item.productId}/${item.releaseId}`}
                      onSelect={() => handleSelect(item)}
                      className={cn(
                        'flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm',
                        'aria-selected:bg-muted aria-selected:text-foreground'
                      )}
                    >
                      <span className="font-medium">{item.displayLabel}</span>
                      <CategoryPill formFactor={item.formFactor} kind={item.kind} />
                    </CommandPrimitive.Item>
                  ))
                )}
              </CommandPrimitive.List>
            </div>
          ) : null}
        </div>
      </CommandPrimitive>
    </div>
  );
}
