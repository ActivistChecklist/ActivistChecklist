'use client';

import { useTranslations } from 'next-intl';
import Link from '@/components/Link';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { SECURITY_CHECKLISTS } from '@/config/navigation';
import { cn } from '@/lib/utils';

/**
 * "Checklists › The basics" above a guide or explainer title, linking back to
 * /checklists/ and to the section's anchor there. Renders nothing for pages
 * that aren't in a section.
 *
 * @param {{ key: string, href: string } | null} section - from CHECKLIST_SECTIONS
 */
export default function SectionBreadcrumb({ section, className }) {
  const t = useTranslations();
  if (!section) return null;

  return (
    <Breadcrumb className={cn('print:hidden', className)}>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link href={SECURITY_CHECKLISTS.href}>{t('checklists.title')}</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link href={section.href}>{t(`checklistSections.${section.key}.title`)}</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
