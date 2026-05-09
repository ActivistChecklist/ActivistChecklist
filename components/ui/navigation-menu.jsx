'use client';
import * as React from "react"
import * as NavigationMenuPrimitive from "@radix-ui/react-navigation-menu"
import { cva } from "class-variance-authority"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"

const NavigationMenuContext = React.createContext(null)

const NavigationMenu = React.forwardRef(({ className, children, ...props }, ref) => {
  const [activeItemRect, setActiveItemRect] = React.useState(null)
  const [isHovered, setIsHovered] = React.useState(false)
  const [isMobile, setIsMobile] = React.useState(false)
  const menuRef = React.useRef(null)
  
  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.matchMedia('(hover: none)').matches);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <NavigationMenuContext.Provider value={{ activeItemRect, setActiveItemRect, menuRef, isHovered, setIsHovered, isMobile }}>
      <NavigationMenuPrimitive.Root
        ref={(node) => {
          menuRef.current = node
          if (typeof ref === 'function') ref(node)
          else if (ref) ref.current = node
        }}
        className={cn(
          "relative z-10 flex max-w-max flex-1 items-center justify-center",
          className
        )}
        delayDuration={100}
        skipDelayDuration={0}
        onMouseLeave={() => !isMobile && setIsHovered(false)}
        {...props}>
        {children}
        <NavigationMenuViewport />
      </NavigationMenuPrimitive.Root>
    </NavigationMenuContext.Provider>
  )
})
NavigationMenu.displayName = NavigationMenuPrimitive.Root.displayName

const NavigationMenuList = React.forwardRef(({ className, ...props }, ref) => (
  <NavigationMenuPrimitive.List
    ref={ref}
    className={cn(
      "group flex flex-1 list-none items-center justify-center gap-1",
      className
    )}
    {...props} />
))
NavigationMenuList.displayName = NavigationMenuPrimitive.List.displayName

const NavigationMenuItem = NavigationMenuPrimitive.Item

const navigationMenuTriggerStyle = cva(
  "group inline-flex h-10 w-max items-center justify-center rounded-md bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted hover:text-primary focus:bg-muted focus:text-primary focus:outline-hidden disabled:pointer-events-none disabled:opacity-50 data-active:bg-muted/50 data-[state=open]:bg-muted/50"
)

const NavigationMenuTrigger = React.forwardRef(({ className, children, ...props }, ref) => {
  const triggerRef = React.useRef(null)
  const { setActiveItemRect, menuRef, setIsHovered, isMobile } = React.useContext(NavigationMenuContext)
  
  const updatePosition = React.useCallback(() => {
    if (triggerRef.current && menuRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect()
      const menuRect = menuRef.current.getBoundingClientRect()
      
      setActiveItemRect({
        left: triggerRect.left - menuRect.left + (triggerRect.width / 2),
      })
    }
  }, [setActiveItemRect])

  return (
    <NavigationMenuPrimitive.Trigger
      ref={(node) => {
        triggerRef.current = node
        if (typeof ref === 'function') ref(node)
        else if (ref) ref.current = node
      }}
      className={cn(navigationMenuTriggerStyle(), "group", className)}
      onMouseEnter={(e) => {
        if (!isMobile) {
          setIsHovered(true);
          updatePosition(e);
        }
      }}
      onClick={(e) => {
        // On desktop, prevent click from toggling menu closed when user
        // hovers (opens menu) then clicks reflexively
        if (!isMobile) {
          e.preventDefault();
          e.stopPropagation();
        }
        props.onClick?.(e);
      }}
      {...props}>
      {children}{" "}
      <ChevronDown
        className="relative top-px ms-1 h-3 w-3 transition duration-200 group-data-[state=open]:rotate-180"
        aria-hidden="true" />
    </NavigationMenuPrimitive.Trigger>
  )
})
NavigationMenuTrigger.displayName = NavigationMenuPrimitive.Trigger.displayName

const NavigationMenuContent = React.forwardRef(({ className, ...props }, ref) => (
  <NavigationMenuPrimitive.Content
    ref={ref}
    className={cn(
      "inset-s-0 top-0 w-full data-[motion^=from-]:animate-in data-[motion^=to-]:animate-out data-[motion^=from-]:fade-in data-[motion^=to-]:fade-out data-[motion=from-end]:slide-in-from-right-52 data-[motion=from-start]:slide-in-from-left-52 data-[motion=to-end]:slide-out-to-right-52 data-[motion=to-start]:slide-out-to-left-52 [dir=rtl]:data-[motion=from-end]:slide-in-from-left-52 [dir=rtl]:data-[motion=from-start]:slide-in-from-right-52 [dir=rtl]:data-[motion=to-end]:slide-out-to-left-52 [dir=rtl]:data-[motion=to-start]:slide-out-to-right-52 md:absolute md:w-auto ",
      className
    )}
    {...props} />
))
NavigationMenuContent.displayName = NavigationMenuPrimitive.Content.displayName

const NavigationMenuLink = NavigationMenuPrimitive.Link

const NavigationMenuViewport = React.forwardRef(({ className, ...props }, ref) => {
  const { activeItemRect } = React.useContext(NavigationMenuContext)
  const viewportStyle = React.useMemo(() => {
    if (!activeItemRect) return {}
    
    return {
      insetInlineStart: `${activeItemRect.left}px`,
      transform: `translateX(-50%)`,
      transition: 'all 0.15s ease'
    }
  }, [activeItemRect])

  return (
    <div className={cn("absolute inset-s-0 top-full flex justify-center")} style={viewportStyle}>
      <NavigationMenuPrimitive.Viewport
        className={cn(
          "origin-top-center relative mt-1.5 h-(--radix-navigation-menu-viewport-height) w-full overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-90 md:w-(--radix-navigation-menu-viewport-width)",
          className
        )}
        ref={ref}
        {...props} />
    </div>
  )
})
NavigationMenuViewport.displayName =
  NavigationMenuPrimitive.Viewport.displayName

const NavigationMenuIndicator = React.forwardRef(({ className, ...props }, ref) => (
  <NavigationMenuPrimitive.Indicator
    ref={ref}
    className={cn(
      "top-full z-1 flex h-1.5 items-end justify-center overflow-hidden data-[state=visible]:animate-in data-[state=hidden]:animate-out data-[state=hidden]:fade-out data-[state=visible]:fade-in",
      className
    )}
    {...props}>
    <div
      className="relative top-[60%] h-2 w-2 rotate-45 rounded-tl-sm bg-border shadow-md" />
  </NavigationMenuPrimitive.Indicator>
))
NavigationMenuIndicator.displayName =
  NavigationMenuPrimitive.Indicator.displayName

export {
  navigationMenuTriggerStyle,
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuContent,
  NavigationMenuTrigger,
  NavigationMenuLink,
  NavigationMenuIndicator,
  NavigationMenuViewport,
}
