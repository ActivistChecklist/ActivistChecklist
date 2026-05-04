'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Command as CommandPrimitive } from 'cmdk';
import { HelpCircle, Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { buildFuse, buildSearchIndex, searchIndex } from '@/lib/updates/search';
import { iconForFamily } from '@/lib/updates/family-icons';
import { looksLikeWindowsLaptopQuery } from '@/lib/updates/no-match-hints';

function RowIcon({ family }) {
  const Icon = iconForFamily(family);
  return <Icon className="h-4 w-4 shrink-0 text-foreground/70" aria-hidden="true" />;
}

// Inline year hint — sits in the right-hand metadata cluster (next to the
// category pill) when the label doesn't already contain a four-digit year
// (so we don't double-print "MacBook Pro 14-inch (2024) … released 2024").
// Lighter colour reads as supporting metadata.
const YEAR_TOKEN_RE = /\b(19|20)\d{2}\b/;
function ReleaseYearHint({ displayLabel, releaseDate }) {
  const t = useTranslations();
  if (!releaseDate) return null;
  if (YEAR_TOKEN_RE.test(displayLabel)) return null;
  const year = new Date(releaseDate).getUTCFullYear();
  if (!Number.isFinite(year)) return null;
  return (
    <span className="shrink-0 text-xs text-muted-foreground">
      {t('updates.releasedYearHint', { year })}
    </span>
  );
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

/**
 * Windows-FYI block: explains that checking a Windows laptop's model won't tell
 * you anything useful, and points at `winver` instead. Used in two places:
 * a) full-panel inside the dropdown when there are NO autocomplete results, and
 * b) compact banner above the autocomplete results when the query LOOKS like a
 *    Windows-laptop brand and we still got hits (could be a fuzzy match against
 *    something unrelated — better to surface the FYI alongside the hits than
 *    risk hiding the more accurate guidance).
 *
 * `compact` switches to the banner padding/typography. The compact variant is
 * topped with a divider underneath so it visually separates from the result
 * list below.
 */
function WindowsLaptopFyi({ compact = false }) {
  const t = useTranslations();
  if (compact) {
    return (
      <div className="space-y-2 border-b border-border bg-warning/5 px-4 py-3 text-sm">
        <p className="text-foreground">
          {t.rich('updates.noMatchesWindowsLaptop', {
            b: (chunks) => <strong className="font-semibold">{chunks}</strong>,
          })}
        </p>
        <p className="text-muted-foreground">
          <span className="font-semibold uppercase tracking-wide text-xs">
            {t('updates.noMatchesWindowsPathLabel')}
          </span>{' '}
          <span className="text-foreground">
            {t.rich('updates.findYourModel.windows', {
              code: (chunks) => (
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-foreground">
                  {chunks}
                </code>
              ),
            })}
          </span>
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-3 px-6 py-8 text-sm sm:px-8 sm:py-10">
      <p className="font-medium text-foreground">
        {t.rich('updates.noMatchesWindowsLaptop', {
          b: (chunks) => <strong className="font-bold">{chunks}</strong>,
        })}
      </p>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('updates.noMatchesWindowsPathLabel')}
        </p>
        <p className="mt-1 text-base font-medium text-foreground">
          {t.rich('updates.findYourModel.windows', {
            code: (chunks) => (
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
                {chunks}
              </code>
            ),
          })}
        </p>
      </div>
    </div>
  );
}

function NoMatchesContent({ query }) {
  const t = useTranslations();
  if (looksLikeWindowsLaptopQuery(query)) return <WindowsLaptopFyi />;

  // Wide breathing room so this reads as an empty-state message centered inside the
  // dropdown shell, not as a tight panel pushed up against the search input edges.
  return (
    <div className="space-y-2 px-6 py-10 text-center text-sm sm:px-8 sm:py-12">
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
  seedQuery,
  onSeedConsumed,
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

  // Click-to-edit seed: parent set a string we should pre-fill and pre-select. This makes
  // the input behave like a "select" the user reopened — the previous value is there,
  // already highlighted, so they can type to replace or just walk it back.
  useEffect(() => {
    if (!seedQuery) return;
    setQuery(seedQuery);
    setHasSelection(false);
    setOpen(true);
    // requestAnimationFrame so focus/select happen after the input renders the new value;
    // calling them synchronously can race with React's commit and lose the selection.
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    onSeedConsumed?.();
  }, [seedQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  // When the parent's selection changes (e.g., after restoring from URL), sync the input.
  useEffect(() => {
    if (selectedLabel) {
      setQuery(selectedLabel);
      setHasSelection(true);
    } else if (hasSelection) {
      // Parent cleared the selection externally (e.g., via "Check your phone next" or
      // any other reset path) — clear the input AND refocus so the user can keep
      // typing without grabbing the mouse.
      setQuery('');
      setHasSelection(false);
      inputRef.current?.focus();
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
    // Mirror the click-outside behaviour for keyboard users: when focus
    // leaves the search container (Tab from the input or one of the result
    // rows to something further down the page), close the dropdown. capture
    // phase + relatedTarget avoids false-closes during in-widget focus moves
    // (input → result row).
    function onFocusOut(e) {
      const next = e.relatedTarget;
      if (next && containerRef.current?.contains(next)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    containerRef.current?.addEventListener('focusout', onFocusOut);
    const container = containerRef.current;
    return () => {
      document.removeEventListener('mousedown', onDown);
      container?.removeEventListener('focusout', onFocusOut);
    };
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
      <div className="mb-1.5 flex items-center gap-1.5">
        <label
          htmlFor="updates-device-search"
          className="block text-sm font-medium text-foreground"
        >
          {t('updates.searchLabel')}
        </label>
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={t('updates.searchHelpAriaLabel')}
                className={cn(
                  'inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors',
                  'hover:bg-muted hover:text-foreground focus:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/40'
                )}
              >
                <HelpCircle className="h-4 w-4" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            {/* Inverse colour so the tooltip pops against either theme: dark-on-light
                in dark mode, light-on-dark in light mode. Wider than default since the
                copy is a sentence, and centered above the trigger. */}
            <TooltipContent
              side="top"
              align="center"
              className="max-w-xs whitespace-normal border-foreground bg-foreground text-sm leading-relaxed text-background"
            >
              {t('updates.searchHelp')}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
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
              id="updates-device-search"
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

          {(showResults || showNoMatches) ? (
            <div className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
              {showResults ? (
                <>
                  {/* If the query looks like a Windows-laptop brand we may have
                      fuzzy-matched something irrelevant. Surface the Windows FYI
                      above the results so the user sees both — the banner doesn't
                      block them from picking a real match below. */}
                  {looksLikeWindowsLaptopQuery(trimmed) ? <WindowsLaptopFyi compact /> : null}
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
                        <span className="flex shrink-0 items-center gap-3">
                          <ReleaseYearHint
                            displayLabel={item.displayLabel}
                            releaseDate={item.releaseDate}
                          />
                          <CategoryPill formFactor={item.formFactor} kind={item.kind} />
                        </span>
                      </CommandPrimitive.Item>
                    ))}
                  </CommandPrimitive.List>
                </>
              ) : (
                <NoMatchesContent query={trimmed} />
              )}
            </div>
          ) : null}
        </div>
      </CommandPrimitive>
    </div>
  );
}
