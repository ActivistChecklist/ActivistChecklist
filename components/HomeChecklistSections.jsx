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
 * Homepage checklists, grouped by section. The section is a quiet label on the
 * left (heading, one line of scope, a link to everything in it); its featured
 * checklists get the same large cards the homepage has always used, so the
 * guides that carry the traffic keep their weight. Explainers sit underneath
 * as plain links.
 */
export default function HomeChecklistSections({ readMinutes = {}, estimatedTimes = {} }) {
  const t = useTranslations();
  const translateText = createIntlTranslator(t);

  return (
    <section className="mb-16">
      <h2 className="text-2xl font-bold mb-2">{t('homepage.checklistsHeading')}</h2>
      <div className="divide-y divide-border">
        {CHECKLIST_SECTIONS.map((section) => {
          const featuredKeys = new Set(section.featured.map((item) => item.key));
          const rest = section.items.filter((item) => !featuredKeys.has(item.key));
          // Three at most: past that they start to compete with the cards.
          const reads = section.reads.filter((item) => !featuredKeys.has(item.key)).slice(0, 3);
          return (
            <div
              key={section.key}
              className="grid gap-x-8 gap-y-4 py-8 lg:grid-cols-[13rem_minmax(0,1fr)]"
            >
              <div>
                <h3 className="text-xl font-bold mb-2">
                  {t(`checklistSections.${section.key}.heading`)}
                </h3>
                <p className="text-muted-foreground mb-3">
                  {t(`checklistSections.${section.key}.scope`)}
                </p>
                <Link href={section.href} className="link text-sm">
                  {t('checklistSections.allChecklists', { count: section.items.length })}
                </Link>
              </div>
              <div className="space-y-5 min-w-0">
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
                <SectionReadLinks items={reads} readMinutes={readMinutes} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 text-center">
        <Button asChild variant="outline" size="lg">
          <Link href={SECURITY_CHECKLISTS.href} className="group">
            {t('homepage.browseAll')}{' '}
            <ArrowRight className="ml-2 transition-transform duration-300 ease-out group-hover:translate-x-1" />
          </Link>
        </Button>
      </div>
    </section>
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
