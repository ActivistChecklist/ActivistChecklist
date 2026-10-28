'use client';
import * as React from 'react';
import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import Link from '@/components/Link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Sheet, SheetTrigger, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Menu } from 'lucide-react';
import Search from '@/components/Search';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { DarkModeToggle } from '@/components/layout/DarkModeToggle';
import { navigationConfig, isNavItemActive, isSubItemActive } from '@/config/navigation';
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  NavigationMenuContent,
  navigationMenuTriggerStyle,
} from '@/components/ui/navigation-menu';
import { cn } from '@/lib/utils';
import { createIntlTranslator, translateMainNavigation } from '@/lib/navigation-i18n';
import ChecklistsMenu from '@/components/layout/ChecklistsMenu';

// The logo's natural width (the <Image> width below).
const LOGO_WIDTH = 250;
// The logo stops shrinking here (md:min-w-[8rem] on its link); past it the
// desktop nav folds into the menu button instead.
const LOGO_MIN_REM = 8;
// The header search box (w-52 in Search.js) and the icon it turns into (w-9).
const SEARCH_BOX_REM = 13;
const SEARCH_ICON_REM = 2.25;

/**
 * Fit the header to the room its labels actually need, not to fixed
 * breakpoints: nav labels vary a lot by language (the Japanese nav is about
 * 40% wider than the English one). The search box turns into an icon as soon
 * as the logo can't have its full width. If the logo would still drop below its
 * minimum, the desktop nav folds into the menu button. A folded nav stays
 * rendered (invisible and out of flow) so its width can still be measured.
 * Until this runs, the server-rendered header uses the md/lg breakpoints.
 */
