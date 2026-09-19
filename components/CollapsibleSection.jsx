'use client';

import * as React from 'react';
import { ChevronRight } from 'lucide-react';
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

export const CollapsibleSection = ({
  title,
  defaultOpen = false,
  className,
  children,
}) => {
  return (
    <Collapsible defaultOpen={defaultOpen} className={cn('my-4', className)}>
      <CollapsibleTrigger
        className={cn(
          'flex w-full items-center gap-2 -mx-2 px-2 py-1.5 rounded-md text-left',
          'font-heading text-base font-semibold text-foreground',
          'hover:bg-muted/60 transition-colors cursor-pointer',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          '[&[data-state=open]>svg]:rotate-90',
        )}
      >
        <ChevronRight
          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200"
          aria-hidden="true"
        />
        <span>{title}</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <div className="pl-6 pt-2">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export default CollapsibleSection;
