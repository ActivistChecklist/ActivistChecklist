'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import { useEolSnapshot } from '@/hooks/use-eol-snapshot';
import { findRelease } from '@/lib/updates/snapshot';
import { useAnalytics } from '@/hooks/use-analytics';

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
  const resultRef = useRef(null);

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

  // Scroll the result into view after it appears.
  useEffect(() => {
    if (selection && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [selection]);

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
    trackEvent({
      name: 'updates_search_select',
      productId: item.productId,
      releaseId: item.releaseId,
    });
  }

  function handleReset() {
    setSelection(null);
    trackEvent({ name: 'updates_reset' });
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

  return (
    <div className="space-y-6">
      <PageHero />

      <FamilyCategorySelector value={category} onChange={handleCategoryChange} />

      <DeviceSearchInput
        snapshot={snapshot}
        priorityProductIds={priorityProductIds}
        onSelect={handleSelect}
        autoFocus
      />

      {found ? (
        <div ref={resultRef} className="animate-in fade-in slide-in-from-bottom-2 duration-200">
          <ResultCard
            snapshot={snapshot}
            product={found.product}
            release={found.release}
            onReset={handleReset}
          />
        </div>
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
                {chunks ?? t('updates.snapshotStaleBannerLink')}
              </a>
            ),
          })}
        </div>
      ) : null}

      <FooterCredit />
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
      <h1 className="text-3xl font-bold leading-tight text-foreground sm:text-4xl">
        {t('updates.title')}
      </h1>
      <p className="mx-auto max-w-2xl text-base text-muted-foreground">
        {t('updates.intro')}
      </p>
    </header>
  );
}

function FooterCredit() {
  const t = useTranslations();
  return (
    <p className="pt-4 text-center text-xs text-muted-foreground">
      {t.rich('updates.footer', {
        endoflife: () => (
          <a
            href="https://endoflife.date"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            {t('updates.footerEndoflifeLinkText')}
          </a>
        ),
      })}
    </p>
  );
}