function useHeaderFit() {
  const rowRef = useRef(null);
  const navRef = useRef(null);
  const toolsRef = useRef(null);
  const [fit, setFit] = useState({ searchCompact: false, navFits: true });

  // Layout effect, so the first hydrated frame is already the measured layout.
  useLayoutEffect(() => {
    const row = rowRef.current;
    const nav = navRef.current;
    const tools = toolsRef.current;
    if (!row || !nav || !tools) return;

    const gapOf = (el) => parseFloat(getComputedStyle(el).columnGap) || 0;
    const check = () => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const iconWidth = SEARCH_ICON_REM * rem;
      // If the box is showing, count it as the icon.
      const boxWidth = tools.querySelector('[data-search-box]')?.offsetWidth || 0;
      // Everything right of the logo, with the search as an icon. The tools'
      // parent holds the nav and the tools, so its gap sits between them.
      const navAndTools =
        gapOf(row) +
        nav.offsetWidth +
        gapOf(tools.parentElement) +
        tools.offsetWidth -
        (boxWidth ? boxWidth - iconWidth : 0);
      const searchCompact =
        LOGO_WIDTH + navAndTools + (SEARCH_BOX_REM * rem - iconWidth) > row.clientWidth;
      const navFits = LOGO_MIN_REM * rem + navAndTools <= row.clientWidth;
      setFit((prev) =>
        prev.searchCompact === searchCompact && prev.navFits === navFits
          ? prev
          : { searchCompact, navFits },
      );
    };

    const observer = new ResizeObserver(check);
    [row, nav, tools].forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return { ...fit, rowRef, navRef, toolsRef };
}

const TopNav = ({ hideOnScroll = false, maxWidth }) => {
  const pathname = usePathname();
  const t = useTranslations();
  const [prevScrollPos, setPrevScrollPos] = useState(0);
  const [visible, setVisible] = useState(true);
  const { searchCompact, navFits, rowRef, navRef, toolsRef } = useHeaderFit();

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
      <header
        className={cn(
          'not-annotatable',
          'sticky top-0 w-full border-b bg-background text-foreground z-50',
          hideOnScroll ? 'transition-transform duration-300' : '',
          visible ? 'translate-y-0' : '-translate-y-full',
          'print:hidden',
        )}
      >
        {/* Normal top nav bar */}
        <div className={cn(maxWidth, 'mx-auto px-4')}>
          <div ref={rowRef} className="flex h-14 items-center justify-between gap-2">
            <div className="flex items-center">
              <Sheet>
                <SheetTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      'mr-2 text-foreground hover:text-foreground/80',
                      navFits && 'md:hidden',
                    )}
                    aria-label="Open navigation menu"
                  >
                    <Menu className="h-6 w-6" aria-hidden="true" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="overflow-y-auto">
                  <SheetTitle className="sr-only">Navigation</SheetTitle>
                  <div className="flex items-center gap-2 pr-10 mb-6">
                    {navigationConfig.socialLinks?.map((social) => (
                      <a
                        key={social.key}
                        href={social.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={t(`footer.social.${social.key}AriaLabel`)}
                        className="inline-flex items-center justify-center h-9 w-9 rounded-md text-foreground/70 hover:text-foreground hover:bg-muted transition-colors"
                      >
                        <social.icon className="h-5 w-5" aria-hidden="true" />
                      </a>
                    ))}
                    <Search />
                    <LanguageSwitcher />
                    <DarkModeToggle className="h-9 w-9 hover:bg-muted" />
                  </div>
                  <nav className="flex flex-col">
                    {translatedMainNav.map((item) =>
                      item.type === 'link' ? (
                        <Link
                          key={item.key}
                          href={item.href}
                          className={cn(
                            'text-lg font-semibold border-l-2 border-l-transparent hover:border-l-foreground/20 pl-2 py-2',
                            isNavItemActive(item, pathname) && 'border-primary',
                          )}
                        >
                          {item.label}
                        </Link>
                      ) : (
                        <div key={item.key} className="space-y-2">
                          <Link
                            href={item.href || '#'}
                            className={cn(
                              'block text-lg font-semibold pl-2 py-2 border-l-2 border-l-transparent hover:border-l-foreground/20',
                              isNavItemActive(item, pathname) && 'border-link text-link',
                            )}
                          >
                            {item.label}
                          </Link>
                          {item.key === 'checklists' ? (
                            <ChecklistsMenu
                              variant="mobile"
                              pathname={pathname}
                              footerLink={item.footerLink}
                            />
                          ) : (
                            item.items.map((subItem) => (
                              <Link
                                key={subItem.key}
                                href={subItem.href}
                                className={cn(
                                  'flex items-center gap-2 pl-4 py-1 text-md border-l-2 border-l-transparent hover:border-l-foreground/20',
                                  isSubItemActive(subItem, pathname) &&
                                    'border-link font-bold text-link',
                                )}
                              >
                                {subItem.icon && <subItem.icon className="h-4 w-4" />}
                                {subItem.title}
                              </Link>
                            ))
                          )}
                        </div>
                      ),
                    )}
                  </nav>
                </SheetContent>
              </Sheet>
              <Link
                href={navigationConfig.logo.href}
                className="flex items-center space-x-2 ml-0 font-bold text-xl md:min-w-[8rem]"
                aria-label={navigationConfig.logo.ariaLabel}
              >
                <Image
                  src={navigationConfig.logo.image}
                  alt={navigationConfig.logo.ariaLabel}
                  width={LOGO_WIDTH}
                  height={30}
                  className="dark:hidden"
                />
                <Image
                  src="/images/logo-bg-white-transparent.png"
                  alt={navigationConfig.logo.ariaLabel}
                  width={LOGO_WIDTH}
                  height={30}
                  className="hidden dark:block"
                />
              </Link>
            </div>
            <div className="flex items-center gap-4">
              <div
                ref={navRef}
                inert={!navFits}
                className={cn(
                  'hidden md:flex items-center space-x-4',
                  !navFits && 'md:invisible md:absolute md:top-0 md:right-0',
                )}
              >
                <NavigationMenu>
                  <NavigationMenuList>
                    {translatedMainNav.map((item, mainIndex) => (
                      <NavigationMenuItem key={`desktop-${item.label}-${mainIndex}`}>
                        {item.type === 'dropdown' ? (
                          <>
                            <NavigationMenuTrigger
                              className={cn(
                                'px-4 py-2 h-auto',
                                isNavItemActive(item, pathname) && 'text-link font-bold',
                              )}
                            >
                              {item.label}
                            </NavigationMenuTrigger>
                            <NavigationMenuContent>
                              {item.key === 'checklists' ? (
                                <ChecklistsMenu pathname={pathname} footerLink={item.footerLink} />
                              ) : (
                                <ul
                                  className={cn(
                                    'grid w-[400px] gap-3 p-4',
                                    item.columns === 2
                                      ? 'md:w-[500px] md:grid-cols-2'
                                      : 'md:w-[260px]',
                                  )}
                                >
                                  {item.items.map((subItem) => (
                                    <li key={subItem.key}>
                                      <NavigationMenuLink asChild>
                                        <Link
                                          href={subItem.href}
                                          className={cn(
                                            'block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-hidden transition-colors hover:bg-muted hover:text-link focus:bg-muted focus:text-link',
                                            isSubItemActive(subItem, pathname) && 'bg-muted',
                                          )}
                                        >
                                          <div className="flex items-center gap-2">
                                            {subItem.icon && <subItem.icon className="h-4 w-4" />}
                                            <div className="text-sm font-medium leading-none">
                                              {subItem.title}
                                            </div>
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
                                    <li
                                      className={cn(
                                        'col-span-1',
                                        item.footerLink.type === 'full-width' &&
                                          item.items.length % 2 === 0
                                          ? 'md:col-span-2'
                                          : '',
                                      )}
                                    >
                                      <NavigationMenuLink asChild>
                                        <Link
                                          href={item.footerLink.href}
                                          className={cn(
                                            'block select-none rounded-md p-2 no-underline outline-hidden transition-colors hover:bg-muted hover:text-link focus:bg-muted focus:text-link text-center',
                                            item.footerLink.type === 'full-width' &&
                                              item.items.length % 2 === 0
                                              ? 'bg-muted'
                                              : 'bg-muted h-full flex items-center justify-center',
                                            item.footerLink.className,
                                          )}
                                        >
                                          <div className="text-sm font-medium flex items-center justify-center w-full gap-2">
                                            {item.footerLink.title}
                                            {item.footerLink.icon && (
                                              <item.footerLink.icon
                                                className={item.footerLink.iconClassName}
                                              />
                                            )}
                                          </div>
                                        </Link>
                                      </NavigationMenuLink>
                                    </li>
                                  )}
                                </ul>
                              )}
                            </NavigationMenuContent>
                          </>
                        ) : (
                          <NavigationMenuLink asChild className={navigationMenuTriggerStyle()}>
                            <Link href={item.href}>{item.label}</Link>
                          </NavigationMenuLink>
                        )}
                      </NavigationMenuItem>
                    ))}
                  </NavigationMenuList>
                </NavigationMenu>
              </div>
              <div ref={toolsRef} className="flex items-center md:gap-2">
                <Search variant="header" compact={searchCompact} />
                <LanguageSwitcher />
                <DarkModeToggle className="h-9 w-9 hover:bg-muted" />
              </div>
            </div>
          </div>
        </div>
      </header>
    </>
  );
};

export default TopNav;
