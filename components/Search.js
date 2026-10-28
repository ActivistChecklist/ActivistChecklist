'use client';
import React, { useState, useEffect, useRef, useMemo, useCallback, useId } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { IoSearch, IoChevronForward, IoArrowForward, IoClose } from 'react-icons/io5';
import {
  DialogPortal,
  DialogOverlay,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import Link from '@/components/Link';
import { NAV_ITEMS, SECURITY_CHECKLISTS } from '@/config/navigation';
import { DEFAULT_ICON, READ_KIND_ICONS } from '@/config/icons';
import { useDebug } from '@/contexts/DebugContext';
import { sendAnalytics } from '@/hooks/use-analytics';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { createIntlTranslator, getTranslatedNavItemFields } from '@/lib/navigation-i18n';
import { highlightParts, rankPages, scrubQueryForAnalytics, toPageResult } from '@/lib/search';

// Shown before typing. These are the most-visited guides by Umami sessions
// over the 90 days to 2026-10-28. They replaced hand-picked "popular
// searches", which only 0.7% of searches used. Update when that order changes.
const MOST_READ_GUIDE_KEYS = ['essentials', 'signal', 'vpn', 'doxxing', 'travel', 'ice'];

const SEARCH_DELAY_MS = 150;
const CANDIDATE_PAGES = 10; // more than shown, so rankPages can push demoted pages down
const MAX_PAGES = 8;
const MAX_SECTIONS = 3;
const TRACK_IDLE_MS = 5000; // a query counts once typing pauses this long

let pagefindPromise = null;

/** Load the index on first use (hover, focus or open) rather than on every page view. */
function loadPagefind() {
  pagefindPromise ??= import(/* webpackIgnore: true */ '/pagefind/pagefind.js')
    .then(async (pagefind) => {
      await pagefind.init?.();
      return pagefind;
    })
    .catch((error) => {
      console.error('Error loading Pagefind:', error.message);
      pagefindPromise = null;
      return null;
    });
  return pagefindPromise;
}

const Kbd = ({ children }) => (
  <kbd className="min-w-5 rounded border bg-muted px-1.5 py-0.5 text-center font-mono text-[11px] text-muted-foreground">
    {children}
  </kbd>
);

const Highlighted = ({ text, query }) =>
  highlightParts(text, query).map((part, index) =>
    part.match ? <mark key={index}>{part.text}</mark> : <span key={index}>{part.text}</span>,
  );

/**
 * Site search. `variant="header"` is the one in the top bar: a search field
 * from lg up, an icon below, and it owns the Cmd/Ctrl+K shortcut. Other
 * instances (the mobile menu) are an icon only.
 */
const Search = ({ variant = 'icon', className }) => {
  const t = useTranslations();
  const { addDebugData } = useDebug();
  const translateText = useMemo(() => createIntlTranslator(t), [t]);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  // { term, pages, total } once a search finishes, { term, error } if it failed
  const [results, setResults] = useState(null);
  const [active, setActive] = useState(0);
  const [shortcutHint, setShortcutHint] = useState(null);

  const idPrefix = useId();
  const optionId = (index) => `${idPrefix}-option-${index}`;
  const inputRef = useRef(null);
  const returnFocusRef = useRef(null);
  const tracking = useRef({ pending: null, lastTracked: '', timer: null });

  const term = query.trim();

  // --- Analytics: one search_query event per settled query ---

  const flushTracking = useCallback(
    (reason) => {
      const state = tracking.current;
      clearTimeout(state.timer);
      const pending = state.pending;
      state.pending = null;
      if (!pending || pending.query === state.lastTracked) return;

      state.lastTracked = pending.query;
      sendAnalytics({
        name: 'search_query',
        data: {
          query: pending.query,
          query_length: pending.query.length,
          word_count: pending.query.split(' ').length,
          result_count: pending.resultCount,
          ...(reason && { cleanup_reason: reason }),
        },
      });
      addDebugData('search_tracked', { query: pending.query });
    },
    [addDebugData],
  );

  useEffect(() => {
    if (!results || results.error) return;
    const state = tracking.current;
    state.pending = { query: scrubQueryForAnalytics(results.term), resultCount: results.total };
    clearTimeout(state.timer);
    state.timer = setTimeout(() => flushTracking(), TRACK_IDLE_MS);
  }, [results, flushTracking]);

  useEffect(() => {
    const onPageHide = () => flushTracking('dialog_closed');
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      clearTimeout(tracking.current.timer);
    };
  }, [flushTracking]);

  // --- Open and close ---

  const openSearch = useCallback(() => {
    returnFocusRef.current = document.activeElement;
    setOpen(true);
    loadPagefind();
  }, []);

  // The query is dropped on close so the next person to open search on a
  // shared device doesn't see it.
  const closeSearch = useCallback(() => {
    flushTracking('dialog_closed');
    setOpen(false);
    setQuery('');
  }, [flushTracking]);

  useEffect(() => {
    if (variant !== 'header') return;
    setShortcutHint(/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K');
    const onKeyDown = (event) => {
      if (event.key?.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey)) return;
      if (event.altKey || event.shiftKey) return;
      event.preventDefault();
      if (open) closeSearch();
      else openSearch();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [variant, open, openSearch, closeSearch]);

  // --- Searching ---

  useEffect(() => {
    if (!term) {
      setResults(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const pagefind = await loadPagefind();
      if (cancelled) return;
      if (!pagefind) {
        setResults({ term, error: true });
        return;
      }
      try {
        const search = await pagefind.search(term);
        const candidates = await Promise.all(
          search.results
            .slice(0, CANDIDATE_PAGES)
            .map(async (result) => toPageResult(await result.data(), result.score, MAX_SECTIONS)),
        );
        if (cancelled) return;
        const pages = rankPages(candidates).slice(0, MAX_PAGES);
        setResults({ term, pages, total: search.results.length });
        addDebugData('search_results', pages);
      } catch (error) {
        console.error('Search error:', error.message);
        if (!cancelled) setResults({ term, error: true });
      }
    }, SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term, addDebugData]);

  // --- What the list shows: every row is an option for arrow keys and Enter ---

  const mostReadGuides = useMemo(
    () =>
      MOST_READ_GUIDE_KEYS.map((key) => {
        const item = NAV_ITEMS[key.toUpperCase()];
        return {
          kind: 'guide',
          key,
          href: item.href,
          title: getTranslatedNavItemFields(key, {}, translateText).title,
          Icon: item.icon ?? READ_KIND_ICONS[item.kind] ?? DEFAULT_ICON,
        };
      }),
    [translateText],
  );

  const browseAllOption = useMemo(
    () => ({
      kind: 'link',
      key: 'browse',
      href: SECURITY_CHECKLISTS.href,
      title: t('nav.browseAllChecklists'),
    }),
    [t],
  );

  const contactOption = useMemo(
    () => ({
      kind: 'link',
      key: 'contact',
      href: NAV_ITEMS.CONTACT.href,
      title: t('search.contactPrompt'),
    }),
    [t],
  );

  const options = useMemo(() => {
    if (!term) return [...mostReadGuides, browseAllOption];
    if (!results || results.error) return [];
    if (results.pages.length === 0) return [browseAllOption, contactOption];
    return results.pages.flatMap((page, pageIndex) => [
      {
        kind: 'page',
        key: `${pageIndex}-${page.url}`,
        href: page.url,
        title: page.title || t('search.untitled'),
        // Section rows carry their own excerpts; the page row only needs one when it has none.
        excerpt: page.sections.length ? null : page.excerpt,
      },
      ...page.sections.map((section, sectionIndex) => ({
        kind: 'section',
        key: `${pageIndex}-${sectionIndex}-${section.url}`,
        href: section.url,
        title: section.title,
        excerpt: section.excerpt,
      })),
    ]);
  }, [term, results, mostReadGuides, browseAllOption, contactOption, t]);

  useEffect(() => setActive(0), [options]);

  const isNoResults = Boolean(term && results && !results.error && results.pages.length === 0);
  const statusText = !term
    ? ''
    : results?.error
      ? t('search.unavailable')
      : results
        ? t('search.resultCount', { count: results.pages.length })
        : t('search.searching');

  const onInputKeyDown = (event) => {
    if (event.nativeEvent.isComposing || options.length === 0) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const next = (active + step + options.length) % options.length;
      setActive(next);
      document.getElementById(optionId(next))?.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter') {
      event.preventDefault();
      document.getElementById(optionId(active))?.querySelector('a')?.click();
    }
  };

  const rowClass = (index) =>
    cn(
      'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left no-underline',
      index === active && 'bg-muted',
    );

  const renderOption = (option, index) => {
    switch (option.kind) {
      case 'guide':
        return (
          <Link href={option.href} onClick={closeSearch} tabIndex={-1} className={rowClass(index)}>
            <span className="rounded-md bg-primary/10 p-1.5 text-primary">
              <option.Icon className="h-4 w-4" aria-hidden />
            </span>
            <span className="flex-1 font-medium text-foreground">{option.title}</span>
            <IoChevronForward className="h-4 w-4 text-muted-foreground" aria-hidden />
          </Link>
        );
      case 'link':
        return (
          <Link href={option.href} onClick={closeSearch} tabIndex={-1} className={rowClass(index)}>
            <span className="flex-1 font-medium text-link">{option.title}</span>
            <IoArrowForward className="h-4 w-4 text-link" aria-hidden />
          </Link>
        );
      default:
        // Search hits are already full localized paths, so a plain anchor.
        return (
          <a
            href={option.href}
            onClick={closeSearch}
            tabIndex={-1}
            className={cn(
              rowClass(index),
              'block',
              option.kind === 'section' && 'ml-4 w-[calc(100%-1rem)] rounded-l-none border-l-2',
            )}
          >
            <div
              className={cn(
                'text-foreground',
                option.kind === 'page' ? 'font-semibold' : 'text-sm font-medium',
              )}
            >
              <Highlighted text={option.title} query={term} />
            </div>
            {option.excerpt && (
              <p
                className="mt-0.5 line-clamp-2 text-sm text-muted-foreground"
                dangerouslySetInnerHTML={{ __html: option.excerpt }}
              />
            )}
          </a>
        );
    }
  };

  const warmUp = () => loadPagefind();

  return (
    <>
      {variant === 'header' && (
        <button
          type="button"
          onClick={openSearch}
          onPointerEnter={warmUp}
          onFocus={warmUp}
          aria-haspopup="dialog"
          aria-label={t('search.dialogTitle')}
          aria-keyshortcuts="Meta+K Control+K"
          className={cn(
            'hidden lg:flex h-9 w-52 items-center gap-2 rounded-md border border-input bg-background px-3',
            'text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
            'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
            className,
          )}
        >
          <IoSearch className="h-4 w-4 shrink-0" aria-hidden />
          <span className="flex-1 text-left">{t('search.placeholder')}</span>
          {shortcutHint && <Kbd>{shortcutHint}</Kbd>}
        </button>
      )}
      <Button
        variant="ghost"
        size="icon"
        onClick={openSearch}
        onPointerEnter={warmUp}
        onFocus={warmUp}
        aria-haspopup="dialog"
        aria-label={t('search.dialogTitle')}
        className={cn('h-9 w-9 hover:bg-muted', variant === 'header' && 'lg:hidden', className)}
      >
        <IoSearch className="h-5 w-5" />
      </Button>

      <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && closeSearch()}>
        <DialogPortal>
          <DialogOverlay />
          <DialogPrimitive.Content
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              inputRef.current?.focus();
            }}
            onCloseAutoFocus={(event) => {
              // preventScroll: after a same-page result the hash scroll must win
              const target = returnFocusRef.current;
              if (!target?.isConnected) return;
              event.preventDefault();
              target.focus({ preventScroll: true });
            }}
            className={cn(
              // Full screen on phones, a top-anchored panel from sm up
              'fixed inset-0 z-50 flex flex-col bg-background',
              'sm:inset-auto sm:left-1/2 sm:top-[10vh] sm:w-[calc(100%-2rem)] sm:max-w-2xl sm:-translate-x-1/2',
              'sm:max-h-[80vh] sm:rounded-lg sm:border sm:shadow-lg',
              'duration-150 data-[state=open]:animate-in data-[state=open]:fade-in-0',
              'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
            )}
          >
            <DialogTitle className="sr-only">{t('search.dialogTitle')}</DialogTitle>
            <DialogDescription className="sr-only">
              {t('search.dialogDescription')}
            </DialogDescription>

            <div className="flex items-center gap-2 border-b px-4 py-2">
              <IoSearch className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
              <input
                ref={inputRef}
                type="search"
                role="combobox"
                aria-expanded={options.length > 0}
                aria-controls={`${idPrefix}-listbox`}
                aria-activedescendant={options.length > 0 ? optionId(active) : undefined}
                aria-autocomplete="list"
                aria-label={t('search.dialogTitle')}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                enterKeyHint="go"
                placeholder={t('search.placeholder')}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={onInputKeyDown}
                className="h-11 min-w-0 flex-1 bg-transparent text-base outline-hidden placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
              />
              <DialogPrimitive.Close asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  aria-label={t('search.close')}
                >
                  <IoClose className="h-5 w-5" />
                </Button>
              </DialogPrimitive.Close>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 sm:p-3">
              {term && !results && (
                <p className="px-3 py-2 text-sm text-muted-foreground">{t('search.searching')}</p>
              )}
              {term && results?.error && (
                <p className="px-3 py-2 text-sm text-muted-foreground">{t('search.unavailable')}</p>
              )}
              {isNoResults && (
                <div className="px-3 pb-3 pt-2">
                  <p className="font-medium">{t('search.noResults', { query: results.term })}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{t('search.noResultsHint')}</p>
                </div>
              )}
              {!term && (
                <h2
                  id={`${idPrefix}-heading`}
                  className="px-3 pb-2 pt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  {t('search.mostReadHeading')}
                </h2>
              )}
              {options.length > 0 && (
                <ul
                  id={`${idPrefix}-listbox`}
                  role="listbox"
                  aria-labelledby={term ? undefined : `${idPrefix}-heading`}
                  aria-label={term ? t('search.resultsLabel') : undefined}
                  className="space-y-0.5"
                >
                  {options.map((option, index) => (
                    <li
                      key={option.key}
                      id={optionId(index)}
                      role="option"
                      aria-selected={index === active}
                      onMouseMove={() => index !== active && setActive(index)}
                      className={cn(option.kind === 'link' && !term && 'mt-2 border-t pt-2')}
                    >
                      {renderOption(option, index)}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div role="status" className="sr-only">
              {statusText}
            </div>

            <div className="hidden items-center gap-4 border-t px-4 py-2 text-xs text-muted-foreground sm:flex">
              <span className="flex items-center gap-1">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd>
                {t('search.keyNavigate')}
              </span>
              <span className="flex items-center gap-1">
                <Kbd>↵</Kbd>
                {t('search.keyOpen')}
              </span>
              <span className="flex items-center gap-1">
                <Kbd>esc</Kbd>
                {t('search.keyClose')}
              </span>
            </div>
          </DialogPrimitive.Content>
        </DialogPortal>
      </DialogPrimitive.Root>
    </>
  );
};

export default Search;
