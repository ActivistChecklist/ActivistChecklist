// @ts-nocheck
import { setRequestLocale, getTranslations } from 'next-intl/server';
import Layout from '@/components/layout/Layout';
import { getAllGuides } from '@/lib/content';
import { SECURITY_CHECKLISTS, NAV_ITEMS } from '@/config/navigation';
import GuideCard from '@/components/GuideCard';

export const metadata = {
  title: 'Checklists | Activist Checklist',
};

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
  const guides = allGuides.map((guide) => ({
    slug: guide.frontmatter.slug || guide.slug,
    content: { slug: guide.frontmatter.slug || guide.slug },
  }));

  const SLUG_TO_NAV_ITEM = buildSlugToNavItem();

  // Separate guides into top 8 and others
  const otherGuides = guides.filter(guide => !TOP_8_SLUGS.includes(guide.slug));

  // Convert other guides to GuideCard format using nav item data
  const otherGuideItems = otherGuides
    .map(guide => {
      const navItem = SLUG_TO_NAV_ITEM[guide.slug];
      if (navItem) {
        return {
          href: navItem.href,
          iconKey: navItem.key,
          title: navItem.title,
          description: navItem.description,
        };
      }
      return null;
    })
    .filter(Boolean)
    // Sort alphabetically by title
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
            {SECURITY_CHECKLISTS.items.map((guideItem, index) => (
              <GuideCard key={index} guideItem={{ href: guideItem.href, iconKey: guideItem.key, title: guideItem.title, description: guideItem.description }} size="large" />
            ))}
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
