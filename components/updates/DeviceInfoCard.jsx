'use client';

import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';
import { buildDisplayLabel } from '@/lib/updates/search';
import { iconForFamily } from '@/lib/updates/family-icons';

function formatMonthYear(iso, locale = 'en-US') {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
}

/**
 * Compact info card showing the picked device/OS with its brand icon, display name,
 * and a "Manufacturer · Released Month YYYY" subtitle. Lives in the same slot as the
 * search input so picking a device swaps the input for this panel in place.
 *
 * The whole panel is click-to-edit: clicking it (or pressing Enter/Space) calls
 * `onEdit(label)` so the parent can re-open the search input with this label
 * pre-filled and pre-selected — like reopening a `<select>`. The inner "Start over"
 * button does a full reset and lights up to primary fill on panel hover (via
 * `group-hover`) so the destructive action stays visible.
 */
export default function DeviceInfoCard({ product, release, onReset, onEdit }) {
  const t = useTranslations();
  const Icon = iconForFamily(product.family);
  const label = buildDisplayLabel(product, release);

  let manufacturer = '';
  try {
    const m = t(`updates.result.deviceInfo.manufacturer.${product.family}`);
    if (m && !m.startsWith('updates.result.deviceInfo.')) manufacturer = m;
  } catch {
    /* fall through */
  }

  const dateText = release.releaseDate ? formatMonthYear(release.releaseDate) : null;
  const subtitle = dateText
    ? t('updates.result.deviceInfo.manufacturerLine', { manufacturer, date: dateText })
    : manufacturer
      ? t('updates.result.deviceInfo.manufacturerLineNoDate', { manufacturer })
      : null;

  function triggerEdit(e) {
    // Bail out if the click originated on a child interactive element (e.g. the
    // Start over button). Belt-and-suspenders alongside the inner button's
    // stopPropagation — without this guard, browsers that fire wrapper handlers
    // before child stopPropagation kicks in can leak the click into the edit
    // path, which then seeds the search input with the previous label and makes
    // Start over feel like Edit.
    if (e?.target?.closest?.('button, a, input, textarea')) return;
    onEdit?.(label);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      // Same guard for keyboard activation: Enter/Space on a focused inner
      // button shouldn't also trigger the wrapper's edit handler.
      if (e.target?.closest?.('button, a, input, textarea')) return;
      e.preventDefault();
      onEdit?.(label);
    }
  }

  // Padding/border match the search input shell (`rounded-lg border-2 px-4 py-4 sm:py-5`)
  // so swapping between this panel and the input feels like one element changing modes
  // rather than two different boxes.
  return (
    <div
      role={onEdit ? 'button' : undefined}
      tabIndex={onEdit ? 0 : undefined}
      aria-label={onEdit ? t('updates.editSelectionAriaLabel') : undefined}
      onClick={onEdit ? triggerEdit : undefined}
      onKeyDown={onEdit ? handleKeyDown : undefined}
      className={cn(
        // border-muted-foreground/50 reads at roughly the same weight as the
        // /50 tone borders on the result boxes below, so the device card no
        // longer looks dim relative to the colored boxes.
        'group flex items-center gap-3 rounded-lg border-2 border-muted-foreground/50 bg-background px-4 py-4 shadow-sm transition-colors sm:py-5',
        // hover gets a subtle primary-tinted bg in addition to the primary
        // border, mirroring the L1 platform-card hover state for consistency.
        onEdit ? 'cursor-pointer hover:border-primary hover:bg-primary/5 focus:outline-hidden focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20' : null
      )}
    >
      <Icon className="h-7 w-7 shrink-0 text-foreground/80" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-semibold text-foreground sm:text-lg">{label}</p>
        {subtitle ? (
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {onReset ? (
        <button
          type="button"
          onClick={(e) => {
            // The wrapper handles click-to-edit; this button is the explicit full-reset
            // path and must not also trigger the edit handler.
            e.stopPropagation();
            onReset();
          }}
          className={cn(
            'shrink-0 cursor-pointer rounded-md border-2 border-primary px-3 py-1.5 text-xs font-medium text-primary transition-colors',
            // Fill primary as soon as the user moves the mouse over the parent panel,
            // so the destructive action surfaces even before the cursor reaches the button.
            'group-hover:bg-primary group-hover:text-primary-foreground',
            'focus-visible:bg-primary focus-visible:text-primary-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/40'
          )}
        >
          {t('updates.result.startOver')}
        </button>
      ) : null}
    </div>
  );
}
