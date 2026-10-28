'use client';

import { useTranslations } from 'next-intl';
import Link from '@/components/Link';
import { NavigationMenuLink } from '@/components/ui/navigation-menu';
import { CHECKLIST_SECTIONS, isSubItemActive } from '@/config/navigation';
import { READ_KIND_ICONS } from '@/config/icons';
import { cn } from '@/lib/utils';
import { createIntlTranslator, getTranslatedNavItemFields } from '@/lib/navigation-i18n';

// Radix needs NavigationMenuLink around desktop links so the dropdown closes on
// navigation; the mobile sheet uses plain links.
function DesktopLink({ children }) {
  return <NavigationMenuLink asChild>{children}</NavigationMenuLink>;
}

function PlainLink({ children }) {
  return children;
}

/**
 * Every checklist, grouped by section, for the desktop Checklists dropdown and
 * the mobile menu. Built for scanning: every row has the same icon slot, so
 * all text starts on one edge, and every row has the same weight and color.
 * Order carries the emphasis (featured first), and explainers are told apart
 * only by their green icon, after a hairline.
 *
 * @param {'desktop' | 'mobile'} variant
 */
export default function ChecklistsMenu({ variant = 'desktop', pathname, footerLink }) {
  const t = useTranslations();
  const translateText = createIntlTranslator(t);
  const isDesktop = variant === 'desktop';
  const Wrap = isDesktop ? DesktopLink : PlainLink;

  const titleOf = (item) => {
    const fields = getTranslatedNavItemFields(item.key, item, translateText);
    return item.kind ? fields.label || fields.title : fields.title;
  };

  const row = (item, Icon, iconClassName) => (
    <li key={item.key}>
      <Wrap>
        <Link
          href={item.href}
          className={cn(
            'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm font-medium transition-colors hover:bg-muted hover:text-link focus:bg-muted focus:text-link',
            isDesktop && 'whitespace-nowrap',
            isSubItemActive(item, pathname) && 'bg-muted text-link',
          )}
        >
          {Icon && <Icon className={cn('h-4 w-4 shrink-0', iconClassName)} aria-hidden="true" />}
          {titleOf(item)}
        </Link>
      </Wrap>
    </li>
  );

  return (
    <div className={cn(isDesktop && 'w-[620px] p-4')}>
      <div className={cn('grid gap-x-6 gap-y-6', isDesktop && 'grid-cols-2')}>
        {CHECKLIST_SECTIONS.map((section) => {
          const featuredKeys = new Set(section.featured.map((item) => item.key));
          // A featured how-to (the security party) sits with the featured checklists.
          const checklists = [
            ...section.items.filter((item) => featuredKeys.has(item.key)),
            ...section.featured.filter((item) => item.kind),
            ...section.items.filter((item) => !featuredKeys.has(item.key)),
          ];
          // Two per section keeps the menu scannable; /checklists/ lists them all.
          const reads = section.reads.slice(0, 2);
          return (
            <div key={section.key}>
              <Wrap>
                <Link
                  href={section.href}
                  className="block px-2 mb-1 text-sm font-semibold uppercase tracking-wider text-muted-foreground hover:text-link"
                >
                  {t(`checklistSections.${section.key}.title`)}
                </Link>
              </Wrap>
              <ul>{checklists.map((item) => row(item, item.icon, 'text-primary'))}</ul>
              {reads.length > 0 && (
                <ul className="mt-2 border-t border-border pt-2">
                  {reads.map((item) =>
                    row(
                      item,
                      READ_KIND_ICONS[item.kind] || READ_KIND_ICONS.explainer,
                      'text-success',
                    ),
                  )}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      {footerLink && (
        <Wrap>
          <Link
            href={footerLink.href}
            className={cn(
              'mt-4 flex items-center justify-center gap-2 rounded-md p-2 text-sm font-medium transition-colors hover:bg-muted hover:text-link',
              isDesktop ? 'bg-muted' : 'justify-start text-muted-foreground',
              footerLink.className,
            )}
          >
            {footerLink.title}
            {footerLink.icon && <footerLink.icon className={footerLink.iconClassName} />}
          </Link>
        </Wrap>
      )}
    </div>
  );
}
