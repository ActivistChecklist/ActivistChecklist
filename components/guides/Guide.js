'use client';

import React, { useEffect } from 'react';
import { useGuideHashScroll } from '@/hooks/use-guide-hash-scroll';
import { MDXRemote } from 'next-mdx-remote';
import { Clock, Calendar, Download } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { mdxComponents } from '@/lib/mdx-components';
import { ChecklistItemsContext } from '@/contexts/ChecklistItemsContext';
import { FeedbackCTA } from '@/components/guides/FeedbackCTA';
import InlineCta from '@/components/InlineCta';
import { useLayout } from '@/contexts/LayoutContext';
import { getGuideIcon } from '@/config/icons';
import RelatedGuides from '@/components/RelatedGuides';
import SectionReadLinks from '@/components/SectionReadLinks';
import SectionBreadcrumb from '@/components/SectionBreadcrumb';
import { CHECKLIST_SECTIONS, CHECKLIST_SECTION_KEYS, NAV_ITEM_DATA } from '@/config/navigation';
import {
  findPairedExplainer,
  findSectionForGuide,
  findSectionForPage,
  getNextInSection,
} from '@/lib/checklist-sections';
import { LOCALES } from '@/lib/i18n-config';
import { parseRelatedGuides } from '@/lib/related-guides';
import { formatContentDate } from '@/lib/utils';
import PageNotices from '@/components/layout/PageNotices';
import { MobileTableOfContents } from '@/components/layout/TableOfContentsSidebar';
import PrintNotice from '@/components/guides/PrintNotice';
import { pdfDownloadName, pdfPathFor } from '@/lib/pdf-export.mjs';
import { trackFileDownload } from '@/lib/download-tracker';

// Set in next.config.js: on for static builds (which run scripts/build-pdfs.mjs)
// and dev, off for server builds that never produce the files.
const PDF_EXPORT_ENABLED = process.env.NEXT_PUBLIC_PDF_EXPORT === '1';

/**
 * Renders a guide page sourced from MDX files.
 *
 * Sources content from:
 *   - frontmatter: title, lastUpdated, estimatedTime
 *   - serializedBody: next-mdx-remote compiled MDX (contains <Section> + <ChecklistItem> tags)
 *   - checklistItems: { [slug]: { frontmatter, serializedBody } } map for ChecklistItemsContext
 *   - locale: BCP 47 locale string for date formatting (provided by parent Server Component)
 *   - relatedPages: card data for the pages in relatedGuides (lib/nav-copy.js getRelatedPages)
 */
