import { serialize } from 'next-mdx-remote/serialize';
import { mdxOptions } from './mdx-options';
import { applyHeadingIds } from './mdx-heading-ids';

/**
 * Serialize MDX content for next-mdx-remote using our shared options.
 *
 * Prefer this over calling `serialize(source, mdxOptions)` directly: it also
 * applies the `{#custom-id}` heading-id preprocessing so custom heading anchors
 * work everywhere content is rendered (guides, pages, checklist items, preview).
 */
export function serializeMdx(source) {
  return serialize(applyHeadingIds(source), mdxOptions);
}
