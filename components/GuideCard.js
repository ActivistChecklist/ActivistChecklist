'use client';
import React from 'react';
import Link from '@/components/Link';
import { ArrowRight } from 'lucide-react';
import { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { getGuideIcon } from '@/config/icons';
import { createIntlTranslator, getTranslatedNavItemFields } from '@/lib/navigation-i18n';

const GuideCard = ({
  guideItem,
  size = "medium"
}) => {
  const t = useTranslations();
  const translateText = createIntlTranslator(t);
  const { href, icon, iconKey, title, description, copyFromContent } = guideItem;
  const { title: displayTitle, description: displayDescription } = copyFromContent
    ? { title, description }
    : getTranslatedNavItemFields(guideItem.key ?? iconKey, { title, description }, translateText);
  // Accept either a React component (icon) or a string key (iconKey) for server→client boundary
  const Icon = icon || getGuideIcon(iconKey);

  if (size === "large") {
    return (
      <Link href={href} className="block group">
        <Card className="relative h-full overflow-hidden rounded-lg border border-primary/15 shadow-xs transition-all duration-200 hover:shadow-xl hover:scale-[1.01] hover:border-primary/40 flex flex-col bg-linear-to-br from-card via-card to-primary/15 dark:to-primary/45">
          <div className="absolute top-1/2 inset-e-2 -translate-y-1/2 w-36 h-36 flex items-center justify-center pointer-events-none">
            <Icon className="h-28 w-28 text-primary/9 dark:text-primary/35" strokeWidth={0.9} />
          </div>
          <CardHeader className="relative py-4 pb-2">
            <CardTitle className="text-2xl">{displayTitle}</CardTitle>
          </CardHeader>
          <CardContent className="relative pb-4 flex-1 pt-0 pe-32">
            <CardDescription className="text-lg">{displayDescription}</CardDescription>
          </CardContent>
          <CardFooter className="relative mt-auto pt-0">
            <span className="text-primary font-medium inline-flex items-center text-base">
              {t('common.viewChecklist')} <ArrowRight className="ms-2 transition-transform duration-300 ease-out group-hover:translate-x-1 [dir=rtl]:rotate-180 [dir=rtl]:group-hover:-translate-x-1" />
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
            {t('common.viewChecklist')} <ArrowRight className="ms-2 transition-transform duration-300 ease-out group-hover:translate-x-1 [dir=rtl]:rotate-180 [dir=rtl]:group-hover:-translate-x-1" />
          </span>
        </CardFooter>
      </Card>
    </Link>
  );
};

export default GuideCard;
