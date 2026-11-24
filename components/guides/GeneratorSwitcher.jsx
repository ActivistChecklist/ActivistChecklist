import { getTranslations } from 'next-intl/server';
import { Laptop, Smartphone } from 'lucide-react';
import Link from '@/components/Link';
import { cn } from '@/lib/utils';

const GENERATORS = [
  { key: 'passcode', href: '/passcode/', Icon: Smartphone },
  { key: 'passphrase', href: '/passphrase/', Icon: Laptop },
];

/**
 * Pill-shaped switch at the top of /passcode/ and /passphrase/, for readers
 * who land on the one they don't need. The two are separate pages with their
 * own titles and search results, so each pill is a link to the other page,
 * not a tab. Labeled by device so it makes sense to readers who don't know
 * the word "passphrase".
 */
export default async function GeneratorSwitcher({ current }) {
  const t = await getTranslations();

  return (
    <nav
      aria-label={t('generatorSwitcher.ariaLabel')}
      className="flex justify-center pb-3 print:hidden"
    >
      <ul className="inline-flex gap-1 rounded-full border border-border bg-muted p-1">
        {GENERATORS.map(({ key, href, Icon }) => {
          const isCurrent = key === current;
          return (
            <li key={key}>
              <Link
                href={href}
                aria-current={isCurrent ? 'page' : undefined}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isCurrent
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {t(`generatorSwitcher.${key}`)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
