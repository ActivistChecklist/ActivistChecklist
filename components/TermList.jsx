'use client';
import { useLocale, useTranslations } from 'next-intl';
import CopyLinkButton from '@/components/CopyLinkButton';
import Term, { TermLink, renderInlineMarkdown } from '@/components/Term';
import { isSafeHref, parseInlineMarkdown } from '@/lib/inline-markdown';

// a term link inside a definition opens its popup, the same as in content
const renderTerm = (slug, children, key) => (
  <Term key={key} slug={slug}>
    {children}
  </Term>
);

/** Every term in messages `definitions`, sorted by its translated name. */
export default function TermList() {
  const t = useTranslations();
  const locale = useLocale();
  // definitions also holds the popup's own strings (closeAriaLabel, learnMore, ...)
  const definitions = t.raw('definitions');
  const collator = new Intl.Collator(locale);
  const terms = Object.keys(definitions)
    .filter((slug) => t.has(`definitions.${slug}.term`) && t.has(`definitions.${slug}.definition`))
    .map((slug) => ({ slug, term: t(`definitions.${slug}.term`) }))
    .sort((a, b) => collator.compare(a.term, b.term));

  return (
    <div className="mt-8">
      {terms.map(({ slug, term }) => {
        const key = `definitions.${slug}`;
        // source URLs come from translated message files, so only allow https or site-relative links
        const url = t.has(`${key}.url`) && t.has(`${key}.source`) ? t(`${key}.url`) : '';

        return (
          <section
            key={slug}
            id={slug}
            className="-mx-3 scroll-mt-4 rounded-lg border-t border-border px-3 py-6 first:border-t-0 target:border-transparent target:bg-muted"
          >
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold sm:text-2xl">{term}</h2>
              <CopyLinkButton slug={slug} label={t('terms.copyLink')} />
            </div>
            {/* raw, not t(): definitions are inline Markdown with no ICU arguments */}
            <p className="mt-2 text-base sm:text-lg">
              {renderInlineMarkdown(parseInlineMarkdown(t.raw(`${key}.definition`)), renderTerm)}
            </p>
            {isSafeHref(url) && (
              <p className="mt-3 text-sm text-muted-foreground">
                {t.rich('definitions.learnMore', {
                  source: t(`${key}.source`),
                  link: (chunks) => <TermLink href={url}>{chunks}</TermLink>,
                })}
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
