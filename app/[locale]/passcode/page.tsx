// @ts-nocheck
import { setRequestLocale, getTranslations } from 'next-intl/server';
import Layout from '@/components/layout/Layout';
import PasscodeGenerator from '@/components/guides/PasscodeGenerator';
import PasscodePageItem from '@/components/guides/PasscodePageItem';
import RelatedGuides from '@/components/RelatedGuides';
import { getChecklistItem, serializeFrontmatter } from '@/lib/content';
import { serializeMdx } from '@/lib/serialize-mdx';
import { DEFAULT_LOCALE } from '@/lib/i18n-config';
import { getBaseUrl } from '@/lib/utils';
import { getOgImagePathForSlug } from '@/lib/og-image';

const ROUTE_SLUG = 'passcode';
const ITEM_SLUG = 'passcode';
// Guides that include the passcode item
const RELATED_GUIDES = ['essentials', 'signal', 'travel', 'protest'];

export async function generateMetadata({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });

  const baseUrl = getBaseUrl();
  const canonical =
    locale === DEFAULT_LOCALE ? `${baseUrl}/${ROUTE_SLUG}/` : `${baseUrl}/${locale}/${ROUTE_SLUG}/`;
  const title = t('passcodeGenerator.page.metaTitle');
  const description = t('passcodeGenerator.page.metaDescription');
  // Same English card the page render generates, so the URL matches the file.
  const tEn = await getTranslations({ locale: DEFAULT_LOCALE });
  const ogImageUrl = `${baseUrl}${getOgImagePathForSlug(ROUTE_SLUG, { title: tEn('passcodeGenerator.page.title'), pageType: 'page' })}`;

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

export default async function PasscodeGeneratorPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  // Generate OG image at build time. This is an app route, not MDX, so the
  // guide/page render path never builds a card for it. One card is shared by
  // every locale, so render it from the English title.
  try {
    const { generateOgImageForRoute } = await import('@/lib/og-image');
    const tEn = await getTranslations({ locale: DEFAULT_LOCALE });
    await generateOgImageForRoute({
      title: tEn('passcodeGenerator.page.title'),
      pageType: 'page',
      slug: ROUTE_SLUG,
    });
  } catch (err) {
    console.warn(`OG image skipped for page "${ROUTE_SLUG}":`, err.message);
  }

  const item = getChecklistItem(ITEM_SLUG, locale);
  const serializedBody = item?.content ? await serializeMdx(item.content) : null;

  return (
    <Layout>
      <div className="mx-auto grid w-full max-w-3xl gap-8 py-2 sm:py-4">
        <header className="space-y-3 text-center">
          <h1 className="text-balance text-3xl font-bold leading-tight text-foreground sm:text-4xl">
            {t('passcodeGenerator.page.title')}
          </h1>
          <p className="mx-auto max-w-xl text-pretty text-base text-muted-foreground sm:text-lg">
            {t('passcodeGenerator.page.intro')}
          </p>
        </header>

        <PasscodeGenerator variant="hero" />

        {item && (
          <PasscodePageItem
            slug={ITEM_SLUG}
            frontmatter={serializeFrontmatter(item.frontmatter)}
            serializedBody={serializedBody}
          />
        )}

        <RelatedGuides isBlock guideSlugs={RELATED_GUIDES} />
      </div>
    </Layout>
  );
}
