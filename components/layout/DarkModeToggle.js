'use client';

import * as React from 'react';
import { Moon, Sun, Laptop } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTranslations } from 'next-intl';

export function DarkModeToggle({ className } = {}) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  const t = useTranslations();
  const THEMES = [
    { value: 'light', label: t('themeSwitcher.light'), Icon: Sun },
    { value: 'dark', label: t('themeSwitcher.dark'), Icon: Moon },
    { value: 'system', label: t('themeSwitcher.system'), Icon: Laptop },
  ];

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className={className}
        aria-label={t('themeSwitcher.placeholderAriaLabel')}
        disabled
      >
        <Sun className="h-[1.2rem] w-[1.2rem]" aria-hidden="true" />
      </Button>
    );
  }

  const CurrentIcon = resolvedTheme === 'dark' ? Moon : Sun;
  const currentThemeLabel = THEMES.find(({ value }) => value === theme)?.label ?? theme;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={className}
          aria-label={t('themeSwitcher.ariaLabel', { theme: currentThemeLabel })}
          title={t('themeSwitcher.title')}
        >
          <CurrentIcon className="h-[1.2rem] w-[1.2rem]" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {THEMES.map(({ value, label, Icon }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => setTheme(value)}
            className="flex items-center gap-2 cursor-pointer"
            aria-current={theme === value ? 'true' : undefined}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span>{label}</span>
            {theme === value && (
              <span className="ml-auto text-xs text-muted-foreground">
                {t('themeSwitcher.active')}
              </span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
