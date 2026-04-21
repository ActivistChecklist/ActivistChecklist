import React from 'react';
import { cn } from "@/lib/utils";
import { Settings } from "lucide-react";


/**
 * HowTo — <HowTo title="...">markdown children</HowTo>
 */
export const HowTo = ({ title, children }) => {

  return (
    <div className={cn(
      "how-to-container",
      "print:border print:border-border print:rounded-md",
      "mt-4 first:mt-0",
    )}>
      <div
       
        className={cn(
          "how-to mb-2 px-4 pb-4 md:px-6 relative",
          "bg-background",
          "first:mt-0 last:mb-0",
          "rounded-md",
        )}
      >
        <div className="py-3 relative">
          {title && (
            <>
              <Settings className={cn(
                "rounded-full absolute top-0",
                "text-muted-foreground",
                "md:bg-background md:-inset-s-12 md:w-12 md:h-12 md:p-3 md:my-0",
                "inset-e-0 bg-transparent px-0 my-3 w-6 h-6",
              )}
              />
              <h4 className="text-sm! font-semibold! mb-4! uppercase tracking-tight text-muted-foreground pe-8 md:pe-0">
                {title}
              </h4>
            </>
          )}
          <div className={cn(
            "prose prose-slate max-w-none"
          )}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};
