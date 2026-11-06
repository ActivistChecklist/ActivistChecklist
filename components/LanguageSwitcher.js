'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Globe } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { LOCALES } from '@/lib/i18n-config';
import { usePathname, useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

export default function LanguageSwitcher({ className } = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations();

  const availableLocales = Object.keys(LOCALES);
  if (availableLocales.length <= 1) return null;

  /**
   * next-intl's router.replace(..., { locale }) builds the target URL with the
   * right prefix for that locale (none for English, with localePrefix: 'as-needed').
   */
  const switchLocale = (newLocale) => {
    const path = pathname === '' ? '/' : pathname;
    router.replace(path, { locale: newLocale });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('h-9 w-9 hover:bg-muted', className)}
          aria-label={t('languageSwitcher.ariaLabel')}
        >
          <Globe className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {availableLocales.map((l) => (
          <DropdownMenuItem
            key={l}
            onClick={() => switchLocale(l)}
            className={l === locale ? 'font-bold' : ''}
          >
            {LOCALES[l]?.name || l}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
