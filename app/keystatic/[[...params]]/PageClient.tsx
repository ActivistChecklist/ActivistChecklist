'use client';

import { useEffect } from 'react';
import { makePage } from '@keystatic/next/ui/app';
import keystaticConfig from '../../../keystatic.config';
import PreviewForkSync from '@/components/keystatic/PreviewForkSync';

const KeystaticPage = makePage(keystaticConfig);

export default function PageClient() {
  // trailingSlash: true adds a trailing slash that breaks Keystatic's internal router.
  // Strip it on mount so Keystatic sees the correct path.
  useEffect(() => {
    if (window.location.pathname !== '/keystatic/' && window.location.pathname.endsWith('/')) {
      window.history.replaceState(
        null,
        '',
        window.location.pathname.slice(0, -1) + window.location.search,
      );
    }
  }, []);

  return (
    <>
      <PreviewForkSync />
      <KeystaticPage />
    </>
  );
}
