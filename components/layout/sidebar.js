import * as React from 'react';
import { NavSidebar } from '@/components/layout/nav-sidebar';
import { SidebarContent } from '@/components/ui/sidebar';

export function NavigationSidebar({ ...props }) {
  return (
    <aside
      className="print:hidden hidden md:block bg-background w-[16rem]"
      role="complementary"
      aria-label="Sidebar navigation"
      {...props}
    >
      <div className="sticky top-20 self-start transition-[top] duration-200">
        <div>
          <SidebarContent>
            <NavSidebar />
          </SidebarContent>
        </div>
      </div>
    </aside>
  );
}
