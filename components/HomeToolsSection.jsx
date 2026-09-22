'use client';

import { ArrowRight, ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from '@/components/Link';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { TOOLS, TOOLS_HREF } from '@/config/tools';
import { cn } from '@/lib/utils';

/**
 * Compact teaser for /tools/ near the bottom of the homepage. Four small cards,
 * same card treatment as GuideCard's medium size so the page keeps one visual
 * language, but without the footer CTA row: at this size the whole card is the
 * link and a third line of chrome just makes it noisy.
 *
 * Cards go straight to each tool, the way the checklist cards above go straight
 * to each checklist. The heading's button is the route to /tools/, where the
 * screenshots and the longer explanation are.
 */
function ToolCard({ tool }) {
  const t = useTranslations();
  const { key, icon: Icon, accent, href } = tool;
  const external = href.startsWith('http');
  const Indicator = external ? ExternalLink : ArrowRight;

  return (
    <Link href={href} className="group block">
      <Card className="flex h-full flex-col border-primary/10 bg-linear-to-br from-card via-card to-primary/5 transition-all duration-200 ease-in-out hover:scale-101 hover:border-primary/30 hover:shadow-xl dark:to-primary/25">
        <CardHeader className="space-y-0 p-4">
          <div className="mb-3 flex items-start justify-between gap-2">
            <span className={cn('rounded-lg bg-primary/10 p-2', accent)}>
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <Indicator
              className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-out group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </div>
          <CardTitle className="text-lg">{t(`tools.items.${key}.name`)}</CardTitle>
          <CardDescription className="pt-1 text-sm">
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