export default function Guide({
  frontmatter,
  serializedIntro,
  serializedBodyBeforeCta,
  serializedBodyAfterCta,
  showInlineCta = false,
  checklistItems = {},
  slug,
  locale,
  notices = [],
  readMinutes = {},
  relatedPages = {},
}) {
  const t = useTranslations();
  // Prefer locale from NextIntlClientProvider (set by the locale layout), fall back to prop
  const intlLocale = useLocale() || locale || 'en';
  const dateLocale = LOCALES[intlLocale]?.intlLocale || 'en-US';
  const { setSidebarType } = useLayout();

  useGuideHashScroll();

  useEffect(() => {
    setSidebarType('toc');
  }, []);

  const GuideIcon = getGuideIcon(slug);
  const curatedRelated = parseRelatedGuides(frontmatter.relatedGuides);

  // Section wayfinding: a breadcrumb back to the guide's section, one
  // "Understand why" explainer near the top, and the section's explainers at
  // the end. Editors' relatedGuides win; without them, suggest the next
  // checklists in the same section. A how-to guide (the security party) isn't
  // among a section's checklists, only featured in it, so it's found like a page.
  const sectionKeys =
    findSectionForGuide(CHECKLIST_SECTION_KEYS, slug) ||
    findSectionForPage(CHECKLIST_SECTION_KEYS, NAV_ITEM_DATA, slug);
  const section = sectionKeys && CHECKLIST_SECTIONS.find((s) => s.key === sectionKeys.key);
  const pairedKey = findPairedExplainer(NAV_ITEM_DATA, slug);
  const pairedExplainer = CHECKLIST_SECTIONS.flatMap((s) => s.reads).find(
    (item) => item.key === pairedKey,
  );
  const relatedGuideSlugs = curatedRelated.length
    ? curatedRelated
    : getNextInSection(sectionKeys, slug, 2);
  const endReads = (section?.reads || []).filter((item) => item.key !== pairedKey);

  const metaBarItems = [];

  if (frontmatter.lastUpdated) {
    metaBarItems.push({
      icon: <Calendar className="h-4 w-4 mr-1" />,
      label: t('meta.lastUpdatedOn'),
      value: formatContentDate(frontmatter.lastUpdated, dateLocale),
    });
  }

  if (frontmatter.estimatedTime) {
    metaBarItems.push({
      icon: <Clock className="h-4 w-4 mr-0.5" />,
      label: t('meta.takesAbout'),
      value: frontmatter.estimatedTime,
    });
  }

  return (
    <ChecklistItemsContext.Provider value={checklistItems}>
      {/* Header */}
      <div className="relative bg-linear-to-r from-primary/15 via-primary/10 to-transparent dark:from-primary/40 dark:via-primary/25 rounded-lg px-6 py-6 mb-6 overflow-hidden print:bg-none print:p-0 print:mb-4">
        <div className="absolute top-1.5 bottom-1.5 right-3 aspect-square flex items-center justify-center pointer-events-none print:hidden">
          <GuideIcon className="h-5/6 w-5/6 text-primary/15 dark:text-primary/40" />
        </div>
        <SectionBreadcrumb section={section} className="relative mb-3" />
        <h1 className="relative mb-3 print:mb-0 print:pr-[260px]">{frontmatter.title}</h1>
        {metaBarItems.length > 0 && (
          <div className="relative flex flex-wrap items-center gap-y-2 gap-x-6 text-sm text-muted-foreground print:mb-0">
            {metaBarItems.map((item, index) => (
              <div key={index} className="flex items-center whitespace-nowrap">
                {item.icon}&nbsp;
                <span>
                  {item.label}&nbsp;
                  <span className="text-foreground font-semibold">{item.value}</span>
                </span>
              </div>
            ))}
            {PDF_EXPORT_ENABLED && (
              // Plain <a>, not @/components/Link: this is a file download, and the
              // path already carries its locale, so it must not be prefixed again.
              <a
                href={pdfPathFor(intlLocale, slug)}
                download={pdfDownloadName(intlLocale, slug)}
                onClick={() => trackFileDownload(pdfDownloadName(intlLocale, slug))}
                className="flex items-center whitespace-nowrap font-semibold text-primary hover:underline underline-offset-4 print:hidden"
              >
                <Download className="h-4 w-4 mr-1" aria-hidden="true" />
                {t('meta.downloadPdf')}
              </a>
            )}
          </div>
        )}
      </div>

      <PrintNotice />
      <PageNotices initialNotices={notices} />
      <MobileTableOfContents />

      {pairedExplainer && (
        <SectionReadLinks
          label={t('checklistSections.understandWhy')}
          items={[pairedExplainer]}
          readMinutes={readMinutes}
          className="mb-6 print:hidden"
        />
      )}

      {/* Body */}
      <div className="mx-auto">
        <div className="relative">
          {serializedIntro && (
            <div className="prose prose-slate max-w-none">
              <MDXRemote {...serializedIntro} components={mdxComponents} />
            </div>
          )}
          {serializedBodyBeforeCta && (
            <MDXRemote {...serializedBodyBeforeCta} components={mdxComponents} />
          )}
          {showInlineCta && <InlineCta />}
          {serializedBodyAfterCta && (
            <MDXRemote {...serializedBodyAfterCta} components={mdxComponents} />
          )}
          {relatedGuideSlugs.length > 0 && (
            <RelatedGuides
              isBlock
              guideSlugs={relatedGuideSlugs}
              pages={relatedPages}
              reads={endReads}
              readMinutes={readMinutes}
            />
          )}
          <FeedbackCTA />
        </div>
      </div>
    </ChecklistItemsContext.Provider>
  );
}
