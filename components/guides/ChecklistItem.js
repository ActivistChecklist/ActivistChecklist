'use client';
import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Check, Link2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { MDXRemote } from 'next-mdx-remote';
import Markdown from '../Markdown';
import { Recommendations } from '@/components/guides/Recommendations'
import { IoInformationCircleOutline } from "react-icons/io5";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAnalytics } from '@/hooks/use-analytics';
import { useTranslations } from 'next-intl';
import { migrateLegacyChecklistKeysForSlug } from '@/lib/checklist-storage-migrate';

const TITLE_BADGE_VARIANTS = {
  important: "destructive",
};

const InfoItemIcon = () => {
  const t = useTranslations();
  return (
    <TooltipProvider>
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <div className="absolute inset-s-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2">
            <IoInformationCircleOutline
              className={cn(
                "h-[1.7rem] w-[1.7rem]",
                "text-primary",
                "transition-colors duration-300"
              )}
            />
          </div>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          sideOffset={5}
          className="z-100"
        >
          {t('checklistItem.informationalItem')}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

const CopyLinkButton = ({ slug, onCopy }) => {
  const t = useTranslations();
  const [linkCopied, setLinkCopied] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [linkHref, setLinkHref] = useState(() => `#${slug}`);

  useEffect(() => {
    const pathWithSearch = `${window.location.pathname}${window.location.search}`;
    setLinkHref(`${window.location.origin}${pathWithSearch}#${slug}`);
  }, [slug]);

  const handleCopy = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const pathWithSearch = `${window.location.pathname}${window.location.search}`;
    const url = `${window.location.origin}${pathWithSearch}#${slug}`;
    window.history.replaceState(null, "", `${pathWithSearch}#${slug}`);

    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTooltipOpen(true);
      
      // Call the parent's copy handler if provided
      if (onCopy) {
        onCopy(url);
      }
      
      // Reset after 2 seconds
      setTimeout(() => {
        setLinkCopied(false);
        setTooltipOpen(false);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  };

  return (
    <TooltipProvider>
      <Tooltip delayDuration={0} open={tooltipOpen} onOpenChange={setTooltipOpen}>
        <TooltipTrigger asChild>
          <a
            href={linkHref}
            onClick={handleCopy}
            className={cn(
              "relative inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md align-middle transition-colors duration-200",
              "hover:bg-neutral-200/60",
              "text-neutral-500 hover:text-neutral-700",
              "no-underline",
              "print:hidden",
              linkCopied && "text-green-600"
            )}
            aria-label={t('checklistItem.copyLink')}
          >
            <Link2
              aria-hidden
              className={cn(
                "absolute inset-s-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 transition-opacity duration-200",
                linkCopied && "opacity-0"
              )}
            />
            <Check
              aria-hidden
              className={cn(
                "absolute inset-s-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 text-green-600 transition-opacity duration-200",
                linkCopied ? "opacity-100" : "opacity-0"
              )}
            />
          </a>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={5}>
          {linkCopied ? t('checklistItem.linkCopied') : t('checklistItem.copyLink')}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * ChecklistItem — MDX-backed item (props from frontmatter + serialized body).
 * localStorage keys are slug-based.
 */
const ChecklistItem = ({
  slug: itemSlug,
  title: itemTitle,
  type: itemType,
  why: itemWhy,
  tools: itemTools,
  stop: itemStop,
  titleBadges: itemTitleBadges = [],
  serializedBody,
  bodyComponents,
  expandTrigger,
  index,
  editable = true,
}) => {
  if (!itemSlug) {
    console.warn('ChecklistItem: no slug provided. Skipping');
    return null;
  }

  const [isExpanded, setIsExpanded] = useState(false);
  const [isChecked, setIsChecked] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  const [enableTransitions, setEnableTransitions] = useState(false);
  const { trackEvent } = useAnalytics();
  const t = useTranslations();
  const hasTrackedExpansion = useRef(false);
  const cardRef = useRef(null);
  // Use slug-based keys so progress persists across remigrations (not _uid)
  const storageKey = `checklist-checked-${itemSlug}`;
  const expandedStorageKey = `checklist-expanded-${itemSlug}`;
  const checkedOpacity = 60;

  const setExpandedWithStorage = (expanded) => {
    setIsExpanded(expanded);
    localStorage.setItem(expandedStorageKey, expanded);
  };

  const setCheckedWithStorage = (checked) => {
    setIsChecked(checked);
    localStorage.setItem(storageKey, checked);
  };

  // Track when component has mounted (client-side only)
  // This prevents the browser from scrolling to the hash on initial page load
  // because the id attribute won't be rendered until after mount
  useEffect(() => {
    setHasMounted(true);
    // Enable transitions after a brief delay to allow initial state restoration
    // to happen without animation
    const timer = setTimeout(() => {
      setEnableTransitions(true);
    }, 50);
    return () => clearTimeout(timer);
  }, []);
  
  useEffect(() => {
    migrateLegacyChecklistKeysForSlug(itemSlug);

    // Load checked state
    const stored = localStorage.getItem(storageKey);
    if (stored !== null) {
      setCheckedWithStorage(stored === 'true');
    }

    // Load expanded state
    const storedExpanded = localStorage.getItem(expandedStorageKey);
    if (storedExpanded !== null) {
      setExpandedWithStorage(storedExpanded === 'true');
    }

    // Auto expand items if they've been linked to directly with an anchor in the URL
    // and scroll to them AFTER all items have restored their expanded states
    const checkUrlHash = (shouldScroll = false) => {
      const hash = window.location.hash.slice(1); // Remove the # symbol
      if (hash === itemSlug && !isChecked) {
        setExpandedWithStorage(true);
        
        // Scroll to this item after a delay to allow all other items to restore their states
        // This fixes the issue where other items expanding pushes the target down
        if (shouldScroll && cardRef.current) {
          // Use requestAnimationFrame + setTimeout to ensure DOM has updated
          requestAnimationFrame(() => {
            setTimeout(() => {
              if (cardRef.current) {
                const headerHeight = 80; // Approximate header/nav height buffer
                const cardTop = cardRef.current.getBoundingClientRect().top + window.scrollY;
                const targetScrollPosition = cardTop - headerHeight;
                
                window.scrollTo({
                  top: Math.max(0, targetScrollPosition),
                  behavior: 'smooth'
                });
              }
            }, 100); // Small delay to let layout stabilize (transitions are disabled on initial load)
          });
        }
      }
    };

    // Initial check - with scroll since this is page load
    checkUrlHash(true);

    // Add hash change listener - also scroll on hash change
    const handleHashChange = () => checkUrlHash(true);
    window.addEventListener('hashchange', handleHashChange);

    // Cleanup listener
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [storageKey, expandedStorageKey, itemSlug, isChecked]);

  // Handle expand/collapse trigger
  useEffect(() => {
    if (expandTrigger?.timestamp && !isChecked) {
      setExpandedWithStorage(expandTrigger.shouldExpand);
    }
  }, [expandTrigger, isChecked, expandedStorageKey]);
  
  const toggleExpanded = () => {
    const newExpandedState = !isExpanded;
    setExpandedWithStorage(newExpandedState);
    
    if (newExpandedState && !hasTrackedExpansion.current) {
      trackEvent({
        name: 'checklist_item_expanded',
        data: {
          item_id: itemSlug,
        }
      });
      hasTrackedExpansion.current = true;
    }
  };

  const handleCheckboxChange = async (checked, shouldCollapseAfterDelay = false) => {
    setCheckedWithStorage(checked);

    if (checked) {
      // Track the checkbox being checked
      await trackEvent({
        name: 'checklist_item_checked',
        data: {
          item_id: itemSlug,
        }
      });

      // If requested, collapse after a delay to show completion state briefly
      if (shouldCollapseAfterDelay && isExpanded) {

        // Scroll to keep the collapsed item visible at the top with buffer
        if (cardRef.current) {
          const headerHeight = 80; // Approximate header/nav height buffer
          const cardTop = cardRef.current.getBoundingClientRect().top + window.scrollY;
          const targetScrollPosition = cardTop - headerHeight;
          
          window.scrollTo({
            top: Math.max(0, targetScrollPosition),
            behavior: 'smooth'
          });
        }

        setExpandedWithStorage(false);
      }
    }
  };

  // Add this function to handle link clicks
  const handleLinkClick = (e) => {
    if (e.target.tagName.toLowerCase() === 'a') {
      e.stopPropagation();
    }
  };

  const handleLinkCopy = (url) => {
    // Track the copy event
    trackEvent({
      name: 'checklist_item_link_copied',
      data: {
        item_id: itemSlug,
      }
    });
  };

  return (
    <Card
      ref={cardRef}
      className={cn(
        "checklist-item",
        "transform mb-0 shadow-none bg-none rounded-none border-muted border-b-0 border-e-0 border-s-0 border-t",
        "hover:z-20 relative",
        !isExpanded && !isChecked && "hover:bg-muted/40",
        isExpanded && "mb-4 rounded-lg border-transparent",
        isExpanded && "bg-muted",
        "[transition:margin_300ms,border-radius_300ms,border_300ms,box-shadow_300ms]"
      )}
    >
      <CardHeader 
        className={cn(
          "p-3 ps-3 md:ps-5 cursor-pointer",
          isExpanded && "rounded-t-lg"
        )}
        aria-expanded={isExpanded}
        onClick={toggleExpanded}
        onClickCapture={handleLinkClick}
      >
        <div className="flex gap-3 items-start">
          <div
            className={cn(
              "w-5 h-5 shrink-0 relative",
              itemWhy ? "mt-1" : "mt-0.5"
            )}
          >
            {itemType === 'info' ? (
              <InfoItemIcon />
            ) : (
              <div onClick={(e) => e.stopPropagation()}>
                <Checkbox 
                  checked={isChecked}
                  onCheckedChange={handleCheckboxChange}
                  className={cn(
                    "h-5 w-5 cursor-pointer rounded-sm transition-colors duration-300 border-2",
                  )}
                />
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1 flex flex-col gap-2">
            <div
              className={cn(
                "flex gap-3",
                itemWhy ? "items-start" : "items-start sm:items-center"
              )}
            >
              <div className="min-w-0 flex-1 flex flex-col gap-1">
                <CardTitle 
                  className={cn(
                    "min-w-0",
                    isChecked && "text-muted-foreground",
                    isChecked && `opacity-${checkedOpacity}`,
                  )}
                >
                  <h3
                    className="inline mt-0 text-lg"
                    id={hasMounted ? itemSlug : undefined}
                    data-slug={itemSlug}
                  >
                    {itemTitleBadges && itemTitleBadges.length > 0 && (
                      <>
                        {itemTitleBadges.map((badgeType, index) => {
                          const variant = TITLE_BADGE_VARIANTS[badgeType];
                          if (!variant) return null;

                          return (
                            <Badge
                              key={index}
                              variant={variant}
                              className={cn(
                                "text-xs inline me-2 align-middle",
                                isChecked && "opacity-50"
                              )}
                            >
                              {t('checklistItem.importantBadge')}
                            </Badge>
                          );
                        })}
                      </>
                    )}
                    {itemTitle}
                    <span
                      className={cn(
                        "inline-flex h-7 shrink-0 items-center justify-center align-middle ms-2 print:hidden",
                        isExpanded ? "w-7" : "w-px"
                      )}
                      aria-hidden={!isExpanded}
                    >
                      {isExpanded && (
                        <CopyLinkButton
                          slug={itemSlug}
                          onCopy={handleLinkCopy}
                        />
                      )}
                    </span>
                  </h3>
                </CardTitle>

                <CardDescription 
                  className={cn(
                    isChecked && "text-muted-foreground",
                    isChecked && `opacity-${checkedOpacity}`,
                  )}
                >
                  <Markdown content={itemWhy} isProse={false} />
                </CardDescription>
              </div>

              <span
                className={cn(
                  "hidden sm:inline-flex shrink-0 items-center justify-center",
                  "h-8 w-8 mt-1 rounded-full bg-transparent p-1 hover:bg-primary/15",
                  "text-muted-foreground hover:text-primary",
                  isExpanded && "text-primary",
                  "transition-[background-color,color] duration-300 ease-out",
                  "print:hidden",
                  isChecked && `opacity-${checkedOpacity}`,
                )}
              >
                <span
                  className={cn(
                    "inline-flex size-6 origin-center items-center justify-center transition-transform duration-300 ease-out",
                    isExpanded && "rotate-180",
                  )}
                >
                  <ChevronDown aria-hidden className="h-6 w-6" />
                </span>
              </span>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-expanded={isExpanded}
              aria-controls={`checklist-body-${itemSlug}`}
              className={cn(
                "flex h-9 w-full justify-start gap-2 px-2 sm:hidden",
                "-ms-2",
                "text-muted-foreground hover:bg-primary/10 hover:text-muted-foreground",
                "print:hidden",
                enableTransitions ? "transition-colors duration-300" : "transition-none",
                isChecked && `opacity-${checkedOpacity}`,
              )}
            >
              <span
                className={cn(
                  "inline-flex shrink-0 origin-center transition-transform duration-300 ease-out",
                  isExpanded && "rotate-180",
                )}
              >
                <ChevronDown aria-hidden className="h-4 w-4" />
              </span>
              {isExpanded ? t('checklistItem.collapse') : t('checklistItem.expand')}
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <div
        id={`checklist-body-${itemSlug}`}
        className={cn(
          "grid mt-2",
          enableTransitions ? "transition-all duration-300" : "transition-none",
          isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          isChecked && `opacity-${checkedOpacity}`,
        )}
      >
      <div className="overflow-hidden">
        <div className="ms-4 md:ms-9 ps-0 mb-6">
          <CardContent className={cn(
            "py-0 pt-0 ps-0 md:ps-4 pe-4 md:pe-6",
            "prose prose-slate max-w-none",
            isChecked && "text-muted-foreground"
          )}>
            <Recommendations items={[
              {
                type: "do",
                content: itemTools
              },
              {
                type: "dont",
                content: itemStop
              }
            ]} />
            {serializedBody && (
              <MDXRemote {...serializedBody} components={bodyComponents} />
            )}

            {/* Mark as done button row */}
            {itemType !== 'info' && (
              <div className={cn(
                "pt-4 border-muted-foreground/20",
                "flex flex-col sm:flex-row items-start sm:items-center gap-3",
                "w-full"
              )}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCheckboxChange(!isChecked, !isChecked); // Collapse after delay only when marking as done
                  }}
                  className={cn(
                    "flex items-center justify-center sm:justify-start gap-3 transition-all duration-300",
                    "w-full sm:w-auto sm:min-w-[140px] py-3 sm:py-2",
                    // Primary outline styling for unchecked state
                    !isChecked && "border-primary text-primary hover:bg-primary/10 hover:text-primary hover:border-primary",
                    // Primary filled styling for checked state
                    isChecked && "bg-primary text-primary-foreground border-primary hover:bg-primary/90 hover:border-primary hover:text-primary-foreground"
                  )}
                >
                  <Check className={cn(
                    "h-4 w-4 transition-all duration-300 font-bold stroke-3",
                    // Unchecked state - primary checkmark
                    !isChecked && "text-primary",
                    // Checked state - primary-foreground checkmark
                    isChecked && "text-primary-foreground"
                  )} />
                  {isChecked ? t('checklistItem.completed') : t('checklistItem.markAsDone')}
                </Button>
              </div>
            )}
          </CardContent>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default ChecklistItem;