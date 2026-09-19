"use client"

import * as React from "react"
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible"
import { cn } from "@/lib/utils"

const Collapsible = CollapsiblePrimitive.Root

// The review-comments annotator (recogito) calls preventDefault() on clicks that
// aren't inside a `.not-annotatable` element. Radix's composeEventHandlers then
// skips the trigger's toggle handler because event.defaultPrevented is already
// true, so collapsibles won't open while review comments are enabled. Marking the
// trigger not-annotatable is the library's intended opt-out and is a no-op (just
// an unused class) when review comments are off.
const CollapsibleTrigger = React.forwardRef(({ className, ...props }, ref) => (
  <CollapsiblePrimitive.CollapsibleTrigger
    ref={ref}
    className={cn("not-annotatable", className)}
    {...props}
  />
))
CollapsibleTrigger.displayName = CollapsiblePrimitive.CollapsibleTrigger.displayName

const CollapsibleContent = CollapsiblePrimitive.CollapsibleContent

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
