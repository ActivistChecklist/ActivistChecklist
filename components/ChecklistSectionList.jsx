'use client';

import { useTranslations } from 'next-intl';
import Link from '@/components/Link';
import { MobileTableOfContents } from '@/components/layout/TableOfContentsSidebar';
import { CHECKLIST_SECTIONS } from '@/config/navigation';
import { READ_KIND_ICONS } from '@/config/icons';
import { createIntlTranslator, getTranslatedNavItemFields } from '@/lib/navigation-i18n';
import { cn } from '@/lib/utils';

const KIND_LABELS = {
  explainer: 'checklistSections.explainer',
  howto: 'checklistSections.howTo',
};

/**
 * The full /checklists/ index: every checklist, explainer, how-to, and
 * printable, grouped by section. A list rather than cards, because people use
 * this page to scan and compare (mostly on laptops), not to be sold on one.
 *
 * @param {Record<string, number>} readMinutes - from getSectionReadMinutes
 */
export default function ChecklistSectionList({ readMinutes = {} }) {
  const t = useTranslations();
  const translateText = createIntlTranslator(t);

  return (
    <div className="space-y-12">
      {/* Phones don't get the sidebar (it starts at md); this is the same
          collapsible "On this page" box guides use. */}
      <MobileTableOfContents />
      {CHECKLIST_SECTIONS.map((section) => {
        const featuredKeys = new Set(section.featured.map((item) => item.key));
        // Same order as the menu: a featured how-to sits with the featured checklists.
        const rows = [
          ...section.items.filter((item) => featuredKeys.has(item.key)),
          ...section.featured.filter((item) => item.kind),
          ...section.items.filter((item) => !featuredKeys.has(item.key)),
          ...section.reads,
        ];
        return (
          <section key={section.key}>
            {/* The id sits on the heading so the "On this page" sidebar links
                to the same anchors the menu and breadcrumbs use. */}
            <h2 id={section.key} className="text-2xl font-bold mb-1">
              {t(`checklistSections.${section.key}.heading`)}
            </h2>
            <p className="text-muted-foreground mb-4">
              {t(`checklistSections.${section.key}.scope`)}
            </p>
            <ul className="divide-y divide-border border-y border-border">
              {rows.map((item) => {
                const fields = getTranslatedNavItemFields(item.key, item, translateText);
                const isChecklist = !item.kind;
                const isHowTo = item.kind === 'howto';
                const Icon = item.icon || READ_KIND_ICONS[item.kind];
                const { description } = fields;
                const meta = isChecklist
                  ? null
                  : [
                      KIND_LABELS[item.kind] && t(KIND_LABELS[item.kind]),
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
                            isChecklist || isHowTo ? 'text-primary' : 'text-success',
                          )}
                          aria-hidden="true"
                        />
                      )}
                      <div className="col-start-2">
                        <div className="text-lg font-semibold group-hover:text-link">
                          {isChecklist ? fields.title : fields.label || fields.title}
                        </div>
                        {description && <p className="text-muted-foreground">{description}</p>}
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
