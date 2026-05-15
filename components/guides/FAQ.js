'use client';

import React from 'react';
import { ChevronRight } from 'lucide-react';
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { buildFaqPage } from '@/lib/structured-data';
import { serializeJsonLd } from '@/lib/structured-data';

/**
 * FAQItem — a single Q&A.
 *
 * `question` and `answer` are string-only attributes (no JSX expressions
 * inside, per remark plugin restrictions). Multi-line strings inside the
 * attribute are fine in MDX. Use plain text in the answer — AI engines
 * extract this verbatim into FAQPage JSON-LD, so keep it self-contained
 * and skip Markdown formatting.
 */
export function FAQItem({ question, answer }) {
  if (!question || !answer) return null;
  return (
    <Collapsible className="border-b border-border last:border-b-0">
      <CollapsibleTrigger
        className={cn(
          'flex w-full items-start gap-2 py-3 text-left',
          'font-heading text-base font-semibold text-foreground',
          'hover:text-primary transition-colors cursor-pointer',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          '[&[data-state=open]>svg]:rotate-90',
        )}
      >
        <ChevronRight
          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 mt-1"
          aria-hidden="true"
        />
        <span>{question}</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <p className="pl-6 pb-3 m-0 text-base leading-relaxed text-foreground">{answer}</p>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * FAQ — a list of FAQItem children.
 *
 * Renders a styled accordion under "Frequently asked questions" and emits
 * inline FAQPage JSON-LD with each Q&A. Place this near the bottom of a
 * guide. Pulls questions+answers from each FAQItem child's props.
 */
export function FAQ({ title = 'Frequently asked questions', children }) {
  const pairs = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    const q = child.props?.question;
    const a = child.props?.answer;
    if (q && a) pairs.push({ question: q, text: a });
  });

  const schema = buildFaqPage(pairs);
  const wrapped = schema ? { '@context': 'https://schema.org', ...schema } : null;

  return (
    <section className="my-8" aria-labelledby="faq-heading">
      <h2 id="faq-heading" className="mt-8 mb-4">{title}</h2>
      <div className="not-prose">{children}</div>
      {wrapped && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(wrapped) }}
        />
      )}
    </section>
  );
}
