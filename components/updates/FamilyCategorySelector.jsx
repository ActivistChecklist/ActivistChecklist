'use client';

import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight, X, Info } from 'lucide-react';

import { cn } from '@/lib/utils';
import { SUB_CATEGORIES_BY_PLATFORM, leafForPlatform } from '@/lib/updates/categories';
import { PLATFORM_GROUP_ICON, BRAND_ICON } from '@/lib/updates/family-icons';

const PLATFORMS = ['apple', 'android', 'windows', 'other'];

/**
 * Drill-down selector that replaces the old four-button row + modal.
 * Three steps:
 *   l1 = pick a platform (Apple / Android / Windows / Other)
 *   l2 = pick a sub-category within that platform (or info panel for "other")
 *   l3 = breadcrumb showing the picked path; the search input is the focus
 *
 * `value` is `{ platform, subCategory } | null`. The parent owns state so the
 * priorityProductIds can be threaded into the autocomplete.
 *
 * Picking a leaf platform (Windows) jumps L1 → L3 (skips L2).
 */
export default function FamilyCategorySelector({ value, onChange }) {
  const t = useTranslations();
  const platform = value?.platform ?? null;
  const subCategory = value?.subCategory ?? null;
  const step = subCategory ? 'l3' : platform ? 'l2' : 'l1';

  function pickPlatform(p) {
    const leaf = leafForPlatform(p);
    if (leaf) {
      onChange({ platform: p, subCategory: leaf });
    } else {
      onChange({ platform: p, subCategory: null });
    }
  }

  function pickSubCategory(sc) {
    onChange({ platform, subCategory: sc });
  }

  function backToL1() {
    onChange(null);
  }

  function backToL2() {
    if (!platform) return;
    // Only meaningful if the platform has sub-categories (i.e., not Windows leaf).
    const subs = SUB_CATEGORIES_BY_PLATFORM[platform] || [];
    if (subs.length > 1 || platform === 'other') {
      onChange({ platform, subCategory: null });
    } else {
      // Windows leaf → no L2, go to L1 instead.
      backToL1();
    }
  }

  return (
    // Stable height across L1 → L2 → L3 transitions so the page doesn't jump.
    // 12rem fits the 3-row mobile grid (Android has 6 sub-cards in 2 cols);
    // 9rem is enough for desktop (4-card L1 row, 3-col L2 grid).
    <div className="min-h-[12rem] sm:min-h-[9rem]">
      {step === 'l1' ? <L1 onPick={pickPlatform} /> : null}
      {step === 'l2' ? (
        <L2
          platform={platform}
          onPick={pickSubCategory}
          onBack={backToL1}
        />
      ) : null}
      {step === 'l3' ? (
        <L3
          platform={platform}
          subCategory={subCategory}
          onClickPlatform={backToL2}
          onClear={backToL1}
        />
      ) : null}
    </div>
  );
}

