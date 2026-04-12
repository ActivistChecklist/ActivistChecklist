'use client';
/**
 * Central MDX component map for rendering file-based MDX content.
 *
 * Maps MDX tag names to React components. Components accept plain MDX props
 * Props are passed directly as MDX attributes.
 *
 * Security: Dangerous HTML elements are overridden to render nothing.
 * Only explicitly listed components can be used in MDX content.
 */

import React from 'react';
import { Alert } from '@/components/ui/alert';
import { HowTo } from '@/components/guides/HowTo';
import { ButtonEmbed } from '@/components/ButtonEmbed';
import { ImageEmbed } from '@/components/ImageEmbed';
import { VideoEmbed } from '@/components/VideoEmbed';
import { RiskLevel } from '@/components/RiskLevel';
import { ContentTable } from '@/components/ContentTable';
import RelatedGuides from '@/components/RelatedGuides';
import Link from '@/components/Link';
import CopyButton from '@/components/CopyButton';
import { Badge } from '@/components/ui/badge';
import { InlineChecklist } from '@/components/guides/InlineChecklist';
import ChecklistItemComponent from '@/components/guides/ChecklistItem';
import SectionComponent from '@/components/guides/Section';
import ChecklistItemGroup from '@/components/guides/ChecklistItemGroup';
import StyledSpan from '@/components/mdx/StyledSpan';
import SimpleImage from '@/components/SimpleImage';
import TranslationStats from '@/components/TranslationStats';
import { useChecklistItems } from '@/contexts/ChecklistItemsContext';
import { useSectionContext } from '@/contexts/SectionContext';

// ─── Security: block dangerous HTML elements ─────────────────

const Blocked = () => null;

const securityOverrides = {
  script: Blocked,
  iframe: Blocked,
  object: Blocked,
  embed: Blocked,
  form: Blocked,
  input: Blocked,
  textarea: Blocked,
  select: Blocked,
};

// ─── Safe link component ─────────────────────────────────────

function SafeLink({ href, children, ...props }) {
  if (typeof href === 'string' && href.toLowerCase().startsWith('javascript:')) {
    return <span {...props}>{children}</span>;
  }
  return <Link href={href} {...props}>{children}</Link>;
}

/** Markdown `![](src)` and HTML `<img>` → same styling/behavior as <ImageEmbed /> */
function MdxImg({ src, alt, title, children, ...rest }) {
  if (typeof src !== 'string' || !src.trim()) {
    return null;
  }
  const lower = src.toLowerCase();
  if (lower.startsWith('javascript:') || lower.startsWith('data:')) {
    return null;
  }
  return (
    <ImageEmbed
      src={src}
      alt={alt ?? title ?? ''}
      {...rest}
    >
      {children}
    </ImageEmbed>
  );
}

// ─── Alert: map type → variant for MDX mode ──────────────────
// MDX content uses <Alert type="warning"> but shadcn uses variant prop.

function AlertMdx({ type, variant, children, ...props }) {
  return <Alert variant={type ?? variant} {...props}>{children}</Alert>;
}

// ─── ChecklistItem MDX wrapper ───────────────────────────────
// Resolves slug → item data from ChecklistItemsContext,
// reads expandTrigger from SectionContext, then renders the real component.

// Components available inside checklist item body MDX.
// Intentionally excludes Section and ChecklistItem to prevent nesting.
// Exported for Keystatic editor preview (must match guide rendering).
export const checklistItemBodyComponents = {
  ...securityOverrides,
  a: SafeLink,
  img: MdxImg,
  Alert: AlertMdx,
  HowTo,
  Button: (props) => <ButtonEmbed {...props} className={`my-2 mr-2 ${props.className || ''}`} />,
  ImageEmbed,
  VideoEmbed,
  RiskLevel,
  Table: ContentTable,
  RelatedGuides,
  CopyButton,
  Badge,
  InlineChecklist,
  StyledSpan,
  SimpleImage,
};

function ChecklistItemMdx({ slug, ...overrides }) {
  const items = useChecklistItems();
  const { expandTrigger } = useSectionContext();
  const item = items[slug];

  if (!item) {
    console.warn(`ChecklistItem: no item found for slug "${slug}"`);
    return null;
  }

  const { frontmatter, serializedBody } = item;

  return (
    <ChecklistItemComponent
      slug={slug}
      title={frontmatter.title}
      type={frontmatter.type}
      why={frontmatter.preview ?? frontmatter.why}
      tools={frontmatter.do ?? frontmatter.tools}
      stop={frontmatter.dont ?? frontmatter.stop}
      titleBadges={frontmatter.titleBadges ?? frontmatter.title_badges ?? []}
      serializedBody={serializedBody}
      bodyComponents={checklistItemBodyComponents}
      expandTrigger={expandTrigger}
      {...overrides}
    />
  );
}

// ─── Component map ───────────────────────────────────────────

export const mdxComponents = {
  // Security overrides (block dangerous elements)
  ...securityOverrides,

  // Safe link override
  a: SafeLink,
  img: MdxImg,

  // Content components (MDX tag name → React component)
  Alert: AlertMdx,
  HowTo,
  Button: (props) => <ButtonEmbed {...props} className={`my-2 mr-2 ${props.className || ''}`} />,
  ImageEmbed,
  VideoEmbed,
  RiskLevel,
  Table: ContentTable,
  RelatedGuides,
  // RelatedGuide children are read by RelatedGuides via React.Children; never rendered directly
  RelatedGuide: () => null,
  Section: SectionComponent,
  ChecklistItem: ChecklistItemMdx,
  ChecklistItemGroup,
  CopyButton,
  Badge,
  InlineChecklist,
  StyledSpan,
  SimpleImage,
  TranslationStats,
};

export default mdxComponents;
