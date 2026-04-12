'use client';

import React from 'react';
import { Shield, Users, ArrowRight, Sparkles } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import { Card, CardHeader, CardFooter, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn, getBaseUrl } from '@/lib/utils';
import { NAV_ITEMS, SECURITY_CHECKLISTS } from '@/config/navigation';
import ChangeLogRecentEntries from '@/components/ChangeLogRecentEntries';
import GuideCard from '@/components/GuideCard';
import Markdown from '@/components/Markdown';
import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';
import Link from '@/components/Link';
import { LOCALES, DEFAULT_LOCALE } from '@/lib/i18n-config';

const ACTION_GUIDES = SECURITY_CHECKLISTS.items.slice(0, 8);

const TrustPoint = ({ icon: Icon, title, description }) => (
  <Card className="bg-transparent border-0 shadow-none transition-all duration-300">
    <CardHeader className="flex flex-row items-start gap-3 sm:gap-6 space-y-0 p-3 sm:p-6">
      <div className="p-2 rounded-lg bg-primary/10">
        <Icon className="h-6 w-6 text-primary shrink-0" />
      </div>
      <div>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription className="text-base">{description}</CardDescription>
      </div>
    </CardHeader>
  </Card>
);

const ConcernCard = ({ title, description }) => (
  <Card className="bg-muted border-0">
    <CardHeader>
      <CardTitle className="text-lg font-semibold text-foreground">{title}</CardTitle>
      <p className="text-base text-muted-foreground">{description}</p>
    </CardHeader>
  </Card>
);

export default function HomePageContent({ children, changelogEntries = [], latestMajorBodyText = null, locale = 'en' }) {
  const t = useTranslations();
  const currentLocale = useLocale() || locale;
  const baseUrl = getBaseUrl();
  const hrefLangLocales = Object.keys(LOCALES);
  const isDefault = currentLocale === DEFAULT_LOCALE;

  return (
    <div>
      <Layout sidebarType={null} searchable={false} fullWidthMain={true}>
        <div className="max-w-6xl mx-auto px-4 py-8 -my-6 container">
          {/* Hero Section */}
          <div className="">
            <header className={cn(
              "not-prose relative left-1/2 w-dvw max-w-none -translate-x-1/2",
              "relative mb-16 -mt-8 pt-16 pb-32 px-4 overflow-hidden",
              /* v4: use bg-radial / bg-linear-to-* so from/via/to populate --tw-gradient-stops */
              "bg-radial-[ellipse_at_top] from-primary/20 via-background to-background",
              "before:content-[''] before:fixed before:inset-0 before:bg-linear-to-r before:from-primary/10 before:via-accent/5 before:to-primary/10 before:opacity-70 before:pointer-events-none"
            )}>
              <div className="absolute inset-0 bg-linear-to-r from-primary/10 via-accent/5 to-primary/10 opacity-70" />
              <div className="relative max-w-4xl mx-auto text-center">
                <h1 className="text-5xl md:text-6xl font-heavy mb-6 bg-linear-to-br from-primary via-primary to-primary/70 bg-clip-text text-transparent text-balance">
                  {t('hero.title')}
                </h1>
                <p className="text-xl md:text-2xl mb-10 text-muted-foreground max-w-2xl mx-auto">
                  {t('hero.description')}
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Button asChild variant="default" size="xl" className="group bg-linear-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary transition-all">
                    <Link href={NAV_ITEMS.ESSENTIALS.href} className="block group">
                      {t('hero.primaryCta')}
                      <ArrowRight className="ml-2 transition-transform duration-300 ease-out group-hover:translate-x-1" />
                    </Link>
                  </Button>
                  <Button asChild variant="muted" size="xl">
                    <Link href={SECURITY_CHECKLISTS.href}>{t('hero.secondaryCta')}</Link>
                  </Button>
                </div>
                {latestMajorBodyText && (
                  <div className="mt-8 text-muted-foreground">
                    <Sparkles className="h-4 w-4 inline mr-1" />
                    <Markdown content={latestMajorBodyText} isProse={false} inlineOnly={true} />
                  </div>
                )}
              </div>
              <div className="absolute bottom-0 left-0 right-0" style={{ height: '80px' }}>
                <svg viewBox="0 0 1440 80" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: '100%' }}>
                  <polygon points="0,80 1440,15 1440,80" fill="white" />
                </svg>
              </div>
            </header>
          </div>

          {/* Quick Action Guides */}
          <section className="mb-16">
            <h2 className="text-2xl font-bold mb-6">{t('homepage.checklistsHeading')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {ACTION_GUIDES.map((guide, index) => (
                <GuideCard key={index} guideItem={guide} size="large" />
              ))}
            </div>
            <div className="mt-8 text-center">
              <Button asChild variant="outline" size="lg">
                <Link href={SECURITY_CHECKLISTS.href} className="group">
                  {t('homepage.browseAll')} <ArrowRight className="ml-2 transition-transform duration-300 ease-out group-hover:translate-x-1" />
                </Link>
              </Button>
            </div>
          </section>

          {/* Why Trust Us Section */}
          <section className="mb-16 bg-linear-to-br from-muted via-muted to-accent/5 p-5 sm:p-6 md:p-8 rounded-lg">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-12">
              <div className="space-y-4 md:space-y-6">
                <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold bg-linear-to-br from-primary to-primary/70 bg-clip-text text-transparent">{t('homepage.trustHeading')}</h2>
                <p className="text-lg sm:text-xl text-muted-foreground">{t('homepage.trustDescription')}</p>
              </div>
              <div className="space-y-0">
                <TrustPoint icon={Users} title={t('trustPoints.experienceTitle')} description={t('trustPoints.experienceDescription')} />
                <TrustPoint icon={Shield} title={t('trustPoints.updatedTitle')} description={t('trustPoints.updatedDescription')} />
              </div>
            </div>
          </section>

          {/* Common Misconceptions */}
          <section className="mb-16">
            <h2 className="text-2xl font-bold mb-6">{t('misconceptions.sectionTitle')}</h2>
            <p className="text-lg text-muted-foreground mb-8">{t('misconceptions.sectionDescription')}</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <ConcernCard
                title={t('misconceptions.nothingToHideTitle')}
                description={t.rich('misconceptions.nothingToHideDescription', { b: (chunks) => <b>{chunks}</b> })}
              />
              <ConcernCard
                title={t('misconceptions.alreadyKnowTitle')}
                description={t.rich('misconceptions.alreadyKnowDescription', { b: (chunks) => <b>{chunks}</b> })}
              />
              <ConcernCard
                title={t('misconceptions.dontCareTitle')}
                description={t.rich('misconceptions.dontCareDescription', { b: (chunks) => <b>{chunks}</b> })}
              />
            </div>
          </section>

          {/* Latest News — loaded in server component HomeNewsSection (see app/[locale]/page.tsx) */}
          {children}

          {/* Recent Updates */}
          <section>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">{t('homepage.recentUpdatesHeading')}</h2>
              <Button asChild variant="outline" size="sm">
                <Link href={NAV_ITEMS.CHANGELOG.href} className="group">
                  {t('homepage.viewAllUpdates')} <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-300 ease-out group-hover:translate-x-1" />
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