function L1({ onPick }) {
  const t = useTranslations();
  return (
    <div
      key="l1"
      className="animate-in fade-in slide-in-from-left-2 duration-200"
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {PLATFORMS.map((p) => {
          const Icon = PLATFORM_GROUP_ICON[p];
          return (
            <button
              key={p}
              type="button"
              onClick={() => onPick(p)}
              className={cn(
                'group flex flex-col items-center gap-2 rounded-lg border-2 border-border bg-background p-4 text-center transition-colors',
                'hover:border-primary hover:bg-primary/5 focus:outline-hidden focus:ring-2 focus:ring-primary/40'
              )}
            >
              <Icon className="h-8 w-8 text-foreground/80 group-hover:text-primary" aria-hidden="true" />
              <div className="text-base font-semibold text-foreground">
                {t(`updates.platform.${p}`)}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function L2({ platform, onPick, onBack }) {
  const t = useTranslations();
  const subs = SUB_CATEGORIES_BY_PLATFORM[platform] || [];
  const platformLabel = t(`updates.platform.${platform}`);

  return (
    <div
      key={`l2-${platform}`}
      className="animate-in fade-in slide-in-from-right-2 duration-200 space-y-3"
    >
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          {t('updates.subCategory.back')}
        </button>
        <p className="text-sm text-muted-foreground">
          {t('updates.subCategory.prompt', { platform: platformLabel })}
        </p>
      </div>

      {platform === 'other' ? (
        <OtherInfoPanel />
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {subs.map((sc) => {
            const Icon = BRAND_ICON[sc.family];
            return (
              <button
                key={sc.id}
                type="button"
                onClick={() => onPick(sc)}
                className={cn(
                  'group flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2.5 text-left transition-colors',
                  'hover:border-primary hover:bg-primary/5 focus:outline-hidden focus:ring-2 focus:ring-primary/40'
                )}
              >
                {Icon ? (
                  <Icon className="h-5 w-5 shrink-0 text-foreground/70 group-hover:text-primary" aria-hidden="true" />
                ) : null}
                <span className="text-sm font-medium text-foreground">
                  {t(`updates.subCategory.${sc.labelKey}`)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function L3({ platform, subCategory, onClickPlatform, onClear }) {
  const t = useTranslations();
  const platformLabel = t(`updates.platform.${platform}`);
  const subLabel = subCategory?.labelKey
    ? t(`updates.subCategory.${subCategory.labelKey}`)
    : '';
  const Icon = BRAND_ICON[subCategory?.family];

  // "How to find this" hint is keyed by sub-category labelKey when we have copy for it.
  // We use t.rich so messages can include <code>winver</code> for monospace tokens.
  let findHint = null;
  if (subCategory?.labelKey) {
    try {
      const key = `updates.findYourModel.${subCategory.labelKey}`;
      const raw = t(key);
      if (raw && !raw.startsWith('updates.findYourModel.')) {
        findHint = t.rich(key, {
          code: (chunks) => (
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-base text-foreground">
              {chunks}
            </code>
          ),
        });
      }
    } catch {
      findHint = null;
    }
  }

  return (
    <div
      key={`l3-${platform}-${subCategory?.id || ''}`}
      className="animate-in fade-in slide-in-from-right-2 duration-200 space-y-3"
    >
      {/* Bigger breadcrumb so this row carries some weight in place of the L1/L2 cards.
          When the leaf label matches the platform (Windows → Windows), collapse the
          chevron + duplicate so we don't show "Windows › Windows". */}
      <div
        role="group"
        aria-label={t('updates.breadcrumb.ariaLabel')}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 p-1.5 pl-3"
      >
        {Icon ? <Icon className="h-5 w-5 shrink-0 text-foreground/70" aria-hidden="true" /> : null}
        <button
          type="button"
          onClick={onClear}
          className="rounded-md px-2 py-1 text-base font-medium text-foreground hover:bg-foreground/10"
        >
          {platformLabel}
        </button>
        {subLabel && subLabel !== platformLabel ? (
          <>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <button
              type="button"
              onClick={onClickPlatform}
              className="rounded-md px-2 py-1 text-base font-medium text-foreground hover:bg-foreground/10"
            >
              {subLabel}
            </button>
          </>
        ) : null}
        <button
          type="button"
          onClick={onClear}
          aria-label={t('updates.breadcrumb.clear')}
          className="ml-0.5 rounded-md p-1.5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {findHint ? (
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground/70">
            <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {t('updates.findYourModel.label')}
          </div>
          <p className="mt-1 text-sm font-medium text-foreground sm:text-base">
            {findHint}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function OtherInfoPanel() {
  const t = useTranslations();
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4">
      <p className="text-sm font-medium text-foreground">{t('updates.otherInfo.title')}</p>
      <p className="mt-1 text-sm text-foreground/90">
        {t.rich('updates.otherInfo.body', {
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
    </div>
  );
}
