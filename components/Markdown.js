import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { markdownToSafeHtml } from '@/lib/markdown-html';

const Markdown = ({ content, inlineOnly = false, isProse = true, className = '' }) => {
  const html = useMemo(() => {
    try {
      return markdownToSafeHtml(content, { inlineOnly });
    } catch (error) {
      // Never fall back to the raw string: it is untrusted and would be
      // injected as HTML below.
      console.error('Failed to process markdown:', error.message);
      return '';
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
