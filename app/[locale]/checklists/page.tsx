// @ts-nocheck
import { setRequestLocale, getTranslations } from 'next-intl/server';
import Layout from '@/components/layout/Layout';
import PageNotices from '@/components/layout/PageNotices';
import Link from '@/components/Link';
import ChecklistSectionList from '@/components/ChecklistSectionList';
import { getAllGuides } from '@/lib/content';
import { isOlderThanMonths } from '@/lib/checklist-sections';
import { getSectionReadMinutes } from '@/lib/section-reads';
import { NAV_ITEMS } from '@/config/navigation';

/** A guide not reviewed in this long shows its review date on the index. */
const STALE_AFTER_MONTHS = 12;

export async function generateMetadata({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });
  return {
    title: t('checklists.documentTitle'),
  };
}

export default async function ChecklistsPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  const staleReviewDates = {};
  for (const guide of getAllGuides(locale)) {
    const { lastUpdated } = guide.frontmatter;
    const date = lastUpdated instanceof Date ? lastUpdated.toISOString().slice(0, 10) : lastUpdated;
    if (isOlderThanMonths(date, STALE_AFTER_MONTHS)) {
      staleReviewDates[guide.frontmatter.slug || guide.slug] = date;
    }
  }

  return (
    <Layout searchable={false} sidebarType={null} fullWidthMain={true}>
      <h1 className="page-title">{t('checklists.title')}</h1>
      <p className="text-lg text-muted-foreground mb-10 max-w-2xl">
        {t.rich('checklists.intro', {
          link: (chunks) => (
            <Link href={NAV_ITEMS.ESSENTIALS.href} className="link">
              {chunks}
            </Link>
          ),
        })}
      </p>

      <PageNotices />

      <ChecklistSectionList
        staleReviewDates={staleReviewDates}
        readMinutes={getSectionReadMinutes(locale)}
      />
    </Layout>
  );
}
