'use client';
import React, { useState, useEffect } from 'react';
import Markdown from '@/components/Markdown';
import { cn, formatRelativeDate } from "@/lib/utils";
import { IoStar } from 'react-icons/io5';
import { useLocale } from 'next-intl';
import { getIntlLocale } from '@/lib/i18n-config';

const ChangeLogEntry = ({ entry }) => {
  const [entryDate, setEntryDate] = useState('');
  const [isClient, setIsClient] = useState(false);
  const locale = useLocale();
  const dateLocale = getIntlLocale(locale);

  if (!entry) {
    console.log('⚠️ ChangeLogEntry: entry is undefined. Skipping');
    return null;
  }

  const dateString = entry.first_published_at || entry.created_at || entry.published_at || new Date().toISOString();

  // Format date for hover tooltip (YYYY-MM-DD)
  const hoverDate = new Date(dateString).toISOString().split('T')[0];

  useEffect(() => {
    setIsClient(true);
    setEntryDate(formatRelativeDate(dateString, dateLocale));
  }, [dateString, dateLocale]);

  // Show fallback date format during SSR/hydration
  const displayDate = isClient ? entryDate : hoverDate;

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
          <div className="flex items-start gap-1 flex-1">
            {entry.type === 'major' && (
              <IoStar className="text-yellow-500 shrink-0 mt-[2px]" size={16} />
            )}
            <div className="prose prose-slate max-w-none text-sm flex-1">
              <Markdown content={entry.bodyText} isProse={false} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChangeLogEntry;
