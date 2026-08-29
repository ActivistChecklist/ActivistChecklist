'use client';

import React, { useEffect } from 'react';
import { MDXRemote } from 'next-mdx-remote';
import { useTranslations, useLocale } from 'next-intl';
import { mdxComponents } from '@/lib/mdx-components';
import { useLayout } from '@/contexts/LayoutContext';
import { MetaBar, getDateMetaItem } from '@/components/ui/meta-bar';
import RelatedGuides from '@/components/RelatedGuides';
import { LOCALES } from "@/lib/i18n-config";
import PageNotices from '@/components/layout/PageNotices';
import AnswerCapsule from '@/components/AnswerCapsule';

// The newsletter CTA belongs to guides only. Neutralizing the component here
// (rather than only stripping it from the MDX) also covers translated copies
// that still carry the tag until Crowdin catches up.
const pageMdxComponents = { ...mdxComponents, InlineCta: () => null };

function parseRelatedGuides(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value !== 'string') return [];
  return value
    .split(',')
    .map((slug) => slug.trim())
    .filter(Boolean);
}

/**
 * Renders a generic page sourced from MDX files.
 *
 * Sources content from:
 *   - frontmatter: title, lastUpdated (date)
 *   - serializedBody: next-mdx-remote compiled MDX
 *   - locale: BCP 47 locale string for date formatting (provided by parent Server Component)
 *
 * The newsletter CTA is a guides-only treatment, so pages neither get the
 * auto-inserted one nor render a manual <InlineCta /> left in their MDX.
 */
export default function Page({
  frontmatter,
  serializedBody,
  locale,
  notices = [],
}) {
  const t = useTranslations();
  const intlLocale = useLocale() || locale || 'en';
  const dateLocale = LOCALES[intlLocale]?.intlLocale || 'en-US';
  const { setSidebarType } = useLayout();

  useEffect(() => {
    setSidebarType(frontmatter.showToc === true ? 'toc' : 'navigation');
  }, [setSidebarType, frontmatter.showToc]);

  const metaBarItems = [
    getDateMetaItem(frontmatter.lastUpdated, t('meta.lastUpdatedOn'), dateLocale),
  ].filter(Boolean);
  const relatedGuideSlugs = parseRelatedGuides(frontmatter.relatedGuides);

  return (
    <>
      <h1 className="mb-6">{frontmatter.title}</h1>
      <PageNotices initialNotices={notices} />
      {metaBarItems.length > 0 && <MetaBar items={metaBarItems} />}
      <AnswerCapsule text={frontmatter.answerCapsule} />
      <div className="prose prose-slate max-w-none">
        {serializedBody && (
          <MDXRemote {...serializedBody} components={pageMdxComponents} />
        )}
      </div>
      {relatedGuideSlugs.length > 0 && (
        <RelatedGuides isBlock guideSlugs={relatedGuideSlugs} />
      )}
    </>
  );
}
