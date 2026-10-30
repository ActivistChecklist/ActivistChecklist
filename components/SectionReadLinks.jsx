'use client';

import { useTranslations } from 'next-intl';
import Link from '@/components/Link';
import { cn } from '@/lib/utils';
import { READ_KIND_ICONS } from '@/config/icons';
import { createIntlTranslator, getTranslatedNavItemFields } from '@/lib/navigation-i18n';

/**
 * Explainers and printables listed under a group of checklists. Deliberately
 * quieter than a card: a small green icon, an underlined title in the body
 * color, and a muted read time, so they sit below the checklists instead of
 * competing with them.
 *
 * @param {object[]} items - resolved navigation items (see CHECKLIST_SECTIONS)
 * @param {Record<string, number>} readMinutes - from getSectionReadMinutes
 * @param {string} [label] - optional lead-in, e.g. "Understand why"
 */
export default function SectionReadLinks({ items, readMinutes = {}, label, className }) {
  const t = useTranslations();
  const translateText = createIntlTranslator(t);

  if (!items?.length) return null;

  return (
    <ul className={cn('flex flex-wrap items-baseline gap-x-6 gap-y-2', className)}>
      {label && <li className="font-semibold">{label}</li>}
      {items.map((item) => {
        const { label: title } = getTranslatedNavItemFields(item.key, item, translateText);
        const Icon = READ_KIND_ICONS[item.kind] || READ_KIND_ICONS.explainer;
        const minutes = readMinutes[item.key];
        // Only reading material gets a label. A printable or tool says what it
        // is through its icon and title ("Printable flyer").
        const meta =
          (item.kind === 'explainer' || item.kind === 'howto') && minutes
            ? t('checklistSections.readMinutes', { minutes })
            : null;
        return (
          <li key={item.key}>
            <Link href={item.href} className="group inline-flex items-baseline gap-2">
              <Icon className="h-4 w-4 shrink-0 self-center text-success" aria-hidden="true" />
              <span className="font-medium underline underline-offset-4 decoration-1 decoration-muted-foreground/50 transition-colors group-hover:decoration-2 group-hover:text-link">
                {title || item.label}
              </span>
              {meta && <span className="text-sm text-muted-foreground">{meta}</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
