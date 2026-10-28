// @ts-nocheck
'use client';
import React, { useState, useEffect } from 'react';
import { NextIntlClientProvider, useTranslations } from 'next-intl';
import { ThemeProvider } from '@/components/layout/ThemeProvider';
import Link from '@/components/Link';
import {
  FaGhost,
  FaArrowLeft,
  FaBullhorn,
  FaEye,
  FaShieldHalved,
  FaPeopleGroup,
  FaFingerprint,
  FaHandFist,
  FaFire,
  FaCampground,
  FaWater,
} from 'react-icons/fa6';
import { Sparkles } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { NAV_ITEMS } from '@/config/navigation';
import { useAnalytics } from '@/hooks/use-analytics';
import { cleanedPathCandidates } from '@/lib/not-found-path';

const VARIATIONS = [
  { icon: FaGhost, key: 'goneUnderground' },
  { icon: FaEye, key: 'nothingToSee' },
  { icon: FaPeopleGroup, key: 'solidarity' },
  { icon: FaShieldHalved, key: 'securityCulture' },
  { icon: FaBullhorn, key: 'whoseStreets' },
  { icon: FaFingerprint, key: 'identity' },
  { icon: FaHandFist, key: 'directAction' },
  { icon: FaFire, key: 'firedUp' },
  { icon: FaCampground, key: 'mutualAid' },
  { icon: FaWater, key: 'beWater' },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** First same-origin path that answers 2xx, or null. Candidates come from cleanedPathCandidates. */
async function firstExistingPath(candidates) {
  for (const candidate of candidates) {
    try {
      const res = await fetch(candidate, { method: 'HEAD' });
      if (res.ok) return candidate;
    } catch {
      return null;
    }
  }
  return null;
}

export function NotFoundInner() {
  const t = useTranslations();
  const { trackEvent } = useAnalytics();
  const [variationIndex, setVariationIndex] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setVariationIndex(Math.floor(Math.random() * VARIATIONS.length));
  }, []);

  useEffect(() => {
    const path = window.location.pathname + window.location.search;
    const tracked = trackEvent({
      name: '404_not_found',
      data: { path, referrer: document.referrer || '(none)' },
    }).catch(() => {});

    // Pasted links often drag junk along (/ice/)before, /travel%E2%81%A9).
    // If stripping it gives a page that exists, go there instead.
    const candidates = cleanedPathCandidates(window.location.pathname);
    if (!candidates.length) return;
    let cancelled = false;

    (async () => {
      const target = await firstExistingPath(candidates);
      if (!target || cancelled) return;
      const redirected = trackEvent({ name: '404_redirected', data: { path, to: target } }).catch(
        () => {},
      );
      // Give analytics a moment to send, but never hold the visitor up for long.
      await Promise.race([Promise.all([tracked, redirected]), sleep(1000)]);
      if (!cancelled)
        window.location.replace(target + window.location.search + window.location.hash);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const variation = VARIATIONS[variationIndex];
  const Icon = variation.icon;

  const handleNewMessage = () => {
    let newIndex;
    do {
      newIndex = Math.floor(Math.random() * VARIATIONS.length);
    } while (newIndex === variationIndex);
    setVariationIndex(newIndex);
  };

  return (
    <Layout sidebarType={null} searchable={false}>
      <div className="container max-w-2xl mx-auto px-4 py-16 text-center">
        <div
          className={cn(
            'mb-8 p-8 rounded-full w-32 h-32 mx-auto',
            'bg-linear-to-br from-primary/20 via-accent/10 to-primary/20',
            'flex items-center justify-center',
            'group hover:scale-105 transition-transform duration-300',
            'hover:bg-primary/30',
            !mounted && 'invisible',
          )}
        >
          <Icon
            className={cn(
              'w-16 h-16 text-primary',
              'group-hover:text-primary transition-colors duration-300',
            )}
          />
        </div>

        <div className={cn('space-y-2', !mounted && 'invisible')}>
          <h3 className="text-2xl leading-tight font-semibold bg-linear-to-br from-primary via-primary to-primary/70 bg-clip-text text-transparent">
            {t('notFound.title')}
          </h3>
          <h1 className="text-4xl leading-tight font-bold bg-linear-to-br from-primary via-primary to-primary/70 bg-clip-text text-transparent">
            {t(`notFound.variations.${variation.key}.title`)}
          </h1>
        </div>

        <p className={cn('text-xl text-muted-foreground mt-4 mb-8', !mounted && 'invisible')}>
          {t(`notFound.variations.${variation.key}.message`)}
        </p>

        <div className={cn('flex justify-center items-center relative', !mounted && 'invisible')}>
          <Button asChild variant="default" size="lg" className="group">
            <Link href={NAV_ITEMS.HOME.href}>
              <FaArrowLeft className="me-2 transition-transform duration-300 ease-out group-hover:-translate-x-1 rtl:rotate-180 rtl:group-hover:translate-x-1" />
              {t('notFound.backToHome')}
            </Link>
          </Button>

          <Button
            variant="ghost"
            size="xl"
            onClick={handleNewMessage}
            className={cn(
              'opacity-20 hover:opacity-90 transition-opacity duration-300',
              'hover:bg-transparent',
              'group',
              'absolute md:-inset-e-16 -inset-e-8',
            )}
            title="Try your luck?"
          >
            <Sparkles
              className={cn(
                'w-7 h-7 transition-all duration-500',
                'group-hover:rotate-12 group-hover:scale-[2.0]',
                'group-hover:animate-rainbow-shift',
              )}
            />
            <span className="sr-only">{t('notFound.tryAnother')}</span>
          </Button>
        </div>
      </div>
    </Layout>
  );
}

export default function NotFoundContent({ messages }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
        <NotFoundInner />
      </ThemeProvider>
    </NextIntlClientProvider>
  );
}
