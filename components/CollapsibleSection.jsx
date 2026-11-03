'use client';

import * as React from 'react';
import { ChevronRight } from 'lucide-react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

/**
 * variant="more" is a quieter toggle for extra items right under a list (e.g.
 * "7 more resources"): small link-colored text, and the revealed content isn't
 * indented, so its list lines up with the list above.
 */
export const CollapsibleSection = ({
  title,
  defaultOpen = false,
  variant = 'default',
  className,
  children,
}) => {
  const isMore = variant === 'more';
  return (
    <Collapsible defaultOpen={defaultOpen} className={cn(isMore ? 'mt-2 mb-4' : 'my-4', className)}>
      <CollapsibleTrigger
        className={cn(
          'flex items-center text-left cursor-pointer',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          '[&[data-state=open]>svg]:rotate-90',
          isMore
            ? 'gap-1 rounded-sm text-sm font-medium text-link hover:underline'
            : 'w-full gap-2 -mx-2 px-2 py-1.5 rounded-md font-heading text-base font-semibold text-foreground hover:bg-muted/60 transition-colors',
        )}
      >
        <ChevronRight
          className={cn(
            'h-4 w-4 shrink-0 transition-transform duration-200',
            !isMore && 'text-muted-foreground',
          )}
          aria-hidden="true"
        />
        <span>{title}</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <div className={isMore ? 'pt-1' : 'pl-6 pt-2'}>{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export default CollapsibleSection;
