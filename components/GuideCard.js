'use client';
import React from 'react';
import Link from '@/components/Link';
import { ArrowRight, Clock } from 'lucide-react';
import {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { getGuideIcon } from '@/config/icons';
import { createIntlTranslator, getTranslatedNavItemFields } from '@/lib/navigation-i18n';

const GuideCard = ({ guideItem, size = 'medium' }) => {
  const t = useTranslations();
  const translateText = createIntlTranslator(t);
  const { href, icon, iconKey, title, description, copyFromContent, ctaLabel, duration } =
    guideItem;
  const { title: displayTitle, description: displayDescription } = copyFromContent
    ? { title, description }
    : getTranslatedNavItemFields(guideItem.key ?? iconKey, { title, description }, translateText);
  // Accept either a React component (icon) or a string key (iconKey) for server→client boundary
  const Icon = icon || getGuideIcon(iconKey);

  if (size === 'large') {
    return (
      <Link href={href} className="block group">
        <Card className="relative h-full overflow-hidden rounded-lg border border-primary/15 shadow-xs transition-all duration-200 hover:shadow-xl hover:scale-[1.01] hover:border-primary/40 flex flex-col bg-linear-to-br from-card via-card to-primary/15 dark:to-primary/45">
          {/* Watermark icon. From md up (two cards per row) it sits large on
              the end side with the text kept clear of it. Below md the card is
              full width, so it shrinks into the top end corner and only the
              title steps around it; the description gets the full width. */}
          <div className="absolute top-3 inset-e-3 w-11 h-11 md:top-1/2 md:inset-e-2 md:-translate-y-1/2 md:w-36 md:h-36 flex items-center justify-center pointer-events-none">
            <Icon
              className="h-10 w-10 md:h-28 md:w-28 text-primary/15 md:text-primary/9 dark:text-primary/35"
              strokeWidth={0.9}
            />
          </div>
          <CardHeader className="relative py-4 pb-2 pe-16 md:pe-6">
            <CardTitle className="text-2xl">{displayTitle}</CardTitle>
          </CardHeader>
          <CardContent className="relative pb-4 flex-1 pt-0 md:pe-32">
            <CardDescription className="text-lg">{displayDescription}</CardDescription>
            {/* Same clock and size as the "Takes about" line in the guide header. */}
            {duration && (
              <div className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
                <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
                {duration}
              </div>
            )}
          </CardContent>
          <CardFooter className="relative mt-auto pt-0">
            <span className="text-primary font-medium inline-flex items-center text-base">
              {ctaLabel || t('common.viewChecklist')}{' '}
              <ArrowRight className="ms-2 transition-transform duration-300 ease-out group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1" />
            </span>
          </CardFooter>
        </Card>
      </Link>
    );
  }

  return (
    <Link href={href} className="block group">
      <Card className="h-full transition-all duration-200 ease-in-out transform hover:scale-101 hover:shadow-xl border-primary/10 hover:border-primary/30 bg-linear-to-br from-card via-card to-primary/5 dark:to-primary/35 flex flex-col">
        <CardHeader className="py-3 px-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Icon className="h-5 w-5" />
            </div>
            <CardTitle className="text-lg">{displayTitle}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="py-3 px-4 pt-0 flex-1">
          <CardDescription className="text-sm">{displayDescription}</CardDescription>
        </CardContent>
        <CardFooter className="py-3 px-4 pt-0 mt-auto">
          <span className="text-primary font-medium inline-flex items-center text-sm">
            {ctaLabel || t('common.viewChecklist')}{' '}
            <ArrowRight className="ms-2 transition-transform duration-300 ease-out group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1" />
          </span>
        </CardFooter>
      </Card>
    </Link>
  );
};

export default GuideCard;
