'use client';

import { ArrowRight, ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from '@/components/Link';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { GENERATORS, HOMEPAGE_TOOLS, TOOLS_HREF } from '@/config/tools';

/**
 * Compact teaser for /tools/ near the bottom of the homepage. Each card opens
 * with a cropped picture of the tool; config/tools picks the image and crop.
 *
 * The small external mark after the name is there because some tools leave
 * the site, and readers should know that before they click.
 */
function ToolCard({ tool }) {
  const t = useTranslations();
  const { key, href, thumbPosition } = tool;
  const image = tool.cardImage ?? tool.screenshot;

  return (
    <Link href={href} className="group block">
      <Card className="flex h-full flex-col overflow-hidden border-primary/10 bg-linear-to-br from-card via-card to-primary/5 transition-all duration-200 ease-in-out hover:scale-101 hover:border-primary/30 hover:shadow-xl dark:to-primary/25">
        {/* Decorative: the name and description below carry the meaning. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image.src}
          width={image.width}
          height={image.height}
          alt=""
          loading="lazy"
          decoding="async"
          className={`aspect-video w-full border-b border-border object-cover ${thumbPosition}`}
        />
        <CardHeader className="space-y-0 p-5">
          <CardTitle className="text-lg leading-snug">
            {t(`tools.items.${key}.name`)}
            {href.startsWith('http') && (
              <ExternalLink
                className="ml-1.5 inline-block h-3.5 w-3.5 align-[-0.1em] text-muted-foreground transition-colors group-hover:text-primary"
                aria-hidden="true"
              />
            )}
          </CardTitle>
          <CardDescription className="pt-2 text-sm leading-relaxed">
            {t(`tools.items.${key}.short`)}
          </CardDescription>
        </CardHeader>
      </Card>
    </Link>
  );
}

/**
 * The generators have no screenshot, and a card can't be one link when it
 * holds two. So this card keeps the same frame, puts the icons where the
 * picture goes, and lists a plain link to each page.
 */
function GeneratorsCard() {
  const t = useTranslations();

  return (
    <Card className="flex h-full flex-col overflow-hidden border-primary/10 bg-linear-to-br from-card via-card to-primary/5 dark:to-primary/25">
      <div
        aria-hidden="true"
        className="flex aspect-video w-full items-center justify-center gap-8 border-b border-border bg-primary/5 text-primary"
      >
        {GENERATORS.map(({ key, Icon }) => (
          <Icon key={key} className="h-14 w-14" strokeWidth={1.5} />
        ))}
      </div>
      <CardHeader className="space-y-0 p-5">
        <CardTitle className="text-lg leading-snug">{t('tools.generators.title')}</CardTitle>
        <ul className="space-y-1.5 pt-2">
          {GENERATORS.map(({ key, href }) => (
            <li key={key}>
              <Link
                href={href}
                className="group inline-flex items-center text-sm font-medium text-primary hover:underline"
              >
                {t(`${key}.page.title`)}
                <ArrowRight
                  className="ml-1.5 h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      </CardHeader>
    </Card>
  );
}

export default function HomeToolsSection() {
  const t = useTranslations();

  return (
    <section className="mb-16">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h2 className="text-2xl font-bold">{t('homepage.toolsHeading')}</h2>
        <Button asChild variant="outline" size="sm">
          <Link href={TOOLS_HREF} className="group">
            {t('homepage.viewAllTools')}
            <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-300 ease-out group-hover:translate-x-1" />
          </Link>
        </Button>
      </div>
      <p className="mb-6 text-lg text-muted-foreground">{t('homepage.toolsDescription')}</p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* First, as on /tools/ */}
        <GeneratorsCard />
        {HOMEPAGE_TOOLS.map((tool) => (
          <ToolCard key={tool.key} tool={tool} />
        ))}
      </div>
    </section>
  );
}
