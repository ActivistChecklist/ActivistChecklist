'use client';
import React from 'react';
import ChangeLogEntry from './ChangeLogEntry';
import ChangeLogTimelineMarker from './ChangeLogTimelineMarker';
import { cn } from "@/lib/utils";
import { useTranslations } from 'next-intl';

const ChangeLogRecentEntries = ({ entries = [] }) => {
  const t = useTranslations();
  if (!entries.length) {
    return (
      <div className="changelog-recent-entries">
        <div className="text-sm text-muted-foreground italic">
          {t('homepage.noRecentChanges')}
        </div>
      </div>
    );
  }

  return (
    <div className="changelog-recent-entries">
      <div className="relative">
        {entries.map((entry, index) => (
          <div key={entry.slug} className="relative">
            <div className="py-3 pl-12 text-sm text-muted-foreground relative">
              <ChangeLogTimelineMarker type={entry.type} />
              {/* Timeline line */}
              {index < entries.length - 1 && (
                <div className="absolute z-0 left-6 top-[26px] w-px bg-border h-full -translate-x-1/2"></div>
              )}
              <ChangeLogEntry entry={entry} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ChangeLogRecentEntries;
