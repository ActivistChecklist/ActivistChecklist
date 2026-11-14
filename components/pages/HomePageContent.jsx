'use client';

import React from 'react';
import { ArrowRight, BadgeCheck, ShieldCheck, Sparkles, Users } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import PageNotices from '@/components/layout/PageNotices';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { NAV_ITEMS } from '@/config/navigation';
import FEATURE_LOGOS from '@/config/featured.json';
import FeatureLogo from '@/components/FeatureLogo';
import ChangeLogRecentEntries from '@/components/ChangeLogRecentEntries';
import HomeChecklistSections from '@/components/HomeChecklistSections';
import HomeSituationLinks from '@/components/HomeSituationLinks';
import HomeToolsSection from '@/components/HomeToolsSection';
import { NewsletterSubscribeForm } from '@/components/NewsletterSubscribe';
import Markdown from '@/components/Markdown';
import { useTranslations } from 'next-intl';
import Link from '@/components/Link';

const TrustPoint = ({ icon: Icon, title, children }) => (
  <div className="flex items-start gap-3 sm:gap-5">
    <div className="shrink-0 rounded-lg bg-primary/10 p-2">
      <Icon className="h-6 w-6 text-primary" aria-hidden="true" />
    </div>
    <div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <div className="mt-1 space-y-2 text-base text-muted-foreground">{children}</div>
    </div>
  </div>
);

const inlineLink = (href) => (chunks) => (
  <Link href={href} className="link">
    {chunks}
  </Link>
);

