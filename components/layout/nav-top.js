'use client';
import * as React from "react"
import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { Sheet, SheetTrigger, SheetContent } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Menu } from "lucide-react"
import Search from "@/components/Search"
import LanguageSwitcher from "@/components/LanguageSwitcher"
import { DarkModeToggle } from "@/components/layout/DarkModeToggle"
import { navigationConfig, isNavItemActive, isSubItemActive } from "@/config/navigation"
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  NavigationMenuContent,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu"
import { cn } from "@/lib/utils"
import { createIntlTranslator, translateMainNavigation } from "@/lib/navigation-i18n"

const TopNav = ({ hideOnScroll = false, maxWidth }) => {
  const pathname = usePathname()
  const t = useTranslations()
  const [prevScrollPos, setPrevScrollPos] = useState(0);
  const [visible, setVisible] = useState(true);

  const translateText = createIntlTranslator(t);

  const translatedMainNav = translateMainNavigation(navigationConfig.mainNav, translateText);

  useEffect(() => {
    if (!hideOnScroll) {
      setVisible(true);
      return;
    }

    const handleScroll = () => {
      const currentScrollPos = window.scrollY;
      const isScrollingDown = prevScrollPos < currentScrollPos;
      const isScrolledPastThreshold = currentScrollPos > 10;

      setVisible(!isScrollingDown || !isScrolledPastThreshold);
      setPrevScrollPos(currentScrollPos);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [prevScrollPos, hideOnScroll]);

  return (
    <>
      {/* If printing, show the logo */}
      <div className="hidden print:block print:relative">
        <Image
          className="print:absolute print:top-0 print:right-0 dark:hidden"
          src={navigationConfig.logo.image}
          alt={navigationConfig.logo.ariaLabel}
          width={250}
          height={20}
        />
        <Image
          className="print:absolute print:top-0 print:right-0 hidden dark:block"
          src="/images/logo-bg-white-transparent.png"
          alt={navigationConfig.logo.ariaLabel}
          width={250}
          height={20}
        />
      </div>
      <header className={cn(
        "sticky top-0 w-full border-b bg-background text-foreground z-50",
        hideOnScroll ? 'transition-transform duration-300' : '',
        visible ? 'translate-y-0' : '-translate-y-full',
        "print:hidden",
      )}>
        {/* Normal top nav bar */}
        <div className={cn(
          maxWidth,
          "mx-auto px-4",
        )}>
          <div className="flex h-14 items-center justify-between">
            <div className="flex items-center">
              <Sheet>
                <SheetTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="md:hidden mr-2 text-foreground hover:text-foreground/80"
                    aria-label="Open navigation menu"
                  >
                    <Menu className="h-6 w-6" aria-hidden="true" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left">
                  <nav className="flex flex-col mt-6">
                    {translatedMainNav.map((item) => (
                      item.type === "link" ? (
                        <Link 
                          key={item.key} 
                          href={item.href} 
                          className={cn(
                            "text-lg font-semibold border-l-2 border-l-transparent hover:border-l-foreground/20 pl-2",
                            isNavItemActive(item, pathname) && "border-primary"
                          )}
                        >
                          {item.label}
                        </Link>
                      ) : (
                        <div key={item.key} className="space-y-2">
                          <Link 
                            href={item.href || '#'} 
                            className={cn(
                              "block text-lg font-semibold pl-2 border-l-2 border-l-transparent hover:border-l-foreground/20",
                              isNavItemActive(item, pathname) && "border-link text-link"
                            )}
                          >
                            {item.label}
                          </Link>
                          {item.items.map((subItem) => (
                            <Link
                              key={subItem.key}
                              href={subItem.href}
                              className={cn(
                                "flex items-center gap-2 pl-4 py-1 text-md border-l-2 border-l-transparent hover:border-l-foreground/20",
                                isSubItemActive(subItem, pathname) && "border-link font-bold text-link"
                              )}
                            >
                              {subItem.icon && <subItem.icon className="h-4 w-4" />}
                              {subItem.title}
                            </Link>
                          ))}
                          {item.items.length > 0 && item.key === "security-checklists" && (
                            <Link
                              href="/checklists/"
                              className={cn(
                                "flex items-center gap-2 pl-4 py-2 text-md border-l-2 border-l-transparent hover:border-l-foreground/20 text-muted-foreground group",
                                item.footerLink?.className
                              )}
                            >
                              {item.footerLink?.title || "Browse all checklists"}
                              {item.footerLink?.icon && (
                                <item.footerLink.icon className={item.footerLink.iconClassName} />
                              )}
                            </Link>
                          )}
                        </div>
                      )
                    ))}
                  </nav>
                  <div className="pt-4 border-t mt-4 flex items-center gap-2">
                    <Search variant="searchbar" />
                    <DarkModeToggle />
                  </div>
                </SheetContent>
              </Sheet>
              <Link 
                href={navigationConfig.logo.href} 
                className="flex items-center space-x-2 ml-0 font-bold text-xl" 
                aria-label={navigationConfig.logo.ariaLabel}
              >
                <Image src={navigationConfig.logo.image} alt={navigationConfig.logo.ariaLabel} width={250} height={20} className="dark:hidden" />
                <Image src="/images/logo-bg-white-transparent.png" alt={navigationConfig.logo.ariaLabel} width={250} height={20} className="hidden dark:block" />
              </Link>
            </div>
            <div className="flex items-center gap-4">
              <div className="hidden md:flex items-center space-x-4">
                <NavigationMenu>
                  <NavigationMenuList>
                    {translatedMainNav.map((item, mainIndex) => (
                      <NavigationMenuItem key={`desktop-${item.label}-${mainIndex}`}>
                        {item.type === "dropdown" ? (
                          <>
                            <NavigationMenuTrigger
                              className={cn(
                                "px-4 py-2 h-auto",
                                isNavItemActive(item, pathname) && "text-link font-bold"
                              )}
                            >
                              {item.label}
                            </NavigationMenuTrigger>
                            <NavigationMenuContent>
                              <ul className={cn(
                                "grid w-[400px] gap-3 p-4",
                                (item.columns === 2)
                                  ? "md:w-[500px] md:grid-cols-2"
                                  : "md:w-[200px]"
                              )}>
                                {item.items.map((subItem) => (
                                  <li key={subItem.key}>
                                    <NavigationMenuLink asChild>
                                      <Link
                                        href={subItem.href}
                                        className={cn(
                                          "block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-hidden transition-colors hover:bg-muted hover:text-link focus:bg-muted focus:text-link",
                                          isSubItemActive(subItem, pathname) && "bg-muted"
                                        )}
                                      >
                                        <div className="flex items-center gap-2">
                                          {subItem.icon && <subItem.icon className="h-4 w-4" />}
                                          <div className="text-sm font-medium leading-none">{subItem.title}</div>
                                        </div>
                                        {subItem.description && (
                                          <p className="line-clamp-2 text-sm leading-snug text-muted-foreground">
                                            {subItem.description}
                                          </p>
                                        )}
                                      </Link>
                                    </NavigationMenuLink>
                                  </li>
                                ))}
                                {item.footerLink && (
                                  <li className={cn(
                                    "col-span-1",
                                    item.footerLink.type === "full-width" && item.items.length % 2 === 0 ? "md:col-span-2" : ""
                                  )}>
                                    <NavigationMenuLink asChild>
                                      <Link
                                        href={item.footerLink.href}
                                        className={cn(
                                          "block select-none rounded-md p-2 no-underline outline-hidden transition-colors hover:bg-muted hover:text-link focus:bg-muted focus:text-link text-center",
                                          item.footerLink.type === "full-width" && item.items.length % 2 === 0 ? "bg-muted" : "bg-muted h-full flex items-center justify-center",
                                          item.footerLink.className
                                        )}
                                      >
                                        <div className="text-sm font-medium flex items-center justify-center w-full gap-2">
                                          {item.footerLink.title}
                                          {item.footerLink.icon && (
                                            <item.footerLink.icon className={item.footerLink.iconClassName} />
                                          )}
                                        </div>
                                      </Link>
                                    </NavigationMenuLink>
                                  </li>
                                )}
                              </ul>
                            </NavigationMenuContent>
                          </>
                        ) : (
                          <NavigationMenuLink asChild className={navigationMenuTriggerStyle()}>
                            <Link href={item.href}>
                              {item.label}
                            </Link>
                          </NavigationMenuLink>
                        )}
                      </NavigationMenuItem>
                    ))}
                  </NavigationMenuList>
                </NavigationMenu>
              </div>
              <div className="flex items-center gap-2">
                {navigationConfig.socialLinks?.map((social) => (
                  <a
                    key={social.key}
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={social.ariaLabel}
                    className="text-foreground/70 hover:text-foreground transition-colors"
                  >
                    <social.icon className="h-5 w-5" aria-hidden="true" />
                  </a>
                ))}
                <Search variant="button" />
                <LanguageSwitcher />
              </div>
            </div>
          </div>
        </div>
      </header>
    </>
  )
}

export default TopNav
