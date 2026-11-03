'use client';

import { ArrowRight, FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from '@/components/Link';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { READ_KIND_ICONS } from '@/config/icons';

/**
 * A page (an explainer, a printable, any other page) among related guides.
 * Same frame as a medium GuideCard so the two share a grid, but marked as
 * reading material the way the checklist sections mark it: a green outline
 * icon and "Read more" instead of "View checklist".
 *
 * @param {{ href: string, kind?: string, title: string, description?: string }} page - from getRelatedPages
 */
export default function PageCard({ page }) {
  const t = useTranslations();
  const { href, kind, title, description } = page;
  const Icon = READ_KIND_ICONS[kind] || FileText;
  const cta = kind === 'printable' ? t('relatedGuides.viewPrintable') : t('relatedGuides.readMore');

  return (
    <Link href={href} className="block group">
      <Card className="h-full transition-all duration-200 ease-in-out transform hover:scale-101 hover:shadow-xl border-success/15 hover:border-success/40 bg-linear-to-br from-card via-card to-success/5 dark:to-success/15 flex flex-col">
        <CardHeader className="py-3 px-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-success/10 text-success">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </div>
            {/* Page titles run longer than guide titles and can wrap. */}
            <CardTitle className="text-lg leading-tight">{title}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="py-3 px-4 pt-0 flex-1">
          {description && (
            <CardDescription className="text-sm line-clamp-3">{description}</CardDescription>
          )}
        </CardContent>
        <CardFooter className="py-3 px-4 pt-0 mt-auto">
          <span className="text-primary font-medium inline-flex items-center text-sm">
            {cta}{' '}
            <ArrowRight className="ml-2 transition-transform duration-300 ease-out group-hover:translate-x-1" />
          </span>
        </CardFooter>
      </Card>
    </Link>
  );
}
