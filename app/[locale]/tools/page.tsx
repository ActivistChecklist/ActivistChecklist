// @ts-nocheck
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { ArrowRight, Check, ExternalLink } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import PageNotices from '@/components/layout/PageNotices';
import Link from '@/components/Link';
import { Button } from '@/components/ui/button';
import { DEFAULT_LOCALE } from '@/lib/i18n-config';
import { getBaseUrl } from '@/lib/utils';
import { getOgImagePathForSlug } from '@/lib/og-image';
import { GENERATORS, TOOLS } from '@/config/tools';
import { cn } from '@/lib/utils';

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
  // Same English card the page render generates, so the URL matches the file.
  const tEn = await getTranslations({ locale: DEFAULT_LOCALE });
  const ogImageUrl = `${baseUrl}${getOgImagePathForSlug('tools', { title: tEn('tools.title'), pageType: 'page' })}`;

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
  const { key, id, href, screenshot } = tool;
  const item = (field) => t(`tools.items.${key}.${field}`);

  return (
    <section
      className={cn(
        'rounded-lg px-1 py-8 sm:p-8',
        tinted && 'bg-muted px-5 dark:border dark:border-border',
      )}
    >
      <div
        className={cn(
          'flex flex-col gap-8 lg:flex-row lg:items-center lg:gap-12',
          reversed && 'lg:flex-row-reverse',
        )}
      >
        <div className="lg:w-[37%] lg:shrink-0">
          <h2 id={id} className="mb-3 text-2xl font-bold tracking-tight sm:text-3xl">
            {item('name')}
          </h2>
          <p className="text-base text-muted-foreground sm:text-lg">{item('lede')}</p>

          <ul className="mt-4 flex flex-col gap-2.5">
            {['bullet1', 'bullet2', 'bullet3'].map((field) => (
              <li key={field} className="flex gap-2.5 text-sm leading-relaxed sm:text-base">
                {/* Primary on the bg-muted panels lands near 4.1:1: enough for
                    an icon (3:1), not for small colored text. */}
                <Check
                  className="mt-1 h-4 w-4 shrink-0 text-primary"
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
                {isExternal(href) ? (
                  <ExternalLink aria-hidden="true" />
                ) : (
                  <ArrowRight aria-hidden="true" />
                )}
              </Link>
            </Button>
          </div>
        </div>

        <div className="min-w-0 lg:w-[63%] lg:grow">
          {/* The screenshot goes where the button goes. It is left out of the
              tab order so keyboard users don't reach the same link twice. */}
          <Link href={href} tabIndex={-1} className="group mx-auto block w-fit max-w-full">
            {/* Capped height keeps the portrait screenshots from towering over the text. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={screenshot.src}
              width={screenshot.width}
              height={screenshot.height}
              alt={item('shotAlt')}
              data-pagefind-ignore
              className="h-auto max-h-[35rem] w-auto max-w-full rounded-lg border border-border shadow-md transition-shadow group-hover:shadow-xl"
            />
          </Link>
        </div>
      </div>
    </section>
  );
}

// One small row above the big ones (see GENERATORS in config/tools).
function GeneratorsRow({ t }) {
  return (
    <section className="rounded-lg px-1 py-8 sm:p-8">
      <h2 id="generators" className="mb-5 text-xl font-bold tracking-tight sm:text-2xl">
        {t('tools.generators.title')}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {GENERATORS.map(({ key, href, Icon }) => (
          <Link
            key={key}
            href={href}
            className="group flex items-start gap-4 rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/40"
          >
            <span className="shrink-0 rounded-lg bg-primary/10 p-2 text-primary">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="flex-1">
              <span className="block text-lg font-semibold leading-tight">
                {t(`${key}.page.title`)}
              </span>
              <span className="mt-1 block text-sm text-muted-foreground sm:text-base">
                {t(`${key}.page.intro`)}
              </span>
            </span>
            <ArrowRight
              className="h-5 w-5 shrink-0 self-center text-primary transition-transform group-hover:translate-x-1"
              aria-hidden="true"
            />
          </Link>
        ))}
      </div>
    </section>
  );
}

export default async function ToolsPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  // Generate OG image at build time. /tools/ is an app route, not MDX, so the
  // guide/page render path never builds a card for it. One card is shared by
  // every locale, so render it from the English title.
  try {
    const { generateOgImageForRoute } = await import('@/lib/og-image');
    const tEn = await getTranslations({ locale: DEFAULT_LOCALE });
    await generateOgImageForRoute({ title: tEn('tools.title'), pageType: 'page', slug: 'tools' });
  } catch (err) {
    console.warn('OG image skipped for page "tools":', err.message);
  }

  return (
    <Layout sidebarType={null} fullWidthMain={true}>
      <header>
        <h1 className="page-title">{t('tools.title')}</h1>
        <p className="max-w-3xl text-lg text-muted-foreground sm:text-xl">{t('tools.intro')}</p>
      </header>

      <PageNotices />

      <div className="mt-8 flex flex-col gap-4 sm:gap-6">
        <GeneratorsRow t={t} />
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

      <p className="mt-6 text-sm text-muted-foreground">
        {t.rich('tools.closing.openSource', {
          /* The claim needs somewhere to go: the org page carries all three repos. */
          repos: (chunks) => (
            <Link href="https://github.com/ActivistChecklist" className="link">
              {chunks}
            </Link>
          ),
          contact: (chunks) => (
            <Link href="/contact/" className="link">
              {chunks}
            </Link>
          ),
        })}
      </p>

      <section className="mt-10 rounded-lg border border-border bg-linear-to-br from-muted via-muted to-accent/5 p-6 sm:p-8">
        <h2 className="mb-2 text-xl font-bold tracking-tight sm:text-2xl">
          {t('tools.closing.title')}
        </h2>
        <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
          {t('tools.closing.body')}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/essentials/">
              {t('tools.closing.primaryCta')}
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/checklists/">{t('tools.closing.secondaryCta')}</Link>
          </Button>
        </div>
      </section>
    </Layout>
  );
}
