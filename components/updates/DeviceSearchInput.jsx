'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Command as CommandPrimitive } from 'cmdk';
import { Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';
import { buildFuse, buildSearchIndex, searchIndex } from '@/lib/updates/search';
import { iconForFamily } from '@/lib/updates/family-icons';

function RowIcon({ family }) {
  const Icon = iconForFamily(family);
  return <Icon className="h-4 w-4 shrink-0 text-foreground/70" aria-hidden="true" />;
}

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

function NoMatchesPanel() {
  const t = useTranslations();
  return (
    <div className="absolute left-0 right-0 top-full z-20 mt-2 space-y-2 overflow-hidden rounded-lg border border-border bg-popover px-4 py-5 text-sm shadow-lg">
      <p className="font-medium text-foreground">{t('updates.noMatches')}</p>
      <p className="text-muted-foreground">
        {t.rich('updates.noMatchesHelp', {
          link: (chunks) => (
            <a
              href="https://endoflife.date"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              {chunks}
            </a>
          ),
        })}
      </p>
      <p className="text-xs text-muted-foreground">
        {t('updates.noMatchesSupported')}
      </p>
    </div>
  );
}

/**
 * Combobox that surfaces the chosen device's display label inside the input
 * (so the user sees "iPhone 13 Mini" written out after they pick it). The clear (×)
 * button blanks the query AND fires `onClear`, letting the parent reset the result
 * area below.
 */
export default function DeviceSearchInput({
  snapshot,
  priorityProductIds,
  selectedLabel,
  onSelect,
  onClear,
  autoFocus = false,
}) {
  const t = useTranslations();
  const [query, setQuery] = useState(selectedLabel || '');
  const [open, setOpen] = useState(false);
  const [hasSelection, setHasSelection] = useState(Boolean(selectedLabel));
  const inputRef = useRef(null);
  const containerRef = useRef(null);

  // When the parent's selection changes (e.g., after restoring from URL), sync the input.
  useEffect(() => {
    if (selectedLabel) {
      setQuery(selectedLabel);
      setHasSelection(true);
    } else if (hasSelection) {
      // Parent cleared the selection externally — clear the input too.
      setQuery('');
      setHasSelection(false);
    }
  }, [selectedLabel]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => buildSearchIndex(snapshot), [snapshot]);
  const fuse = useMemo(() => buildFuse(rows), [rows]);

  // Don't search while the input still shows the selected label — otherwise typing-as-
  // navigation gets weird. The user must clear or edit before we re-search.
  const searchQuery = hasSelection && query === selectedLabel ? '' : query;

  const results = useMemo(
    () => searchIndex(rows, fuse, searchQuery, priorityProductIds),
    [rows, fuse, searchQuery, priorityProductIds]
  );

  const hasPriority = Array.isArray(priorityProductIds) && priorityProductIds.length > 0;
  const trimmed = searchQuery.trim();

  // Show the results dropdown only when there are results — otherwise we'd render an
  // empty bordered popover with nothing in it. The no-matches panel takes that slot when
  // the user typed something we couldn't find.
  const showResults =
    open && !hasSelection && results.length > 0 && (trimmed.length > 0 || hasPriority);

  const showNoMatches = open && !hasSelection && trimmed.length > 0 && results.length === 0;

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
    setQuery(item.displayLabel);
    setHasSelection(true);
    setOpen(false);
    onSelect?.(item);
  }

  function handleClear() {
    setQuery('');
    setHasSelection(false);
    onClear?.();
    inputRef.current?.focus();
  }

  function handleChange(value) {
    setQuery(value);
    if (hasSelection && value !== selectedLabel) {
      // User started editing — drop the locked-in selection state.
      setHasSelection(false);
      onClear?.();
    }
  }

  function handleKey(e) {
    if (e.key === 'Escape') {
      if (query) handleClear();
      else setOpen(false);
    }
  }

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const showClearButton = query.length > 0;

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
              'flex items-center gap-2 rounded-lg border-2 border-input bg-background px-4 py-4 shadow-sm transition-colors sm:py-5',
              'focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20'
            )}
          >
            <Search className="h-6 w-6 shrink-0 text-muted-foreground" aria-hidden="true" />
            <CommandPrimitive.Input
              ref={inputRef}
              value={query}
              onValueChange={handleChange}
              onFocus={() => setOpen(true)}
              placeholder={t('updates.searchPlaceholder')}
              aria-label={t('updates.searchAriaLabel')}
              className="flex-1 bg-transparent text-lg outline-hidden placeholder:text-muted-foreground sm:text-xl"
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
            <div className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
              <CommandPrimitive.List className="max-h-80 overflow-y-auto">
                {results.map((item) => (
                  <CommandPrimitive.Item
                    key={`${item.productId}/${item.releaseId}`}
                    value={`${item.productId}/${item.releaseId}`}
                    onSelect={() => handleSelect(item)}
                    className={cn(
                      'flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm',
                      'aria-selected:bg-muted aria-selected:text-foreground'
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <RowIcon family={item.family} />
                      <span className="truncate font-medium">{item.displayLabel}</span>
                    </span>
                    <CategoryPill formFactor={item.formFactor} kind={item.kind} />
                  </CommandPrimitive.Item>
                ))}
              </CommandPrimitive.List>
            </div>
          ) : showNoMatches ? (
            <NoMatchesPanel />
          ) : null}
        </div>
      </CommandPrimitive>
    </div>
  );
}
