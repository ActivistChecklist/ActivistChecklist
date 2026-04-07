'use client';

import type { ReactNode } from 'react';
import { ReviewCommentsProvider } from './context';
import ReviewCommentsShell from './ReviewCommentsShell';
import type { PartialReviewCommentsLabels, ReviewCommentsScope } from './types';
import './rrc.css';

export type ReviewCommentsBoundaryProps = {
  enabled: boolean;
  path: string;
  locale: string;
  scope: ReviewCommentsScope;
  apiBase?: string;
  labels?: PartialReviewCommentsLabels;
  children: ReactNode;
};

/** Provider + shell + scoped styles; prefer this over wiring `ReviewCommentsProvider` manually. */
export function ReviewCommentsBoundary({
  enabled,
  path,
  locale,
  scope,
  apiBase = '/api/review-comments',
  labels,
  children,
}: ReviewCommentsBoundaryProps) {
  return (
    <ReviewCommentsProvider
      apiBase={apiBase}
      enabled={enabled}
      path={path}
      locale={locale}
      scope={scope}
      labels={labels}
    >
      <ReviewCommentsShell>{children}</ReviewCommentsShell>
    </ReviewCommentsProvider>
  );
}
