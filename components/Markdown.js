import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkHtml from 'remark-html';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { applyPaywallBypassHref } from '@/lib/paywall-bypass-url';

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
              rel: 'noopener noreferrer',
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

const Markdown = ({ content, inlineOnly = false, isProse = true, className = '' }) => {
  const html = useMemo(() => {
    if (!content) return '';

    try {
      const processor = unified().use(remarkParse).use(remarkGfm).use(remarkExternalLinksPlugin);

      if (inlineOnly) {
        processor.use(remarkInlinePlugin);
      }

      processor.use(remarkHtml, { sanitize: false });

      const result = processor.processSync(content);
      return String(result);
    } catch (error) {
      console.error('Failed to process markdown:', error);
      return content;
    }
  }, [content, inlineOnly]);

  return (
    <div
      className={cn(
        `max-w-none prose-slate ${isProse ? 'prose' : ''} ${inlineOnly ? 'inline w-full' : ''}`,
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

export default Markdown;
