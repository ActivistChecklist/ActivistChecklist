import type { ReactNode } from 'react';
import { headers } from 'next/headers';

import DraftPreviewBanner from '@/components/layout/DraftPreviewBanner';
import {
  ReviewCommentsBoundary,
  reviewCommentsScopeFromHostHeader,
} from '@activistchecklist/react-review-comments';
import { getReviewCommentsConfig } from '@/lib/review-comments/env';

/**
 * Draft preview UI only for content routes (not the whole locale tree), so the root
 * layout stays free of draftMode() / cookies() for static pages.
 */
export default async function SlugLayout({
  children,
  params
}: {
  children: ReactNode;
  params: Promise<{ locale: string; slug: string[] }>;
}) {
  const { locale, slug: slugParts } = await params;
  const slug = slugParts?.join('/') || '';
  const reviewComments = getReviewCommentsConfig();
  const h = await headers();
  const scope = reviewCommentsScopeFromHostHeader(h.get('x-forwarded-host') || h.get('host'));

  return (
    <>
      <DraftPreviewBanner locale={locale} slug={slug} />
      <ReviewCommentsBoundary
        enabled={reviewComments.enabled}
        path={`/${slug}/`}
        locale={locale}
        scope={scope}
      >
        {children}
      </ReviewCommentsBoundary>
    </>
  );
}
