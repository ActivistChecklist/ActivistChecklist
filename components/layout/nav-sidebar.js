"use client"

import React from "react"
import { usePathname } from "next/navigation"
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { navigationConfig, findActiveSection, isSubItemActive } from "@/config/navigation"
import { cn } from "@/lib/utils"
import Link from "next/link"


export function NavSidebar() {
  const pathname = usePathname()
  
  // Find the current section based on the pathname
  const currentSection = findActiveSection(pathname)

  // If we're in a section with items, show those items
  const items = currentSection?.items || []
  const hasItems = items.length > 0

  if (!hasItems) {
    return null
  }

  return (
    <SidebarGroup>
      <SidebarMenu>
        {items.map((item) => (
          <SidebarMenuItem key={item.key}>
            <SidebarMenuButton 
              asChild 
              size="lg" 
              className={cn(
                "font-normal relative pl-4 py-0 border-l-2 border-l-transparent hover:border-l-foreground/20",
                "transition-all duration-200",
                "hover:bg-accent rounded-l-none rounded-r-lg h-10 my-0",
                isSubItemActive(item, pathname) && "border-link font-bold text-link hover:text-link hover:border-link"
              )}
            >
              <Link href={item.href}>
                {item.title}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}
