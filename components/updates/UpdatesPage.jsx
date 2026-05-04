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

const STALE_THRESHOLD_DAYS = 14;

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

  // Sync selection back to URL.
  useEffect(() => {
    if (!snapshot) return;
    const url = new URL(window.location.href);
    if (selection) {
      url.searchParams.set('q', `${selection.productId}/${selection.releaseId}`);
    } else {
      url.searchParams.delete('q');
    }
    window.history.replaceState({}, '', url.toString());
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
    setSelection(null);
    setCategory(null);
    setSeedQuery(null);
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

  return (
    <div className="space-y-6">
      <PageHero />

      {found ? null : (
        <FamilyCategorySelector value={category} onChange={handleCategoryChange} />
      )}

      {/* DeviceInfoCard sits in the same slot as the search input so picking a device
          feels like the input itself transforming into a "selected" pill — no slide-in,
          no scroll. When the user clears or clicks the card, the input takes its place
          back. */}
      {found ? (
        <DeviceInfoCard
          product={found.product}
          release={found.release}
          onReset={handleReset}
          onEdit={handleEdit}
        />
      ) : (
        <DeviceSearchInput
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

      {found ? (
        // No outer animation wrapper — ResultCard staggers its own boxes so the device
        // card stays put and each result box slides up on its own beat.
        <ResultCard
          key={`${found.product.id}/${found.release.id}`}
          snapshot={snapshot}
          product={found.product}
          release={found.release}
          onReset={handleReset}
        />
      ) : null}

      {isSnapshotStale(snapshot) ? (
        <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-xs text-foreground/90">
          {t.rich('updates.snapshotStaleBanner', {
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
          })}
        </div>
      ) : null}

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
