// @ts-nocheck
import Link from '@/components/Link';
import { unstable_noStore as noStore } from 'next/cache';
import { draftMode } from 'next/headers';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { serialize } from 'next-mdx-remote/serialize';
import Layout from '@/components/layout/Layout';
import Guide from '@/components/guides/Guide';
import ContentPage from '@/components/pages/Page';
import { mdxOptions } from '@/lib/mdx-options';
import {
  getRouteTranslationStatus,
  shouldShowTranslationUnreviewedNotice,
} from '@/lib/crowdin-translation-status';
import {
  getAllGuides,
  getAllPages,
  extractChecklistItems,
  serializeFrontmatter,
} from '@/lib/content';
import {
  resolveChecklistItem,
  resolveGuide,
  resolvePage,
} from '@/lib/content-draft';
import { getBaseUrl } from '@/lib/utils';
import { getOgImagePathForSlug } from '@/lib/og-image';
import { LOCALES, DEFAULT_LOCALE } from '@/lib/i18n-config';

const DEFAULT_DESCRIPTION =
  'Plain language steps for digital security, because protecting yourself helps keep your whole community safer. Built by activists, for activists with field-tested, community-verified guides.';

/** Frontmatter `tocDepth`: 2 = ## in the left TOC, 3 = ## and ###. Default 2. */
function normalizeTocDepth(value) {
  const n = Number(value);
  if (n === 3) return 3;
  return 2;
}

function buildContentNotices({ locale, isFallback, slug, t }) {
  const notices = [];
  if (isFallback) {
    notices.push({
      id: 'lang-fallback',
      type: 'info',
      message: t('translationFallback.message'),
    });
  }
  if (
    !isFallback &&
    slug !== 'contribute' &&
    shouldShowTranslationUnreviewedNotice(slug, locale)
  ) {
    const routeStatus = getRouteTranslationStatus(slug, locale);
    const approvalPercent =
      routeStatus?.approvalPercent != null ? routeStatus.approvalPercent : 0;
    notices.push({
      id: 'translation-unreviewed',
      type: 'warning',
      message: (
        <span className="inline">
          <strong className="font-semibold">{t('pageNotices.translationUnreviewedTitle')}</strong>
          {': '}
          {t.rich('pageNotices.translationUnreviewed', {
            approvalPercent,
            link: (chunks) => (
              <Link href="/contribute/" className="inline">
                {chunks}
              </Link>
            ),
          })}
        </span>
      ),
    });
  }
  return notices;
}

