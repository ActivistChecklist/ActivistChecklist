// @ts-nocheck
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { ArrowRight, Check, ExternalLink, LayoutGrid, Smartphone, Trash2, UserX } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import PageNotices from '@/components/layout/PageNotices';
import Link from '@/components/Link';
import { Button } from '@/components/ui/button';
import BrowserFrame from '@/components/tools/BrowserFrame';
import RiskMapperShot from '@/components/tools/RiskMapperShot';
import SocialScrubShot from '@/components/tools/SocialScrubShot';
import UpdateCheckerShot from '@/components/tools/UpdateCheckerShot';
import AutoDeleteShot from '@/components/tools/AutoDeleteShot';
import { DEFAULT_LOCALE } from '@/lib/i18n-config';
import { getBaseUrl } from '@/lib/utils';
import { getOgImagePathForSlug } from '@/lib/og-image';
import { cn } from '@/lib/utils';

const CHROME_STORE_URL =
  'https://chromewebstore.google.com/detail/ai-chat-history-auto-dele/ipmoefogkkpbgpbniklknonnmbmcbnpk';
const AUTO_DELETE_REPO_URL =
  'https://github.com/ActivistChecklist/ai-chat-history-auto-delete-extension';

/**
 * Order here is the order on the page. `accent` colors the eyebrow icon and the
 * bullet checks only: the eyebrow label itself stays muted-foreground because
 * the alternating `bg-muted` panels don't leave enough contrast for small
 * colored text (primary and success both land near 4.1:1 on it).
 */
const TOOLS = [
  {
    key: 'riskMapper',
    id: 'risk-mapper',
    icon: LayoutGrid,
    accent: 'text-primary',
    href: 'https://riskmapper.app',
    secondaryHref: '/organizing/',
    shotUrl: 'riskmapper.app',
    Shot: RiskMapperShot,
  },
  {
    key: 'socialScrub',
    id: 'social-scrub',
    icon: UserX,
    accent: 'text-success',
    href: 'https://socialscrub.app',
    secondaryHref: '/doxxing/',
    shotUrl: 'socialscrub.app',
    Shot: SocialScrubShot,
  },
  {
    key: 'updates',
    id: 'update-checker',
    icon: Smartphone,
    accent: 'text-error',
    href: '/updates/',
    secondaryHref: '/secondary/',
    shotUrl: 'activistchecklist.org/updates',
    Shot: UpdateCheckerShot,
  },
  {
    key: 'autoDelete',
    id: 'ai-chat-auto-delete',
    icon: Trash2,
    accent: 'text-info',
    href: CHROME_STORE_URL,
    secondaryHref: AUTO_DELETE_REPO_URL,
    shotUrl: 'AI chat auto-delete · Settings',
    Shot: AutoDeleteShot,
  },
];

const PILL_KEYS = ['free', 'noAccount', 'onDevice', 'openSource'];

function isExternal(href) {
  return href.startsWith('http');
}

export async function generateMetadata({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });

  const baseUrl = getBaseUrl();
  const canonical = locale === DEFAULT_LOCALE ? `${baseUrl}/tools/` : `${baseUrl}/${locale}/tools/`;
  const title = t('tools.metaTitle');
  const description = t('tools.metaDescription');
  const ogImageUrl = `${baseUrl}${getOgImagePathForSlug('tools')}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: 'website',
      siteName: 'Activist Checklist',
      images: [ogImageUrl],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImageUrl],
    },
  };
}

function ToolRow({ tool, tinted, reversed, t }) {
  const { key, id, icon: Icon, accent, href, secondaryHref, shotUrl, Shot } = tool;
  const item = (field) => t(`tools.items.${key}.${field}`);
  const external = isExternal(href);

  return (
    <section
      className={cn(
        'rounded-lg px-1 py-8 sm:p-8',
        tinted && 'bg-muted px-5 dark:border dark:border-border'
      )}
    >
      <div
        className={cn(
          'flex flex-col gap-8 lg:flex-row lg:items-center lg:gap-12',
          reversed && 'lg:flex-row-reverse'
        )}
      >
        <div className="lg:w-[37%] lg:shrink-0">
          <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            <Icon className={cn('h-4 w-4 shrink-0', accent)} aria-hidden="true" />
            {item('eyebrow')}
          </p>
          <h2 id={id} className="mb-3 text-2xl font-bold tracking-tight sm:text-3xl">
            {item('name')}
          </h2>
          <p className="text-base text-muted-foreground sm:text-lg">{item('lede')}</p>

          <ul className="mt-4 flex flex-col gap-2.5">
            {['bullet1', 'bullet2', 'bullet3'].map((field) => (
              <li key={field} className="flex gap-2.5 text-sm leading-relaxed sm:text-base">
                <Check
                  className={cn('mt-1 h-4 w-4 shrink-0', accent)}
                  aria-hidden="true"
                  strokeWidth={3}
                />
                <span>{item(field)}</span>
              </li>
            ))}
          </ul>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button asChild>
              <Link href={href}>
                {item('cta')}
                {external ? (
                  <ExternalLink aria-hidden="true" />
                ) : (
                  <ArrowRight aria-hidden="true" />
                )}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={secondaryHref}>{item('secondaryCta')}</Link>
            </Button>
          </div>

          <p className="mt-3 text-xs text-muted-foreground">{item('meta')}</p>
        </div>

        <div className="min-w-0 lg:w-[63%] lg:grow">
          <BrowserFrame label={item('shotAlt')} url={shotUrl}>
            <Shot />
          </BrowserFrame>
        </div>
      </div>
    </section>
  );
}

export default async function ToolsPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  return (
    <Layout sidebarType={null} fullWidthMain={true}>
      <header>
        <h1 className="page-title">{t('tools.title')}</h1>
        <p className="max-w-3xl text-lg text-muted-foreground sm:text-xl">{t('tools.intro')}</p>
        <ul className="mt-5 flex flex-wrap gap-2">
          {PILL_KEYS.map((pill) => (
            <li
              key={pill}
              className="rounded-full border border-border bg-card px-3 py-1.5 text-sm font-semibold text-foreground/80"
            >
              {t(`tools.pills.${pill}`)}
            </li>
          ))}
        </ul>
      </header>

      <PageNotices />

      <div className="mt-6 flex flex-col gap-4 sm:gap-6">
        {TOOLS.map((tool, index) => (
          <ToolRow
            key={tool.key}
            tool={tool}
            tinted={index % 2 === 0}
            reversed={index % 2 === 1}
            t={t}
          />
        ))}
      </div>

      <section className="mt-10 rounded-lg border border-border bg-linear-to-br from-muted via-muted to-accent/5 p-6 sm:p-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:gap-10">
          <div className="grow">
            <h2 className="mb-2 text-xl font-bold tracking-tight sm:text-2xl">
              {t('tools.closing.title')}
            </h2>
            <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
              {t('tools.closing.body')}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <Button asChild>
              <Link href="/contact/">{t('tools.closing.primaryCta')}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="https://github.com/ActivistChecklist">
                {t('tools.closing.secondaryCta')}
                <ExternalLink aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </Layout>
  );
}
