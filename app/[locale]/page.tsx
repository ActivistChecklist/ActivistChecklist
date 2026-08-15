// @ts-nocheck
import { setRequestLocale } from 'next-intl/server';
import { getAllChangelogEntries, toChangelogListEntry } from '@/lib/content';
import HomePageContent from '@/components/pages/HomePageContent';
import HomeNewsSection from './HomeNewsSection';
import { DEFAULT_LOCALE } from '@/lib/i18n-config';
import { getBaseUrl } from '@/lib/utils';
import { getOgImagePathForSlug } from '@/lib/og-image';
import JsonLd from '@/components/JsonLd';
import { buildHomePageGraph } from '@/lib/structured-data';

function getMessageValue(messages, keyPath) {
  return keyPath.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), messages);
}

export async function generateMetadata({ params }) {
  const { locale } = await params;
  let messages;

  try {
    messages = (await import(`@/messages/${locale}.json`)).default;
  } catch {
    messages = (await import(`@/messages/${DEFAULT_LOCALE}.json`)).default;
  }

  const title = getMessageValue(messages, 'site.title') || 'Activist Checklist';
  const description =
    getMessageValue(messages, 'site.description') ||
    'Plain language steps for digital security, because protecting yourself helps keep your whole community safer.';

  const baseUrl = getBaseUrl();
  const canonical =
    locale === DEFAULT_LOCALE ? `${baseUrl}/` : `${baseUrl}/${locale}/`;
  const ogImageUrl = `${baseUrl}${getOgImagePathForSlug('')}`;

  return {
    title,
    description,
    alternates: {
      canonical,
    },
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

export default async function HomePage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const changelogEntries = getAllChangelogEntries(locale).map(toChangelogListEntry);
  const latestMajor = changelogEntries.find((e) => e.type === 'major');
  const homeGraph = buildHomePageGraph({ baseUrl: getBaseUrl(), locale });

  return (
    <>
      <JsonLd data={homeGraph} />
      <HomePageContent
        changelogEntries={changelogEntries.slice(0, 5)}
        latestMajorBodyText={latestMajor?.bodyText ?? null}
        locale={locale}
      >
        <HomeNewsSection locale={locale} />
      </HomePageContent>
    </>
  );
}
