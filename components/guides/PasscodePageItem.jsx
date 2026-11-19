'use client';

import ChecklistItem from '@/components/guides/ChecklistItem';
import { checklistItemBodyComponents } from '@/lib/mdx-components';

// /passcode/ shows the large generator above this item, so the copy
// inside the item's body renders nothing here. Guides still get it.
const bodyComponents = {
  ...checklistItemBodyComponents,
  PasscodeGenerator: () => null,
};

/**
 * The passcode checklist item on /passcode/: pinned open, with no
 * collapse control and no generator of its own. A client component because
 * the body component map holds functions, which a server page can't pass down.
 */
export default function PasscodePageItem({ slug, frontmatter, serializedBody }) {
  return (
    <ChecklistItem
      slug={slug}
      title={frontmatter.title}
      type={frontmatter.type}
      why={frontmatter.preview ?? frontmatter.why}
      tools={frontmatter.do ?? frontmatter.tools}
      stop={frontmatter.dont ?? frontmatter.stop}
      serializedBody={serializedBody}
      bodyComponents={bodyComponents}
      alwaysExpanded
    />
  );
}
