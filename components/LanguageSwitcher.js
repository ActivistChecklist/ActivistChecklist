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

export default function LanguageSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations();

  const availableLocales = Object.keys(LOCALES);
  if (availableLocales.length <= 1) return null;

  /**
   * Must use next-intl's router.replace(..., { locale }) so NEXT_LOCALE is updated
   * before navigation. Raw push() to unprefixed / URLs leaves the cookie on Spanish
   * with localePrefix: 'as-needed' (see next-intl navigation docs).
   */
  const switchLocale = (newLocale) => {
    const path = pathname === '' ? '/' : pathname;
    router.replace(path, { locale: newLocale });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9 hover:bg-muted" aria-label={t('languageSwitcher.ariaLabel')}>
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
