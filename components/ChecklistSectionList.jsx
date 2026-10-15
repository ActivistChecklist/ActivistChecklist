'use client';

import { BookOpen, PartyPopper, Printer } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import Link from '@/components/Link';
import { CHECKLIST_SECTIONS } from '@/config/navigation';
import { LOCALES } from '@/lib/i18n-config';
import { createIntlTranslator, getTranslatedNavItemFields } from '@/lib/navigation-i18n';
import { cn, formatContentDate } from '@/lib/utils';

const KIND_ICONS = { explainer: BookOpen, printable: Printer, howto: PartyPopper };
const KIND_LABELS = {
  explainer: 'checklistSections.explainer',
  printable: 'checklistSections.printable',
  howto: 'checklistSections.howTo',
};

/**
 * The full /checklists/ index: every checklist, explainer, how-to, and
 * printable, grouped by section. A list rather than cards, because people use
 * this page to scan and compare (mostly on laptops), not to be sold on one.
 *
 * @param {Record<string, string>} staleReviewDates - guide key -> YYYY-MM-DD, only for
 *   guides overdue for review. Worked out on the server so the client never
 *   disagrees with the static HTML about which side of the cutoff "now" is.
 * @param {Record<string, number>} readMinutes - from getSectionReadMinutes
 */
export default function ChecklistSectionList({ staleReviewDates = {}, readMinutes = {} }) {
  const t = useTranslations();
  const translateText = createIntlTranslator(t);
  const dateLocale = LOCALES[useLocale()]?.intlLocale || 'en-US';

  return (
    <div className="space-y-12">
      {CHECKLIST_SECTIONS.map((section) => {
        const featuredKeys = new Set(section.featured.map((item) => item.key));
        const rows = [
          ...section.items.filter((item) => featuredKeys.has(item.key)),
          ...section.items.filter((item) => !featuredKeys.has(item.key)),
          ...section.featured.filter((item) => item.kind),
          ...section.reads,
        ];
        return (
          <section key={section.key} id={section.key} className="scroll-mt-20">
            <h2 className="text-2xl font-bold mb-1">
              {t(`checklistSections.${section.key}.heading`)}
            </h2>
            <p className="text-muted-foreground mb-4">
              {t(`checklistSections.${section.key}.scope`)}
            </p>
            <ul className="divide-y divide-border border-y border-border">
              {rows.map((item) => {
                const fields = getTranslatedNavItemFields(item.key, item, translateText);
                const isChecklist = !item.kind;
                const Icon = isChecklist ? item.icon : KIND_ICONS[item.kind];
                const staleDate = staleReviewDates[item.key];
                const meta = isChecklist
                  ? staleDate &&
                    t('checklistSections.lastReviewed', {
                      date: formatContentDate(staleDate, dateLocale, {
                        year: 'numeric',
                        month: 'short',
                      }),
                    })
                  : [
                      t(KIND_LABELS[item.kind]),
                      readMinutes[item.key] &&
                        t('checklistSections.readMinutes', { minutes: readMinutes[item.key] }),
                    ]
                      .filter(Boolean)
                      .join(' · ');
                return (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      className="group grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-4 gap-y-1 py-4 sm:grid-cols-[1.25rem_minmax(0,1fr)_auto]"
                    >
                      {Icon && (
                        <Icon
                          className={cn(
                            'mt-1 h-5 w-5',
                            isChecklist ? 'text-primary' : 'text-success',
                            isChecklist && !featuredKeys.has(item.key) && 'text-muted-foreground',
                          )}
                          aria-hidden="true"
                        />
                      )}
                      <div className="col-start-2">
                        <div className="text-lg font-semibold group-hover:text-link">
                          {isChecklist ? fields.title : fields.label || fields.title}
                        </div>
                        {fields.description && (
                          <p className="text-muted-foreground">{fields.description}</p>
                        )}
                      </div>
                      {meta && (
                        <div className="col-start-2 text-sm text-muted-foreground sm:col-start-3 sm:pt-1 sm:text-right">
                          {meta}
                        </div>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
