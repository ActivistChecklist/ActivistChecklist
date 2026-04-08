'use client';

import { createContext, useContext, useMemo, type ReactElement, type ReactNode } from 'react';
import { createReviewCommentsApi } from './api';
import { defaultReviewCommentsLabels } from './defaultLabels';
import type {
  PartialReviewCommentsLabels,
  ReviewCommentsContextValue,
  ReviewCommentsLabels,
  ReviewCommentsProviderProps,
  ReviewCommentsScope,
} from './types';

const ReviewCommentsContext = createContext<ReviewCommentsContextValue | null>(null);

function mergeLabels(overrides: PartialReviewCommentsLabels | undefined): ReviewCommentsLabels {
  if (!overrides || typeof overrides !== 'object') {
    return defaultReviewCommentsLabels;
  }
  return { ...defaultReviewCommentsLabels, ...overrides };
}

/** Context + API only. Prefer the package `ReviewCommentsProvider` in apps (includes shell + styles). */
export function ReviewCommentsContextProvider({
  children,
  apiBase,
  enabled,
  path,
  locale,
  scope,
  labels: labelsOverride,
}: ReviewCommentsProviderProps): ReactElement {
  const labels = useMemo(() => mergeLabels(labelsOverride), [labelsOverride]);
  const normalizedBase = String(apiBase || '/api/review-comments').replace(/\/$/, '');
  const api = useMemo(() => createReviewCommentsApi(normalizedBase), [normalizedBase]);
  const defaultScope: ReviewCommentsScope = { scopeKey: 'unknown' };
  const value = useMemo(
    () => ({
      api,
      apiBase: normalizedBase,
      enabled: Boolean(enabled),
      path: path || '',
      locale: locale || '',
      scope: scope || defaultScope,
      labels,
    }),
    [api, normalizedBase, enabled, path, locale, scope, labels]
  );

  return (
    <ReviewCommentsContext.Provider value={value}>{children}</ReviewCommentsContext.Provider>
  );
}

export function useReviewComments(): ReviewCommentsContextValue {
  const ctx = useContext(ReviewCommentsContext);
  if (!ctx) {
    throw new Error(
      'useReviewComments must be used within ReviewCommentsContextProvider (or ReviewCommentsProvider)'
    );
  }
  return ctx;
}
