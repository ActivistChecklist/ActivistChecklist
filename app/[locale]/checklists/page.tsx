// @ts-nocheck
import { setRequestLocale, getTranslations } from 'next-intl/server';
import Layout from '@/components/layout/Layout';
import { getAllGuides } from '@/lib/content';
import { guideToCardCopy } from '@/lib/guide-card-copy';
import { SECURITY_CHECKLISTS, NAV_ITEMS } from '@/config/navigation';
import GuideCard from '@/components/GuideCard';

export async function generateMetadata({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });
  return {
    title: t('checklists.documentTitle'),
  };
}

// Build a map from slug to nav item for easy lookup
function buildSlugToNavItem() {
  const map = {};
  Object.values(NAV_ITEMS).forEach(item => {
    if (item.href && item.icon) {
      // Extract slug from href (e.g., "/security-essentials" -> "security-essentials")
      const slug = item.href.replace(/^\/+|\/+$/g, '');
      map[slug] = item;
    }
  });
  return map;
}

// Get the top 8 slugs for categorization
const TOP_8_SLUGS = SECURITY_CHECKLISTS.items.map(item => item.href.replace(/^\/+|\/+$/g, ''));

export default async function ChecklistsPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  const allGuides = getAllGuides(locale);
  const slugToGuide = new Map(
    allGuides.map((g) => [g.frontmatter.slug || g.slug, g])
  );

  const SLUG_TO_NAV_ITEM = buildSlugToNavItem();

  // Separate guides into top 8 and others (slugs from content, not only nav)
  const otherGuides = allGuides.filter((guide) => {
    const slug = guide.frontmatter.slug || guide.slug;
    return !TOP_8_SLUGS.includes(slug);
  });

  // Titles and blurbs from MDX frontmatter; href/iconKey from nav when present
  const otherGuideItems = otherGuides
    .map((guide) => {
      const slug = guide.frontmatter.slug || guide.slug;
      const navItem = SLUG_TO_NAV_ITEM[slug];
      if (!navItem) return null;
      const copy = guideToCardCopy(guide);
      return {
        href: navItem.href,
        iconKey: navItem.key,
        title: copy.title,
        description: copy.description,
        copyFromContent: true,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.title.localeCompare(b.title));

  return (
    <Layout searchable={false} sidebarType={null} fullWidthMain={true}>
      <div className="">
        <h1 className="page-title">
          {t('checklists.title')}
        </h1>

        {/* Top 8 Checklists */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold mb-4 text-muted-foreground">{t('checklists.featured')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {SECURITY_CHECKLISTS.items.map((guideItem, index) => {
              const slug = guideItem.href.replace(/^\/+|\/+$/g, '');
              const guide = slugToGuide.get(slug);
              const copy = guide ? guideToCardCopy(guide) : {
                title: guideItem.title,
                description: guideItem.description,
              };
              return (
                <GuideCard
                  key={index}
                  guideItem={{
                    href: guideItem.href,
                    iconKey: guideItem.key,
                    title: copy.title,
                    description: copy.description,
                    copyFromContent: !!guide,
                  }}
                  size="large"
                />
              );
            })}
          </div>
        </section>

        {/* Other Checklists */}
        {otherGuideItems.length > 0 && (
          <section>
            <h2 className="text-xl font-semibold mb-4 text-muted-foreground">{t('checklists.more')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {otherGuideItems.map((guideItem, index) => (
                <GuideCard key={index} guideItem={guideItem} size="large" />
              ))}
            </div>
          </section>
        )}
      </div>
    </Layout>
  );
}
