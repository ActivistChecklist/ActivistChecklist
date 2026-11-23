'use client';

import { useTranslations } from 'next-intl';
import Link from '@/components/Link';
import { CHECKLIST_SECTIONS } from '@/config/navigation';
import { createIntlTranslator, getTranslatedNavItemFields } from '@/lib/navigation-i18n';

// The basics are left out: the hero's main button and the first cards on the
// page already cover them. These two sections are the ones that start several
// screens down on a phone, which is where someone who's just been doxxed or
// has agents at the door would otherwise have to scroll to.
const SECTION_KEYS = ['goingOut', 'targeted'];

/**
 * A row of links under the homepage hero, one per checklist, grouped by
 * situation, so every situation is a tap from the top of the page. Printables
 * (the "Police at the door" poster) are listed too, since they're what you
 * reach for in the moment.
 */
export default function HomeSituationLinks() {
  const t = useTranslations();
  const translateText = createIntlTranslator(t);
  const sections = CHECKLIST_SECTIONS.filter((section) => SECTION_KEYS.includes(section.key));

  return (
    <nav aria-label={t('homepage.situationLinksLabel')} className="mb-12 grid gap-6 md:grid-cols-2">
      {sections.map((section) => {
        const items = [
          ...section.items.filter((item) => !item.lowPriority),
          ...section.reads.filter((item) => item.kind === 'printable'),
        ];
        const labelId = `situation-${section.key}`;
        return (
          <div key={section.key}>
            <p
              id={labelId}
              className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground"
            >
              {t(`checklistSections.${section.key}.title`)}
            </p>
            <ul aria-labelledby={labelId} className="flex flex-wrap gap-2">
              {items.map((item) => {
                const { label } = getTranslatedNavItemFields(item.key, item, translateText);
                return (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium transition-colors hover:border-primary/40 hover:text-link"
                    >
                      {item.icon && (
                        <item.icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      )}
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
