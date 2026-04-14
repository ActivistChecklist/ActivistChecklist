import { NextIntlClientProvider } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { ThemeProvider } from '@/components/layout/ThemeProvider';
import { AnnouncementProvider } from '@/contexts/AnnouncementContext';
import { getAnnouncement } from '@/lib/content';
import { routing } from '@/i18n/routing';
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

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="min-h-screen bg-background font-body antialiased">
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('non-us-notice-dismissed')==='true')document.documentElement.dataset.nonUsDismissed='true'}catch(e){}`,
          }}
        />
        <AnnouncementProvider value={announcement}>
          <NextIntlClientProvider locale={locale} messages={messages}>
            <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
              {children}
            </ThemeProvider>
          </NextIntlClientProvider>
        </AnnouncementProvider>
      </body>
    </html>
  );
}
