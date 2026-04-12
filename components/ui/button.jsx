import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "button inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        defaultOutline: "border-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        destructiveOutline: "border-2 border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        secondaryOutline: "border-2 border-secondary text-secondary hover:bg-secondary hover:text-secondary-foreground",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        ghostOutline: "border-2 border-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        muted: "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground dark:border dark:border-border dark:text-foreground",
      },
      size: {
        sm: "h-8 rounded-md px-3",
        default: "h-10 px-4 py-2",
        lg: "h-11 rounded-md px-8",
        xl: "px-8 py-4 rounded-lg text-lg font-semibold [&_svg]:size-6",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  return (
    (<Comp
      className={cn(buttonVariants({ variant, size }), className)}
      ref={ref}
      {...props} />)
  );
})
Button.displayName = "Button"

export { Button, buttonVariants }
