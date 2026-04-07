import type { ReactNode } from 'react';

import DraftPreviewBanner from '@/components/layout/DraftPreviewBanner';
import AnnotationShell from '@/features/annotations/AnnotationShell';
import { getAnnotationsConfig } from '@/lib/annotations/env';

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
  const annotations = getAnnotationsConfig();

  return (
    <>
      <DraftPreviewBanner locale={locale} slug={slug} />
      <AnnotationShell
        enabled={annotations.enabled}
        path={`/${slug}/`}
        locale={locale}
        scope={annotations.scope}
      >
        {children}
      </AnnotationShell>
    </>
  );
}
