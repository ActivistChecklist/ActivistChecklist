'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

import { useEolSnapshot } from '@/hooks/use-eol-snapshot';
import { findRelease } from '@/lib/updates/snapshot';
import { buildDisplayLabel } from '@/lib/updates/search';
import { useAnalytics } from '@/hooks/use-analytics';

import DeviceInfoCard from './DeviceInfoCard';
import DeviceSearchInput from './DeviceSearchInput';
import FamilyCategorySelector from './FamilyCategorySelector';
import ResultCard from './ResultCard';
import PageNotices from '@/components/layout/PageNotices';

// Snapshot is regenerated daily by the cron prebuild. Anything older than this
// has missed at least a few cron windows — surface a warning so users know the
// EOL data they're seeing might be behind. 31 days = "more than a month".
const STALE_THRESHOLD_DAYS = 31;

function isSnapshotStale(snapshot) {
  if (!snapshot?.generatedAt) return false;
  const generated = new Date(snapshot.generatedAt);
  if (Number.isNaN(generated.getTime())) return false;
  const ageMs = Date.now() - generated.getTime();
  return ageMs > STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
}

function formatStaleDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function UpdatesPage() {
  const t = useTranslations();
  const { trackEvent } = useAnalytics();
  const { status, snapshot } = useEolSnapshot();

  // Drill-down state: { platform, subCategory } | null
  const [category, setCategory] = useState(null);
  const [selection, setSelection] = useState(null); // { productId, releaseId } | null
  // When set, the search box mounts with this string pre-filled and pre-selected so the
  // user can edit or replace the previously chosen device without re-typing it from scratch.
  // Cleared by the input as soon as it consumes the seed.
  const [seedQuery, setSeedQuery] = useState(null);
  // Bumped on every Start Over so the DeviceSearchInput remounts with a clean
  // initial state. Belt-and-suspenders: the input also responds to seedQuery
  // and selectedLabel transitions, but using this as a key guarantees stale
  // internal state (query, hasSelection, focus) can't leak across resets.
  const [resetKey, setResetKey] = useState(0);

  const priorityProductIds = category?.subCategory?.productIds || null;

  // Restore selection from URL on mount + when snapshot loads.
  useEffect(() => {
    if (!snapshot) return;
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');
    if (!q) return;
    const [productId, releaseId] = q.split('/');
    if (productId && releaseId && findRelease(snapshot, productId, releaseId)) {
      setSelection({ productId, releaseId });
    }
  }, [snapshot]);

  // Sync selection back to URL. We pushState so each user-driven selection
  // change creates a history entry — pressing Back returns to the blank form
  // (or to the previous selection). The compare-before-push guard suppresses
  // duplicate entries on initial mount/restore and on popstate-driven syncs,
  // where the URL already matches the new selection.
  useEffect(() => {
    if (!snapshot) return;
    const url = new URL(window.location.href);
    if (selection) {
      url.searchParams.set('q', `${selection.productId}/${selection.releaseId}`);
    } else {
      url.searchParams.delete('q');
    }
    const next = url.toString();
    if (next === window.location.href) return;
    window.history.pushState({}, '', next);
  }, [selection, snapshot]);

  // Clear stale selection if the URL points at a product/release no longer in the snapshot.
  useEffect(() => {
    if (!snapshot || !selection) return;
    if (!findRelease(snapshot, selection.productId, selection.releaseId)) {
      setSelection(null);
    }
  }, [snapshot, selection]);

  // Browser back/forward — keep state in sync if the user navigates.
  useEffect(() => {
    function onPop() {
      const params = new URLSearchParams(window.location.search);
      const q = params.get('q');
      if (!q) {
        setSelection(null);
        return;
      }
      const [productId, releaseId] = q.split('/');
      if (productId && releaseId) setSelection({ productId, releaseId });
    }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  function handleCategoryChange(next) {
    setCategory(next);
    if (next?.subCategory) {
      trackEvent({
        name: 'updates_category_pick',
        platform: next.platform,
        subCategory: next.subCategory.id,
      });
    }
  }

  function handleSelect(item) {
    setSelection({ productId: item.productId, releaseId: item.releaseId });
    // Selecting a device is a clean slate for the category drill-down: even though
    // the selector isn't visible while a result is showing, we want it back at L1
    // when the user starts over.
    setCategory(null);
    trackEvent({
      name: 'updates_search_select',
      productId: item.productId,
      releaseId: item.releaseId,
    });
  }

  function handleReset() {
    // Centralised reset: clear both the result selection and the category so the
    // page returns to its initial state regardless of which control fired this.
    // resetKey++ forces DeviceSearchInput to remount fresh so its internal
    // input state can't carry the previous label across.
    setSelection(null);
    setCategory(null);
    setSeedQuery(null);
    setResetKey((k) => k + 1);
    trackEvent({ name: 'updates_reset' });
  }

  // Click-to-edit: clear the result and seed the search input with the previously chosen
  // label, focused and pre-selected. This makes the device summary feel like a <select>
  // that re-opens the picker without losing the user's place.
  function handleEdit(label) {
    setSelection(null);
    if (label) setSeedQuery(label);
    trackEvent({ name: 'updates_edit_selection' });
  }

  // Loading state ─────────────────────────────────────
  if (status === 'loading') {
    return (
      <div className="space-y-6">
        <PageHero />
        <LoadingSkeleton label={t('updates.loading')} />
      </div>
    );
  }

  // Error state ───────────────────────────────────────
  if (status === 'error' || !snapshot) {
    return (
      <div className="space-y-6">
        <PageHero />
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm">
          {t.rich('updates.loadError', {
            retryLink: (chunks) => (
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="text-primary underline"
              >
                {chunks}
              </button>
            ),
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
        </div>
      </div>
    );
  }

  const found = selection ? findRelease(snapshot, selection.productId, selection.releaseId) : null;
  const selectedLabel = found ? buildDisplayLabel(found.product, found.release) : '';

  // Stale-snapshot notice routed through the standard PageNotices system so it
  // looks and behaves like a page-level alert (same chrome as the i18n
  // unreviewed notice and other site-wide warnings) rather than a one-off
  // banner stuck at the bottom.
  const pageNotices = isSnapshotStale(snapshot)
    ? [{
        id: 'updates-snapshot-stale',
        type: 'warning',
        message: t.rich('updates.snapshotStaleBanner', {
          date: formatStaleDate(snapshot.generatedAt),
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
        }),
      }]
    : [];

  return (
    <div className="space-y-6">
      <PageNotices initialNotices={pageNotices} />
      <PageHero />

      {found ? null : (
        <FamilyCategorySelector value={category} onChange={handleCategoryChange} />
      )}

      {/* When a device is selected, group the device card and result block in a
          single space-y-0 stack so the connector arrows inside ResultCard can sit
          flush against the device card above. The page-level space-y-6 still
          separates this group from PageHero / FamilyCategorySelector. */}
      {found ? (
        <div className="space-y-0">
          <DeviceInfoCard
            product={found.product}
            release={found.release}
            onReset={handleReset}
            onEdit={handleEdit}
          />
          <ResultCard
            key={`${found.product.id}/${found.release.id}`}
            snapshot={snapshot}
            product={found.product}
            release={found.release}
            onReset={handleReset}
          />
        </div>
      ) : (
        <DeviceSearchInput
          key={resetKey}
          snapshot={snapshot}
          priorityProductIds={priorityProductIds}
          selectedLabel={selectedLabel}
          seedQuery={seedQuery}
          onSeedConsumed={() => setSeedQuery(null)}
          onSelect={handleSelect}
          onClear={handleReset}
          autoFocus
        />
      )}

      <FooterCredit snapshot={snapshot} />
    </div>
  );
}

/**
 * Layout-shaped skeleton shown while the snapshot loads. Mirrors the rendered
 * shell — 4 platform-card placeholders, a search-input bar, a footer line —
 * so the page doesn't reflow when data arrives. Pulse + aria-busy for SR users.
 */
function LoadingSkeleton({ label }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      className="space-y-6 animate-pulse"
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-hidden="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col items-center gap-2 rounded-lg border-2 border-border bg-muted/40 p-4"
          >
            <div className="h-8 w-8 rounded-md bg-muted-foreground/20" />
            <div className="h-4 w-16 rounded bg-muted-foreground/20" />
          </div>
        ))}
      </div>

      <div
        className="flex items-center gap-2 rounded-lg border-2 border-input bg-background px-4 py-3 shadow-sm"
        aria-hidden="true"
      >
        <div className="h-5 w-5 rounded bg-muted-foreground/20" />
        <div className="h-4 flex-1 rounded bg-muted-foreground/20" />
      </div>

      <div className="flex justify-center pt-4" aria-hidden="true">
        <div className="h-3 w-48 rounded bg-muted-foreground/15" />
      </div>

      <span className="sr-only">{label}</span>
    </div>
  );
}

function PageHero() {
  const t = useTranslations();
  return (
    <header className="space-y-3 text-center">
      <h1 className="text-balance text-3xl font-bold leading-tight text-foreground sm:text-4xl">
        {t('updates.title')}
      </h1>
      <p className="mx-auto max-w-2xl text-pretty text-base text-muted-foreground">
        {t('updates.intro')}
      </p>
    </header>
  );
}

function FooterCredit({ snapshot }) {
  const t = useTranslations();
  const date = formatStaleDate(snapshot?.generatedAt) || '—';
  // Two distinct rich tags so each link points at its own source. Same styling
  // for both (subtle underline, foreground on hover) so neither reads as more
  // prominent than the other in the credit line.
  const linkClass = 'underline hover:text-foreground';
  return (
    <p className="pt-4 text-center text-xs text-muted-foreground">
      {t.rich('updates.footer', {
        date,
        eolLink: (chunks) => (
          <a
            href="https://endoflife.date"
            target="_blank"
            rel="noopener noreferrer"
            className={linkClass}
          >
            {chunks}
          </a>
        ),
        sofaLink: (chunks) => (
          <a
            href="https://sofa.macadmins.io"
            target="_blank"
            rel="noopener noreferrer"
            className={linkClass}
          >
            {chunks}
          </a>
        ),
      })}
    </p>
  );
}
