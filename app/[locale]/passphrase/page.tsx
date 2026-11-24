// @ts-nocheck
import { setRequestLocale, getTranslations } from 'next-intl/server';
import Layout from '@/components/layout/Layout';
import PassphraseGenerator from '@/components/guides/PassphraseGenerator';
import PinnedChecklistItem from '@/components/guides/PinnedChecklistItem';
import RelatedGuides from '@/components/RelatedGuides';
import { Alert } from '@/components/ui/alert';
import { getChecklistItem, serializeFrontmatter } from '@/lib/content';
import { serializeMdx } from '@/lib/serialize-mdx';
import { DEFAULT_LOCALE } from '@/lib/i18n-config';
import { getBaseUrl } from '@/lib/utils';
import { getOgImagePathForSlug } from '@/lib/og-image';

const ROUTE_SLUG = 'passphrase';
// Pinned open below the generator, since everything except the few passwords
// this page is for should come from a password manager.
const ITEM_SLUG = 'password-manager';
// Guides that include the passphrase and password manager items
const RELATED_GUIDES = ['essentials', 'travel'];

// Scoped to the page's own strings, for the same CodeQL reason as the
// passcode page.
function getEnglishPageTranslations() {
  return getTranslations({ locale: DEFAULT_LOCALE, namespace: 'passphraseGenerator.page' });
}

export async function generateMetadata({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });

  const baseUrl = getBaseUrl();
  const canonical =
    locale === DEFAULT_LOCALE ? `${baseUrl}/${ROUTE_SLUG}/` : `${baseUrl}/${locale}/${ROUTE_SLUG}/`;
  const title = t('passphraseGenerator.page.metaTitle');
  const description = t('passphraseGenerator.page.metaDescription');
  const tEn = await getEnglishPageTranslations();
  const ogImageUrl = `${baseUrl}${getOgImagePathForSlug(ROUTE_SLUG, { title: tEn('title'), pageType: 'page' })}`;

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

export default async function PassphraseGeneratorPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  try {
    const { generateOgImageForRoute } = await import('@/lib/og-image');
    const tEn = await getEnglishPageTranslations();
    await generateOgImageForRoute({
      title: tEn('title'),
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
            {t('passphraseGenerator.page.title')}
          </h1>
          <p className="mx-auto max-w-xl text-pretty text-base text-muted-foreground sm:text-lg">
            {t('passphraseGenerator.page.intro')}
          </p>
        </header>

        {/* Links to the generator from content use /passphrase/#generator, so a
            reader who is already on this page gets scrolled back up to it */}
        <PassphraseGenerator anchorId="generator" />

        {/* role="note": the Alert component defaults to role="alert", which is
            for messages that need announcing right away */}
        <Alert variant="info" role="note">
          {t.rich('passphraseGenerator.page.whenToUse', {
            b: (chunks) => <strong>{chunks}</strong>,
          })}
        </Alert>

        {item && (
          <PinnedChecklistItem
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
