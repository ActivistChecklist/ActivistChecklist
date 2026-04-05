// @ts-nocheck
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { getAllNewsItems, toNewsListItem } from '@/lib/content';
import Layout from '@/components/layout/Layout';
import NewsItem from '@/components/NewsItem';
import RSSButton from '@/components/ui/RSSButton';
import Link from '@/components/Link';
import { cn } from "@/lib/utils";

export const metadata = {
  title: 'Surveillance News - Activist Checklist',
  description: 'Latest news about state surveillance and threats facing social movements.',
};

function groupNewsByYear(items) {
  const groups = {};

  items.forEach(item => {
    const itemDate = new Date(item.date || item.first_published_at || item.created_at);
    const year = itemDate.getFullYear();

    if (!groups[year]) {
      groups[year] = [];
    }
    groups[year].push(item);
  });

  return groups;
}

function YearSection({ year, items }) {
  if (!items.length) return null;

  return (
    <section className={cn("pb-12")}>
      <h2 className="text-2xl font-bold pb-4 text-foreground">{year}</h2>
      <div className="space-y-4">
        {items.map((item) => (
          <NewsItem
            key={item.slug}
            entry={item}
          />
        ))}
      </div>
    </section>
  );
}

export default async function NewsPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  const newsItems = getAllNewsItems(locale).map((item) => toNewsListItem(item));
  const grouped = groupNewsByYear(newsItems);
  const sortedYears = Object.keys(grouped)
    .map(year => parseInt(year))
    .sort((a, b) => b - a);

  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        <header className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="page-title">{t('news.title')}</h1>
              <p className="text-lg text-muted-foreground">
                {t('news.description')}
              </p>
            </div>
            <RSSButton
              href="/rss/news.xml"
              variant="outline"
              size="sm"
              className="self-end sm:self-center"
            />
          </div>
        </header>

        {/* News Submission Invitation */}
        <div className="mb-8 p-4 bg-muted rounded-lg border border-primary/40">
          <p className="text-sm text-muted-foreground">
            {t('news.tipInvitation')}{' '}
            <Link
              href="/contact/"
              className="link text-sm"
            >
              {t('news.tipLink')}
            </Link>
            {' '}{t('news.tipSuffix')}
          </p>
        </div>

        {newsItems.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">{t('news.noItems')}</p>
          </div>
        ) : (
          <div className="space-y-0">
            {sortedYears.map(year => (
              <YearSection
                key={year}
                year={year}
                items={grouped[year]}
              />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
