import { NextIntlClientProvider } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { DirectionProvider } from '@radix-ui/react-direction';
import { ThemeProvider } from '@/components/layout/ThemeProvider';
import { AnnouncementProvider } from '@/contexts/AnnouncementContext';
import { getAnnouncement } from '@/lib/content';
import { getReviewCommentsConfig } from '@/lib/review-comments/env';
import { routing } from '@/i18n/routing';
import { getLocaleDir } from '@/lib/rtl';
import {
  ReviewCommentsProvider,
  type ReviewCommentsProviderProps,
} from '@activistchecklist/react-review-comments';
import ReviewCommentsDbStatusLogger from '@/components/review-comments/ReviewCommentsDbStatusLogger';
import '@/styles/globals.css';

/**
 * Fonts worth preloading per script. Rubik is variable (300-900) and split by
 * unicode-range, so two files cover every weight an Arabic page renders: the
 * Arabic subset for the copy itself, and the Latin subset for the brand names,
 * URLs and numerals that appear inside it.
 */
const FONT_PRELOADS = {
  latin: [
    '/fonts/source-sans-3-v19-latin-regular.woff2',
    '/fonts/libre-franklin-v20-latin-600.woff2',
    '/fonts/libre-franklin-v20-latin-700.woff2',
  ],
  ar: [
    '/fonts/rubik-v31-arabic-wght-normal.woff2',
    '/fonts/rubik-v31-latin-wght-normal.woff2',
  ],
} as const;


export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({ children, params }) {
  const { locale } = await params;
  if (!routing.locales.includes(locale)) notFound();
  const dir = getLocaleDir(locale);

  setRequestLocale(locale);
  const messages = (await import(`@/messages/${locale}.json`)).default;
  const announcement = getAnnouncement(locale);
  const reviewComments = getReviewCommentsConfig();
  const reviewCommentsProviderProps = {
    enabled: reviewComments.enabled,
  } satisfies Pick<ReviewCommentsProviderProps, 'enabled'>;

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <head>
        {/* Preload the font weights every page renders heavily — Source Sans 3
            400 for body copy, Libre Franklin 600 (font-semibold, e.g. HowTo
            titles) and 700 (default heading bold) for headings. Without preload
            the browser doesn't request these woff2 files until CSS parsing
            surfaces them, which means cross-breakpoint resizes (desktop nav →
            mobile nav) sometimes need to load a not-yet-rendered weight
            mid-resize, and briefly substitute the system fallback. Preloading
            + font-display: optional on these weights stops that mid-life swap.

            Arabic renders in Rubik instead (see :root:lang(ar) in globals.css),
            so ar pages preload Rubik's Arabic + Latin subsets and skip the
            Latin-only families entirely — preloading a font the page never
            paints with is wasted bandwidth and a console warning. */}
        {FONT_PRELOADS[locale === 'ar' ? 'ar' : 'latin'].map((href) => (
          <link
            key={href}
            rel="preload"
            as="font"
            type="font/woff2"
            href={href}
            crossOrigin="anonymous"
          />
        ))}
        {/* llms.txt — curated index for LLM crawlers (llmstxt.org). */}
        <link
          rel="alternate"
          type="text/plain"
          title="llms.txt"
          href={locale === 'en' ? '/llms.txt' : `/${locale}/llms.txt`}
        />
      </head>
      <body className="min-h-screen bg-background font-body antialiased">
        {/* Every Radix primitive resolves its direction through useDirection(),
            which falls back to "ltr" when no dir prop or DirectionProvider is
            present — and the primitives render that as a real dir attribute,
            overriding <html dir="rtl"> for their whole subtree. That is what
            put the RadioGroup's buttons on the wrong side and reversed the nav
            menu order. One provider here covers all 22 primitives we use. */}
        <DirectionProvider dir={dir}>
          <AnnouncementProvider value={announcement}>
            <NextIntlClientProvider locale={locale} messages={messages}>
              <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
                <ReviewCommentsProvider {...reviewCommentsProviderProps}>
                  <ReviewCommentsDbStatusLogger enabled={reviewComments.enabled} />
                  {children}
                </ReviewCommentsProvider>
              </ThemeProvider>
            </NextIntlClientProvider>
          </AnnouncementProvider>
        </DirectionProvider>
      </body>
    </html>
  );
}
