'use client';

import { useTranslations } from 'next-intl';
import { FaApple, FaAndroid, FaWindows } from 'react-icons/fa6';
import { Smartphone } from 'lucide-react';

import { cn } from '@/lib/utils';

const FAMILY_ICONS = {
  apple: FaApple,
  android: FaAndroid,
  windows: FaWindows,
  other: Smartphone,
};

/**
 * Four cards above the search input. Clicking sets the active platform filter
 * AND opens a modal explaining how to find the model/version on that platform.
 */
export default function FamilyButtons({ onSelect }) {
  const t = useTranslations();
  const groups = ['apple', 'android', 'windows', 'other'];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {groups.map((group) => {
        const Icon = FAMILY_ICONS[group];
        return (
          <button
            key={group}
            type="button"
            onClick={() => onSelect?.(group)}
            className={cn(
              'group flex flex-col items-center gap-2 rounded-lg border-2 border-border bg-background p-4 text-center transition-colors',
              'hover:border-primary hover:bg-primary/5 focus:outline-hidden focus:ring-2 focus:ring-primary/40'
            )}
          >
            <Icon className="h-8 w-8 text-foreground/80 group-hover:text-primary" aria-hidden="true" />
            <div className="text-base font-semibold text-foreground">
              {t(`updates.family.${group}.buttonTitle`)}
            </div>
            <div className="text-xs text-muted-foreground">
              {t(`updates.family.${group}.buttonSubtitle`)}
            </div>
          </button>
        );
      })}
    </div>
  );
}
