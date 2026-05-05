import { NextIntlClientProvider } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { ThemeProvider } from '@/components/layout/ThemeProvider';
import { AnnouncementProvider } from '@/contexts/AnnouncementContext';
import { getAnnouncement } from '@/lib/content';
import { getReviewCommentsConfig } from '@/lib/review-comments/env';
import { routing } from '@/i18n/routing';
import {
  ReviewCommentsProvider,
  type ReviewCommentsProviderProps,
} from '@activistchecklist/react-review-comments';
import '@/styles/globals.css';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({ children, params }) {
  const { locale } = await params;
  if (!routing.locales.includes(locale)) notFound();

  setRequestLocale(locale);
  const messages = (await import(`@/messages/${locale}.json`)).default;
  const announcement = getAnnouncement(locale);
  const reviewComments = getReviewCommentsConfig();
  const reviewCommentsProviderProps = {
    enabled: reviewComments.enabled,
  } satisfies Pick<ReviewCommentsProviderProps, 'enabled'>;

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/* Preload the font weights every page renders heavily — Source Sans 3
            400 for body copy, Libre Franklin 600 (font-semibold, e.g. HowTo
            titles) and 700 (default heading bold) for headings. Without preload
            the browser doesn't request these woff2 files until CSS parsing
            surfaces them, which means cross-breakpoint resizes (desktop nav →
            mobile nav) sometimes need to load a not-yet-rendered weight
            mid-resize, and briefly substitute the system fallback. Preloading
            + font-display: optional on these weights stops that mid-life swap. */}
        <link
          rel="preload"
          as="font"
          type="font/woff2"
          href="/fonts/source-sans-3-v19-latin-regular.woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          as="font"
          type="font/woff2"
          href="/fonts/libre-franklin-v20-latin-600.woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          as="font"
          type="font/woff2"
          href="/fonts/libre-franklin-v20-latin-700.woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body className="min-h-screen bg-background font-body antialiased">
        <AnnouncementProvider value={announcement}>
          <NextIntlClientProvider locale={locale} messages={messages}>
            <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
              <ReviewCommentsProvider {...reviewCommentsProviderProps}>
                {children}
              </ReviewCommentsProvider>
            </ThemeProvider>
          </NextIntlClientProvider>
        </AnnouncementProvider>
      </body>
    </html>
  );
}
