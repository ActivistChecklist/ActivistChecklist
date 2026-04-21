'use client';
import React from 'react';
import { useTranslations } from 'next-intl';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const ChangeLogTimelineMarker = ({ type }) => {
  const t = useTranslations();

  if (type === 'major') {
    return (
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="absolute z-20 left-6 top-[12px] w-5 h-5 -translate-x-1/2 flex items-center justify-center">
              <div className="w-3 h-3 bg-primary rounded-full ring-2 ring-primary/50 ring-offset-2 ring-offset-background"></div>
            </div>
          </TooltipTrigger>
          <TooltipContent className="bg-foreground text-background border-0">
            {t('changelog.majorUpdate')}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  return (
    <div className="absolute z-20 left-6 top-[18px] w-2 h-2 bg-primary rounded-full -translate-x-1/2"></div>
  );
};

export default ChangeLogTimelineMarker;
