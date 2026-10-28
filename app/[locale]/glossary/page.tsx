// @ts-nocheck
import { setRequestLocale, getTranslations } from 'next-intl/server';
import Layout from '@/components/layout/Layout';
import PageNotices from '@/components/layout/PageNotices';
import TermList from '@/components/TermList';
import { DEFAULT_LOCALE } from '@/lib/i18n-config';
import { getBaseUrl } from '@/lib/utils';
import { getOgImagePathForSlug } from '@/lib/og-image';

export async function generateMetadata({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });

  const baseUrl = getBaseUrl();
  const canonical =
    locale === DEFAULT_LOCALE ? `${baseUrl}/glossary/` : `${baseUrl}/${locale}/glossary/`;
  const title = t('terms.metaTitle');
  const description = t('terms.metaDescription');
  // Same English card the page render generates, so the URL matches the file.
  const tEn = await getTranslations({ locale: DEFAULT_LOCALE });
  const ogImageUrl = `${baseUrl}${getOgImagePathForSlug('glossary', { title: tEn('terms.title'), pageType: 'page' })}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: 'website',
      siteName: 'Activist Checklist',
      images: [ogImageUrl],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImageUrl],
    },
  };
}

export default async function TermsPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  // Generate OG image at build time. /glossary/ is an app route, not MDX, so the
  // guide/page render path never builds a card for it. One card is shared by
  // every locale, so render it from the English title.
  try {
    const { generateOgImageForRoute } = await import('@/lib/og-image');
    const tEn = await getTranslations({ locale: DEFAULT_LOCALE });
    await generateOgImageForRoute({
      title: tEn('terms.title'),
      pageType: 'page',
      slug: 'glossary',
    });
  } catch (err) {
    console.warn('OG image skipped for page "glossary":', err.message);
  }

  return (
    <Layout>
      <header>
        <h1 className="mb-4">{t('terms.title')}</h1>
        <p className="text-lg text-muted-foreground">{t('terms.intro')}</p>
      </header>

      <PageNotices />

      <TermList />
    </Layout>
  );
}
