'use client';

import ChecklistItem from '@/components/guides/ChecklistItem';
import { checklistItemBodyComponents } from '@/lib/mdx-components';

/**
 * A checklist item pinned open on a tool page, with no collapse control.
 * `hide` names body components that render nothing here, such as a small
 * generator when the page already shows the large one. A client component
 * because the body component map holds functions, which a server page can't
 * pass down. (PasscodePageItem is the same thing for /passcode/ and could
 * switch to this.)
 */
export default function PinnedChecklistItem({ slug, frontmatter, serializedBody, hide = [] }) {
  const bodyComponents = {
    ...checklistItemBodyComponents,
    ...Object.fromEntries(hide.map((name) => [name, () => null])),
  };
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
