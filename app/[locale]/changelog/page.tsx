// @ts-nocheck
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { getAllChangelogEntries, toChangelogListEntry } from '@/lib/content';
import Layout from '@/components/layout/Layout';
import ChangeLogEntry from '@/components/ChangeLogEntry';
import ChangeLogTimelineMarker from '@/components/ChangeLogTimelineMarker';
import RSSButton from '@/components/ui/RSSButton';
import { cn } from "@/lib/utils";

export const metadata = {
  title: 'Recent Site Updates - Activist Checklist',
  description: 'Complete changelog of updates and improvements to Activist Checklist digital security guides.',
  alternates: {
    types: {
      'application/rss+xml': '/rss/changelog.xml',
    },
  },
};

function groupEntriesByTime(entries) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(now.getDate() - 30);

  const groups = {
    last30Days: [],
    thisYear: [],
    previousYears: {},
  };

  entries.forEach(entry => {
    const entryDate = new Date(entry.first_published_at || entry.created_at);
    const entryYear = entryDate.getFullYear();

    if (entryDate >= thirtyDaysAgo) {
      groups.last30Days.push(entry);
    } else if (entryYear === currentYear) {
      groups.thisYear.push(entry);
    } else {
      if (!groups.previousYears[entryYear]) {
        groups.previousYears[entryYear] = [];
      }
      groups.previousYears[entryYear].push(entry);
    }
  });

  return groups;
}

function TimelineSection({ title, entries, isFirst = false }) {
  if (!entries.length) return null;

  return (
    <section className={cn("mb-12", !isFirst && "border-t pt-8")}>
      <h2 className="text-2xl font-bold mb-6 text-foreground">{title}</h2>
      <div className="relative">
        {entries.map((entry, index) => (
          <div key={entry.slug} id={entry.slug} className="relative">
            <div className="py-3 pl-12 text-sm text-muted-foreground relative">
              <ChangeLogTimelineMarker type={entry.type} />
              {/* Timeline line */}
              {index < entries.length - 1 && (
                <div className="absolute left-6 top-[26px] w-px bg-border h-full -translate-x-1/2"></div>
              )}
              <ChangeLogEntry entry={entry} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default async function ChangelogPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  const changelogEntries = getAllChangelogEntries(locale).map(toChangelogListEntry);
  const grouped = groupEntriesByTime(changelogEntries);
  const sortedYears = Object.keys(grouped.previousYears)
    .map(year => parseInt(year))
    .sort((a, b) => b - a);

  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        <header className="mb-8">
          <h1 className="page-title">{t('changelog.title')}</h1>
          <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <p className="text-lg text-muted-foreground sm:min-w-0 sm:flex-1 sm:pr-4">
              {t('changelog.description')}
            </p>
            <RSSButton
              href="/rss/changelog.xml"
              variant="outline"
              size="sm"
              className="w-fit shrink-0 self-start sm:mt-0.5"
            />
          </div>
        </header>

        {changelogEntries.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">{t('changelog.noEntries')}</p>
          </div>
        ) : (
          <div className="space-y-0">
            <TimelineSection
              title={t('changelog.last30Days')}
              entries={grouped.last30Days}
              isFirst={true}
            />

            <TimelineSection
              title={t('changelog.previousChanges')}
              entries={grouped.thisYear}
            />

            {sortedYears.map(year => (
              <TimelineSection
                key={year}
                title={year.toString()}
                entries={grouped.previousYears[year]}
              />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
