'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Rows3, ListChecks } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useViewMode, VIEW_MODES } from '@/contexts/ViewModeContext';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';

/**
 * Segmented control for switching between detailed and compact checklist views.
 * Reads/writes view mode through ViewModeContext.
 */
export default function GuideViewToggle({ className }) {
  const t = useTranslations();
  const { viewMode, setViewMode } = useViewMode();

  const options = [
    {
      value: VIEW_MODES.DETAILED,
      label: t('checklistView.detailed'),
      tooltip: t('checklistView.detailedTooltip'),
      Icon: Rows3,
    },
    {
      value: VIEW_MODES.COMPACT,
      label: t('checklistView.compact'),
      tooltip: t('checklistView.compactTooltip'),
      Icon: ListChecks,
    },
  ];

  const onKeyDown = (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const idx = options.findIndex((o) => o.value === viewMode);
    const next = e.key === 'ArrowRight'
      ? options[(idx + 1) % options.length]
      : options[(idx - 1 + options.length) % options.length];
    setViewMode(next.value);
  };

  return (
    <TooltipProvider delayDuration={0} skipDelayDuration={1000} disableHoverableContent>
      <div
        role="group"
        aria-label={t('checklistView.toggleLabel')}
        onKeyDown={onKeyDown}
        className={cn(
          "inline-flex items-center rounded-md border border-border bg-background p-0.5 print:hidden",
          className,
        )}
      >
        {options.map(({ value, label, tooltip, Icon }) => {
          const isActive = value === viewMode;
          return (
            <Tooltip key={value}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setViewMode(value)}
                  aria-pressed={isActive}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-sm",
                    "transition-colors duration-150",
                    "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon aria-hidden className="h-4 w-4" />
                  <span>{label}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                sideOffset={6}
                className="max-w-xs text-center animate-none data-[state=closed]:animate-none"
              >
                {tooltip}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
