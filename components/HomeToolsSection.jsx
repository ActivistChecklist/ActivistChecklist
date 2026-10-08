'use client';

import { ArrowRight, ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from '@/components/Link';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import ToolThumb from '@/components/tools/ToolThumb';
import { TOOLS, TOOLS_HREF } from '@/config/tools';

/**
 * Compact teaser for /tools/ near the bottom of the homepage.
 *
 * Each card opens with a small preview distilled from that tool's full
 * illustration on /tools/ (see ToolThumb). Not an icon badge: a heat grid, a
 * before and after pair, an alert, a list of chats clearing out. They give the
 * card a bit of the tool's character without pretending to be a screenshot.
 *
 * The one glyph that earns its place is the small external mark after the name:
 * three of the four leave the site, and readers should know that before they
 * click.
 */
function ToolCard({ tool }) {
  const t = useTranslations();
  const { key, href } = tool;

  return (
    <Link href={href} className="group block">
      <Card className="flex h-full flex-col overflow-hidden border-primary/10 bg-linear-to-br from-card via-card to-primary/5 transition-all duration-200 ease-in-out hover:scale-101 hover:border-primary/30 hover:shadow-xl dark:to-primary/25">
        <ToolThumb toolKey={key} />
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {TOOLS.map((tool) => (
          <ToolCard key={tool.key} tool={tool} />
        ))}
      </div>
    </section>
  );
}
