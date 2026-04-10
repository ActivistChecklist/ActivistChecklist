'use client';

import { useState, useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LOCALES, DEFAULT_LOCALE } from '@/lib/i18n-config';
import {
  LANGUAGE_BANNER_STORAGE_KEY,
  getDetectedLocaleFromNavigatorLanguage,
  shouldShowLanguageBanner,
} from '@/lib/language-detection';
import { Link, usePathname } from '@/i18n/navigation';

export default function LanguageDetectionBanner() {
  const locale = useLocale();
  const pathname = usePathname();
  const t = useTranslations('languageDetection');
  const [detectedLocale, setDetectedLocale] = useState(null);
  const [dismissed, setDismissed] = useState(true); // default true to prevent flash

  const availableLocales = Object.keys(LOCALES);

  useEffect(() => {
    if (availableLocales.length <= 1) return;
    if (locale !== DEFAULT_LOCALE) return;

    if (localStorage.getItem(LANGUAGE_BANNER_STORAGE_KEY)) return;

    const detected = getDetectedLocaleFromNavigatorLanguage(
      navigator.language,
      DEFAULT_LOCALE,
      availableLocales
    );
    if (detected) {
      setDetectedLocale(detected);
      setDismissed(false);
    }
  }, [locale, availableLocales]);

  const handleDismiss = () => {
    localStorage.setItem(LANGUAGE_BANNER_STORAGE_KEY, 'true');
    setDismissed(true);
  };

  if (
    !shouldShowLanguageBanner({
      currentLocale: locale,
      defaultLocale: DEFAULT_LOCALE,
      dismissed,
      detectedLocale,
    })
  ) {
    return null;
  }

  const languageName = LOCALES[detectedLocale]?.name || detectedLocale;

  return (
    <div className="bg-blue-50 dark:bg-blue-950 border-b border-blue-200 dark:border-blue-800 px-4 py-3">
      <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
        <p className="text-sm text-blue-800 dark:text-blue-200">
          {t('message', { language: languageName })}
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <Button asChild variant="outline" size="sm">
            <Link href={pathname === '' ? '/' : pathname} locale={detectedLocale}>
              {t('switchButton', { language: languageName })}
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleDismiss}
            aria-label={t('dismiss')}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
