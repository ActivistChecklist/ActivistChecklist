'use client';

import { BookOpen, PartyPopper, Printer } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from '@/components/Link';
import { NavigationMenuLink } from '@/components/ui/navigation-menu';
import { CHECKLIST_SECTIONS, isSubItemActive } from '@/config/navigation';
import { cn } from '@/lib/utils';
import { createIntlTranslator, getTranslatedNavItemFields } from '@/lib/navigation-i18n';

const READ_ICONS = { printable: Printer, howto: PartyPopper };

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
 * the mobile menu. Featured checklists get an icon and full weight; the rest
 * are plain. Explainers follow under a small "Read" list with the same green
 * icon they use on the homepage.
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

  return (
    <div className={cn(isDesktop && 'w-[560px] lg:w-[880px] p-4')}>
      <div className={cn('grid gap-6', isDesktop && 'grid-cols-2 lg:grid-cols-4')}>
        {CHECKLIST_SECTIONS.map((section) => {
          const featuredKeys = new Set(section.featured.map((item) => item.key));
          const howTos = section.featured.filter((item) => item.kind);
          const checklists = [
            ...section.items.filter((item) => featuredKeys.has(item.key)),
            ...section.items.filter((item) => !featuredKeys.has(item.key)),
          ];
          // Two per section keeps the menu scannable; /checklists/ lists them all.
          const reads = [...howTos, ...section.reads].slice(0, 2);
          return (
            <div key={section.key} className={cn(!isDesktop && 'pl-2')}>
              <Wrap>
                <Link
                  href={section.href}
                  className="block mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground hover:text-link"
                >
                  {t(`checklistSections.${section.key}.title`)}
                </Link>
              </Wrap>
              <ul className="space-y-0.5">
                {checklists.map((item) => {
                  const featured = featuredKeys.has(item.key);
                  return (
                    <li key={item.key}>
                      <Wrap>
                        <Link
                          href={item.href}
                          className={cn(
                            'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted hover:text-link focus:bg-muted focus:text-link',
                            featured ? 'font-medium' : 'text-muted-foreground',
                            isSubItemActive(item, pathname) && 'bg-muted text-link',
                          )}
                        >
                          {featured && item.icon && (
                            <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                          )}
                          {titleOf(item)}
                        </Link>
                      </Wrap>
                    </li>
                  );
                })}
              </ul>
              {reads.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {reads.map((item) => {
                    const Icon = READ_ICONS[item.kind] || BookOpen;
                    return (
                      <li key={item.key}>
                        <Wrap>
                          <Link
                            href={item.href}
                            className="flex items-start gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted hover:text-link focus:bg-muted focus:text-link"
                          >
                            <Icon
                              className="mt-0.5 h-4 w-4 shrink-0 text-success"
                              aria-hidden="true"
                            />
                            {titleOf(item)}
                          </Link>
                        </Wrap>
                      </li>
                    );
                  })}
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
