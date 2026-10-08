'use client';

import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Visual only; no position — avoids overlapping interactive checklist chrome. */
const baseButtonClassName =
  'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground shadow-xs hover:bg-accent hover:text-foreground';

const positionClassName = {
  /** Own row / toolbar — does not stack over the preview (default). */
  inline: 'relative',
  /** Floats top-right of a `relative` parent; can overlap content — use sparingly. */
  corner: 'absolute top-1 right-1 z-20',
};

const DEFAULT_ARIA = 'Open in Keystatic (new tab)';
const DEFAULT_TITLE = 'Open in Keystatic (new tab)';

/** Named presets keep copy next to the control; add more as you reuse this. */
const PRESETS = {
  'checklist-item': {
    'aria-label': 'Edit this checklist item in Keystatic',
    title: 'Edit checklist item in CMS (new tab)',
  },
};

export const KEYSTATIC_OPEN_ENTRY_PRESET = {
  checklistItem: 'checklist-item',
};

/**
 * Small “open in Keystatic” control: new tab, stops pointer propagation for the MDX editor.
 *
 * `position="inline"` (default) keeps the control in normal flow so it does not sit on top of
 * checklist cards / headers. Use `position="corner"` only when it should float inside a
 * `relative` wrapper without covering other UI.
 *
 * Use `preset` for bundled aria-label/title, or pass `aria-label` / `title` to override.
 */
export default function KeystaticOpenEntryLink({
  href,
  preset,
  position = 'inline',
  'aria-label': ariaLabelProp,
  title: titleProp,
  className,
}) {
  const fromPreset = preset ? PRESETS[preset] : null;
  const ariaLabel = ariaLabelProp ?? fromPreset?.['aria-label'] ?? DEFAULT_ARIA;
  const title = titleProp ?? fromPreset?.title ?? DEFAULT_TITLE;
  const pos = positionClassName[position] ?? positionClassName.inline;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(baseButtonClassName, pos, className)}
      aria-label={ariaLabel}
      title={title}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
    </a>
  );
}
