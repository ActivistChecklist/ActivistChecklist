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