export default function HomePageContent({
  children,
  changelogEntries = [],
  latestMajorBodyText = null,
  readMinutes = {},
  estimatedTimes = {},
}) {
  const t = useTranslations();

  return (
    // The hero breaks out of the page container with w-dvw, which counts the
    // scrollbar, so it overhangs the page by half a scrollbar on each side where
    // scrollbars take up space. Clip (not hidden) trims that without creating a
    // scroll container, so the sticky header still sticks.
    <div className="overflow-x-clip">
      <Layout sidebarType={null} searchable={false} fullWidthMain={true}>
        <div className="max-w-6xl mx-auto px-4 py-8 -my-6 container">
          {/* Hero Section */}
          <div className="">
            <header
              className={cn(
                'not-prose relative left-1/2 w-dvw max-w-none -translate-x-1/2',
                'relative mb-12 -mt-8 pt-16 pb-32 px-4 overflow-hidden',
                /* Flat brand band, identical in both themes: --brand and
                 --brand-foreground are the two tokens we never flip for dark mode.
                 Every piece of text on it is full brand-foreground rather than a
                 faded one, because white at 85% over this purple drops to 4.1:1
                 and the body copy is under 24px. */
                'bg-brand text-brand-foreground',
              )}
            >
              <div className="relative max-w-4xl mx-auto text-center">
                <h1 className="text-5xl md:text-6xl font-heavy mb-6 text-balance text-brand-foreground">
                  {t('hero.title')}
                </h1>
                <p className="text-xl md:text-2xl mb-10 text-brand-foreground max-w-2xl mx-auto">
                  {t('hero.description')}
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Button
                    asChild
                    variant="default"
                    size="xl"
                    className="group transition-all bg-brand-foreground text-brand hover:bg-brand-foreground/90"
                  >
                    <Link href={NAV_ITEMS.ESSENTIALS.href} className="block group">
                      {t('hero.primaryCta')}
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    size="xl"
                    className="border-2 border-brand-foreground/70 bg-transparent text-brand-foreground hover:bg-brand-foreground/10 shadow-xs"
                  >
                    <Link href={NAV_ITEMS.PARTY.href}>{t('hero.secondaryCta')}</Link>
                  </Button>
                </div>
                {latestMajorBodyText && (
                  <div className="mt-8 mx-auto max-w-3xl px-4 text-brand-foreground [&_a]:text-inherit">
                    <Sparkles className="h-4 w-4 inline mr-1" />
                    <Markdown content={latestMajorBodyText} isProse={false} inlineOnly={true} />
                  </div>
                )}
              </div>
              {/* Mirrored so the hero slants the opposite way to the footer
                  rather than running parallel to it. */}
              <div className="diagonal-edge diagonal-edge-below absolute bottom-0 left-0 scale-x-[-1] bg-background" />
            </header>
          </div>

          <PageNotices />

          <HomeSituationLinks />

          {/* Sites that have shared our guides: kept near the top and compact,
              since it's the quickest thing a new visitor can check us by. */}
          <section className="mb-14">
            <h2 className="mb-4 text-center text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t('featured.sectionTitle')}
            </h2>
            <div className="grid grid-cols-3 items-center gap-x-6 gap-y-4 md:grid-cols-6">
              {FEATURE_LOGOS.map((logo) => (
                <FeatureLogo key={logo.name} logo={logo} />
              ))}
            </div>
          </section>

          <HomeChecklistSections readMinutes={readMinutes} estimatedTimes={estimatedTimes} />

          {/* "I have nothing to hide": a bordered quote rather than a box, so it
              doesn't run together with the boxed section under it. */}
          <section className="mb-16 border-l-4 border-primary pl-5 sm:pl-6">
            <h2 className="mb-3 text-2xl font-bold">{t('misconceptions.nothingToHideTitle')}</h2>
            <p className="max-w-3xl text-lg text-muted-foreground">
              {t('misconceptions.nothingToHideNetworks')}
            </p>
          </section>

          {/* Who built this */}
          <section className="mb-16 rounded-lg bg-linear-to-br from-muted via-muted to-accent/5 p-5 sm:p-6 md:p-8">
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-12">
              <div className="space-y-4">
                <h2 className="text-3xl font-extrabold tracking-tight text-balance">
                  {t('homepage.whoBuiltHeading')}
                </h2>
                <p className="text-lg text-muted-foreground">{t('homepage.whoBuiltDescription')}</p>
                <p className="text-lg text-muted-foreground">{t('homepage.whoBuiltAnonymous')}</p>
                <Link
                  href={NAV_ITEMS.ABOUT.href}
                  className="group inline-flex items-center font-medium text-link"
                >
                  {t('homepage.aboutLink')}
                  <ArrowRight className="ml-1.5 h-4 w-4 transition-transform duration-300 ease-out group-hover:translate-x-1" />
                </Link>
              </div>
              <div className="space-y-6">
                <TrustPoint icon={Users} title={t('trustPoints.whyTitle')}>
                  <p>{t('trustPoints.whyDescription')}</p>
                </TrustPoint>
                <TrustPoint icon={BadgeCheck} title={t('trustPoints.reviewedTitle')}>
                  <p>{t('trustPoints.reviewedDescription')}</p>
                </TrustPoint>
              </div>
            </div>
            <div className="mt-8 border-t border-border pt-8">
              <TrustPoint icon={ShieldCheck} title={t('trustPoints.privacyTitle')}>
                <p>
                  {t.rich('trustPoints.privacyDescription', {
                    privacy: inlineLink(NAV_ITEMS.PRIVACY.href),
                    security: inlineLink(NAV_ITEMS.SECURITY.href),
                  })}
                </p>
              </TrustPoint>
            </div>
          </section>

          {/* Latest News — loaded in server component HomeNewsSection (see app/[locale]/page.tsx) */}
          {children}

          {/* Newsletter */}
          <section className="mb-16 rounded-lg border border-border p-5 sm:p-6 md:p-8">
            <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-2 md:gap-12">
              <div>
                <h2 className="mb-2 text-2xl font-bold">{t('inlineCta.title')}</h2>
                <p className="text-muted-foreground">
                  {t.rich('homepage.newsletterDescription', {
                    link: inlineLink('https://addy.io/'),
                  })}
                </p>
              </div>
              <NewsletterSubscribeForm context="homepage" />
            </div>
          </section>

          {/* Tools */}
          <HomeToolsSection />

          {/* Recent Updates */}
          <section>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">{t('homepage.recentUpdatesHeading')}</h2>
              <Button asChild variant="outline" size="sm">
                <Link href={NAV_ITEMS.CHANGELOG.href} className="group">
                  {t('homepage.viewAllUpdates')}{' '}
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-300 ease-out group-hover:translate-x-1" />
                </Link>
              </Button>
            </div>
            <ChangeLogRecentEntries entries={changelogEntries} />
          </section>
        </div>
      </Layout>
    </div>
  );
}
