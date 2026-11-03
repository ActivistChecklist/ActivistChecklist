'use client';

import * as React from 'react';
import { ChevronRight } from 'lucide-react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { useIsPrinting } from '@/hooks/use-is-printing';

export const CollapsibleSection = ({ title, defaultOpen = false, className, children }) => {
  const [open, setOpen] = React.useState(defaultOpen);
  const isPrinting = useIsPrinting();
  return (
    <Collapsible open={open || isPrinting} onOpenChange={setOpen} className={cn('my-4', className)}>
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
          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 print:hidden"
          aria-hidden="true"
        />
        <span>{title}</span>
      </CollapsibleTrigger>
      {/* print:animate-none! must be important: the data-[state=open] rule is more
          specific, and its animated height (measured at screen width) clips the
          content once print layout wraps it onto more lines. */}
      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down print:animate-none!">
        <div className="pl-6 pt-2">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export default CollapsibleSection;
