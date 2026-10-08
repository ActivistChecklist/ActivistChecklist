'use client';
import React from 'react';
import Markdown from '@/components/Markdown';
import { cn } from "@/lib/utils";
import { useRelativeDate } from '@/hooks/use-relative-date';

const ChangeLogEntry = ({ entry }) => {
  // No `new Date()` fallback: it would differ between the build-time server
  // render and the browser, which is the hydration mismatch useRelativeDate
  // exists to avoid.
  const dateString =
    entry?.first_published_at || entry?.created_at || entry?.published_at || '';

  // Hooks must run before the early return below (Rules of Hooks).
  const displayDate = useRelativeDate(dateString);

  if (!entry) {
    console.log('⚠️ ChangeLogEntry: entry is undefined. Skipping');
    return null;
  }

  // Format date for hover tooltip (YYYY-MM-DD)
  const hoverDate = dateString ? new Date(dateString).toISOString().split('T')[0] : '';

  return (
    <div

      className={cn(
        "changelog-entry"
      )}
    >
      <div className="flex flex-col sm:flex-row sm:gap-2">
        <time
          className="text-sm text-muted-foreground italic sm:w-20 sm:shrink-0 mb-1 sm:mb-0"
          dateTime={dateString}
          title={hoverDate}
        >
          {displayDate}
        </time>
        {entry.bodyText && (
          <div className="prose prose-slate max-w-none text-sm flex-1">
            <Markdown content={entry.bodyText} isProse={false} />
          </div>
        )}
      </div>
    </div>
  );
};

export default ChangeLogEntry;
