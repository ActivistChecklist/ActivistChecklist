import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkHtml from 'remark-html';
import { applyPaywallBypassHref } from './paywall-bypass-url.js';

/**
 * Markdown to HTML for strings that skip the MDX pipeline: checklist-item
 * front matter (preview/why/do/dont), changelog and news bodies, and Table
 * cells. Crowdin translates all of these, so the output is treated as
 * untrusted and goes through `dangerouslySetInnerHTML` only after this
 * allowlist.
 *
 * Passing a schema (rather than `sanitize: false`) also makes remark-html drop
 * raw HTML nodes before sanitizing, so `<img onerror>` in the source never
 * becomes an element. Only tags markdown itself produces for these fields are
 * kept; anything else is unwrapped to its text.
 *
 * @type {import('hast-util-sanitize').Schema}
 */
export const MARKDOWN_SANITIZE_SCHEMA = {
  tagNames: ['p', 'span', 'a', 'strong', 'em', 'blockquote', 'ul', 'ol', 'li', 'br'],
  attributes: {
    a: ['href', 'title', ['target', '_blank'], ['rel', 'noopener', 'noreferrer']],
    ol: ['start'],
    span: [['className', 'inline-markdown']],
  },
  // Relative hrefs (no scheme) are always allowed by hast-util-sanitize.
  protocols: { href: ['http', 'https', 'mailto', 'tel'] },
  strip: ['script', 'style'],
  clobber: [],
};

function remarkExternalLinksPlugin() {
  return function (tree) {
    const visit = (node) => {
      if (node.type === 'link' || node.type === 'definition') {
        const isExternal = node.url.startsWith('http') || node.url.startsWith('//');

        if (isExternal) {
          node.url = applyPaywallBypassHref(node.url);
          if (node.type === 'link') {
            node.data = node.data || {};
            node.data.hProperties = {
              ...node.data.hProperties,
              target: '_blank',
              // An array, not one string: the sanitizer checks each token of
              // a list attribute against the schema's allowed values.
              rel: ['noopener', 'noreferrer'],
            };
          }
        }
      }

      if (node.children) {
        node.children.forEach(visit);
      }
    };

    visit(tree);
    return tree;
  };
}

function remarkInlinePlugin() {
  return function (tree) {
    if (tree.type === 'root') {
      tree.children = tree.children.map((node) => {
        if (node.type === 'paragraph') {
          return {
            ...node,
            data: {
              hName: 'span',
              hProperties: { className: 'inline-markdown' },
            },
          };
        }
        return node;
      });
    }
    return tree;
  };
}

/**
 * @param {string} content
 * @param {{ inlineOnly?: boolean }} [options]
 * @returns {string} sanitized HTML
 */
export function markdownToSafeHtml(content, { inlineOnly = false } = {}) {
  if (!content) return '';

  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkExternalLinksPlugin);

  if (inlineOnly) {
    processor.use(remarkInlinePlugin);
  }

  processor.use(remarkHtml, { sanitize: MARKDOWN_SANITIZE_SCHEMA });

  return String(processor.processSync(content));
}
