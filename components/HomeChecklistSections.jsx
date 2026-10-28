'use client';

import { ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from '@/components/Link';
import GuideCard from '@/components/GuideCard';
import SectionReadLinks from '@/components/SectionReadLinks';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CHECKLIST_SECTIONS, SECURITY_CHECKLISTS } from '@/config/navigation';
import { createIntlTranslator, getTranslatedNavItemFields } from '@/lib/navigation-i18n';

/**
 * Homepage checklists, grouped by section. The section heading sits in a left
 * column, set like the site's h1 (extrabold, tight) a size down, so it reads
 * as a heading and not as one more card: no description, just a quiet link to
 * everything in the section. Its featured checklists get the same large cards
 * the homepage has always used, and explainers sit underneath as plain links.
 */
export default function HomeChecklistSections({ readMinutes = {}, estimatedTimes = {} }) {
  const t = useTranslations();
  const translateText = createIntlTranslator(t);

  return (
    <>
      <div className="divide-y divide-border">
        {CHECKLIST_SECTIONS.map((section) => {
          const featuredKeys = new Set(section.featured.map((item) => item.key));
          const rest = section.items.filter((item) => !featuredKeys.has(item.key));
          // Three at most: past that they start to compete with the cards.
          const reads = section.reads.filter((item) => !featuredKeys.has(item.key)).slice(0, 3);
          return (
            <section
              key={section.key}
              className="grid gap-x-8 gap-y-5 py-10 first:pt-0 lg:grid-cols-[14rem_minmax(0,1fr)]"
            >
              <div>
                <h2 className="text-3xl font-extrabold tracking-tight text-balance">
                  {t(`checklistSections.${section.key}.heading`)}
                </h2>
                <Link
                  href={section.href}
                  className="group mt-3 inline-flex items-center text-sm font-medium text-muted-foreground transition-colors hover:text-link"
                >
                  {t('checklistSections.allChecklists', { count: section.items.length })}
                  <ArrowRight className="ms-1.5 h-4 w-4 transition-transform duration-300 ease-out group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1" />
                </Link>
              </div>
              <div className="min-w-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {section.featured.map((item) => (
                    <GuideCard
                      key={item.key}
                      guideItem={toCardItem(item, t, estimatedTimes, readMinutes)}
                      size="large"
                    />
                  ))}
                  {/* An odd number of cards would leave a gap; the section's
                  smaller checklists fill it instead. */}
                  {section.featured.length % 2 === 1 && rest.length > 0 && (
                    <Card className="h-full p-2">
                      <ul>
                        {rest.map((item) => {
                          const { title } = getTranslatedNavItemFields(
                            item.key,
                            item,
                            translateText,
                          );
                          return (
                            <li key={item.key}>
                              <Link
                                href={item.href}
                                className="group flex items-center gap-3 rounded-md p-3 transition-colors hover:bg-muted"
                              >
                                <item.icon
                                  className="h-5 w-5 shrink-0 text-primary"
                                  aria-hidden="true"
                                />
                                <span className="font-semibold group-hover:text-link">{title}</span>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </Card>
                  )}
                </div>
                <SectionReadLinks items={reads} readMinutes={readMinutes} className="mt-5" />
              </div>
            </section>
          );
        })}
      </div>
      <div className="mt-6 mb-16 text-center">
        <Button asChild variant="outline" size="lg">
          <Link href={SECURITY_CHECKLISTS.href} className="group">
            {t('homepage.browseAll')}{' '}
            <ArrowRight className="ms-2 transition-transform duration-300 ease-out group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1" />
          </Link>
        </Button>
      </div>
    </>
  );
}

/**
 * Adds the time each card shows: the guide's own estimate, or reading time for
 * a featured how-to, which also gets its own description and button text.
 */
function toCardItem(item, t, estimatedTimes, readMinutes) {
  if (item.kind !== 'howto') return { ...item, duration: estimatedTimes[item.key] };
  const minutes = readMinutes[item.key];
  return {
    ...item,
    duration: minutes ? t('checklistSections.readMinutes', { minutes }) : undefined,
    description: t(`checklistSections.descriptions.${item.key}`),
    ctaLabel: t('checklistSections.readGuide'),
  };
}
