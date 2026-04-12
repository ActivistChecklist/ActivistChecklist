/**
 * Shared MDX compilation options for next-mdx-remote.
 *
 * Used by both the content rendering pipeline and the validation script.
 * Security plugins strip dangerous patterns at the AST level.
 */

import remarkGfm from 'remark-gfm';

// ─── Custom remark plugin: strip ESM import/export statements ──

function remarkStripEsm() {
  return (tree) => {
    tree.children = tree.children.filter(
      (node) => node.type !== 'mdxjsEsm'
    );
  };
}

// ─── Custom remark plugin: strip JS expressions ({...}) ────────

function remarkStripExpressions() {
  return (tree) => {
    const visit = (node) => {
      if (node.children) {
        node.children = node.children.filter(
          (child) =>
            child.type !== 'mdxFlowExpression' &&
            child.type !== 'mdxTextExpression'
        );
        node.children.forEach(visit);
      }
    };
    visit(tree);
  };
}

// ─── Allowed MDX component names ────────────────────────────────

const ALLOWED_COMPONENTS = new Set([
  'Alert',
  'HowTo',
  'Button',
  'ImageEmbed',
  'VideoEmbed',
  'RiskLevel',
  'Table',
  'RelatedGuides',
  'RelatedGuide',
  'Section',
  'ChecklistItem',
  'ChecklistItemGroup',
  'CopyButton',
  'Badge',
  'InlineChecklist',
  'StyledSpan',
  'SimpleImage',
  'TranslationStats',
]);

// Standard HTML elements that are allowed in MDX
const ALLOWED_HTML_ELEMENTS = new Set([
  'a', 'b', 'blockquote', 'br', 'code', 'div', 'em', 'h1', 'h2', 'h3',
  'h4', 'h5', 'h6', 'hr', 'i', 'img', 'li', 'ol', 'p', 'pre', 'span',
  'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'th', 'thead', 'tr',
  'u', 'ul', 'del', 'ins', 'mark', 'small', 'details', 'summary',
  'figure', 'figcaption', 'video', 'source',
]);

// Event handler attribute pattern
const EVENT_HANDLER_RE = /^on[A-Z]/;

// ─── Custom remark plugin: validate component names ─────────────

function remarkValidateComponents() {
  return (tree) => {
    const visit = (node) => {
      if (
        node.type === 'mdxJsxFlowElement' ||
        node.type === 'mdxJsxTextElement'
      ) {
        const name = node.name;
        if (
          name &&
          !ALLOWED_COMPONENTS.has(name) &&
          !ALLOWED_HTML_ELEMENTS.has(name)
        ) {
          throw new Error(
            `Unregistered MDX component: <${name}>. ` +
            `Allowed components: ${[...ALLOWED_COMPONENTS].join(', ')}`
          );
        }

        // Check for event handler attributes
        if (node.attributes) {
          for (const attr of node.attributes) {
            if (attr.name && EVENT_HANDLER_RE.test(attr.name)) {
              throw new Error(
                `Event handler attribute "${attr.name}" is not allowed on <${name}>`
              );
            }
          }
        }
      }

      if (node.children) {
        node.children.forEach(visit);
      }
    };
    visit(tree);
  };
}

// ─── Exported options ────────────────────────────────────────────

export const mdxOptions = {
  mdxOptions: {
    remarkPlugins: [
      remarkGfm,
      remarkStripEsm,
      remarkStripExpressions,
      remarkValidateComponents,
    ],
    rehypePlugins: [],
    // next-mdx-remote v6 blocks JS by default (blockJS: true)
  },
};

// Export individual plugins for use in validation script
export {
  remarkStripEsm,
  remarkStripExpressions,
  remarkValidateComponents,
  ALLOWED_COMPONENTS,
  ALLOWED_HTML_ELEMENTS,
};
