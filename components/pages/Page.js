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
 */
export default function Page({ frontmatter, serializedBody, locale, notices = [] }) {
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
      <div className="prose prose-slate max-w-none">
        <MDXRemote {...serializedBody} components={mdxComponents} />
      </div>
      {relatedGuideSlugs.length > 0 && (
        <RelatedGuides isBlock guideSlugs={relatedGuideSlugs} />
      )}
    </>
  );
}
