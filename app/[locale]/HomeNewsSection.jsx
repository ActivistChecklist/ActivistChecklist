import { getAllNewsItems, toNewsListItem } from '@/lib/content';
import NewsBlock from '@/components/NewsBlock';
import { HOMEPAGE_NEWS_LIMIT } from '@/config/homepage';

/**
 * Server-only island: loads MDX news here so data does not pass through the
 * HomePageContent client boundary (which was dropping the serialized array).
 */
export default async function HomeNewsSection({ locale }) {
  const newsItems = getAllNewsItems(locale).map(toNewsListItem).slice(0, HOMEPAGE_NEWS_LIMIT);

  return <NewsBlock newsItems={newsItems} />;
}