export async function generateStaticParams() {
  // Return slugs for all locales — the parent [locale] layout handles the locale segment
  const allParams = [];
  for (const loc of Object.keys(LOCALES)) {
    const guides = getAllGuides(loc);
    const pages = getAllPages(loc);
    allParams.push(
      ...guides.map((g) => ({ slug: [g.frontmatter.slug || g.slug] })),
      ...pages.map((p) => ({ slug: [p.frontmatter.slug || p.slug] })),
    );
  }
  // Deduplicate by slug
  const seen = new Set();
  return allParams.filter((p) => {
    const key = p.slug.join('/');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function generateMetadata({ params }) {
  const { locale, slug: slugParts } = await params;
  const slug = slugParts?.join('/') || '';
  if ((await draftMode()).isEnabled) {
    noStore();
  }
  const baseUrl = getBaseUrl();

  const guide = await resolveGuide(slug, locale);
  const content = guide || (await resolvePage(slug, locale));
  if (!content) return {};

  const { frontmatter } = content;
  const pageTitle = frontmatter?.title
    ? `${frontmatter.title} | Digital Security Checklists for Activists`
    : 'Digital Security Checklists for Activists';
  const pageDescription =
    frontmatter?.excerpt || frontmatter?.summary || frontmatter?.description || DEFAULT_DESCRIPTION;
  const rawPageImage = frontmatter?.image || frontmatter?.imageOverride;
  const customOgImage = rawPageImage
    ? rawPageImage.startsWith('http://') || rawPageImage.startsWith('https://')
      ? rawPageImage
      : rawPageImage.startsWith('/')
        ? `${baseUrl}${rawPageImage}`
        : `${baseUrl}/${rawPageImage}`
    : undefined;
  const ogImageUrl = customOgImage ?? `${baseUrl}${getOgImagePathForSlug(slug)}`;

  const hrefLangLocales = Object.keys(LOCALES);
  const alternates = {};
  hrefLangLocales.forEach((loc) => {
    alternates[loc] = loc === DEFAULT_LOCALE ? `${baseUrl}/${slug}/` : `${baseUrl}/${loc}/${slug}/`;
  });

  const canonical = locale === DEFAULT_LOCALE ? `${baseUrl}/${slug}/` : `${baseUrl}/${locale}/${slug}/`;

  return {
    title: pageTitle,
    description: pageDescription,
    alternates: {
      canonical,
      languages: alternates,
    },
    openGraph: {
      title: pageTitle,
      description: pageDescription,
      url: canonical,
      type: 'article',
      siteName: 'Activist Checklist',
      images: [ogImageUrl],
    },
    twitter: {
      card: 'summary_large_image',
      title: pageTitle,
      description: pageDescription,
      images: [ogImageUrl],
    },
  };
}

export default async function SlugPage({ params }) {
  const { locale, slug: slugParts } = await params;
  setRequestLocale(locale);
  const slug = slugParts?.join('/') || '';
  if ((await draftMode()).isEnabled) {
    noStore();
  }

  const t = await getTranslations();

  // ── Try guide ──────────────────────────────────────────────
  const guide = await resolveGuide(slug, locale);
  if (guide) {
    const { frontmatter, content, isFallback } = guide;
    const firstSectionIndex = content.indexOf('<Section');
    const introContent =
      firstSectionIndex === -1 ? content : content.slice(0, firstSectionIndex).trim();
    const sectionContent =
      firstSectionIndex === -1 ? '' : content.slice(firstSectionIndex).trim();

    const serializedIntro = introContent ? await serialize(introContent, mdxOptions) : null;
    const serializedBody = sectionContent ? await serialize(sectionContent, mdxOptions) : null;

    // Resolve all referenced checklist items
    const itemSlugs = extractChecklistItems(content);
    const checklistItems = {};
    await Promise.all(
      itemSlugs.map(async (itemSlug) => {
        const item = await resolveChecklistItem(itemSlug, locale);
        if (item) {
          try {
            const serializedItemBody = await serialize(item.content, mdxOptions);
            checklistItems[itemSlug] = {
              frontmatter: serializeFrontmatter(item.frontmatter),
              serializedBody: serializedItemBody,
            };
          } catch (err) {
            console.warn(`Failed to serialize checklist item "${itemSlug}":`, err.message);
          }
        } else {
          console.warn(`Checklist item not found: "${itemSlug}" (referenced in guide "${slug}")`);
        }
      })
    );

    // Generate OG image at build time
    let ogImagePath = null;
    try {
      const { generateOgImageForRoute } = await import('@/lib/og-image');
      ogImagePath = await generateOgImageForRoute({ title: frontmatter.title, pageType: 'guide', slug });
    } catch (err) {
      console.warn(`OG image skipped for guide "${slug}":`, err.message);
    }

    const guideNotices = buildContentNotices({ locale, isFallback, slug, t });

    const guideFm = serializeFrontmatter(frontmatter);

    return (
      <Layout
        sidebarType="toc"
        tocDepth={normalizeTocDepth(guideFm.tocDepth)}
        tocPageTitle={guideFm.title}
      >
        <Guide
          frontmatter={guideFm}
          serializedIntro={serializedIntro}
          serializedBody={serializedBody}
          checklistItems={checklistItems}
          slug={slug}
          locale={locale}
          notices={guideNotices}
        />
      </Layout>
    );
  }

  // ── Try page ───────────────────────────────────────────────
  const page = await resolvePage(slug, locale);
  if (page) {
    const { frontmatter, content, isFallback } = page;

    const serializedBody = await serialize(content, mdxOptions);

    // Generate OG image at build time
    try {
      const { generateOgImageForRoute } = await import('@/lib/og-image');
      await generateOgImageForRoute({ title: frontmatter.title, pageType: 'page', slug });
    } catch (err) {
      console.warn(`OG image skipped for page "${slug}":`, err.message);
    }

    const pageNotices = buildContentNotices({ locale, isFallback, slug, t });

    const fm = serializeFrontmatter(frontmatter);
    const pageSidebarType = fm.showToc === true ? 'toc' : 'navigation';

    return (
      <Layout
        sidebarType={pageSidebarType}
        tocDepth={normalizeTocDepth(fm.tocDepth)}
        tocPageTitle={fm.title}
      >
        <ContentPage
          frontmatter={fm}
          serializedBody={serializedBody}
          locale={locale}
          notices={pageNotices}
        />
      </Layout>
    );
  }

  notFound();
}
