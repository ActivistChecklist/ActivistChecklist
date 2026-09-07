'use client';
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { ChevronsDown, ChevronsUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RiskLevelBadge } from '@/components/RiskLevel';
import { SectionContext } from '@/contexts/SectionContext';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/** Sticky offset below viewport top — matches `h-14` top nav */
const NAV_TOP_PX = 56;
/**
 * While the big title row’s bottom edge moves from (nav + this) down to `nav`, the hero fades out.
 * No compact bar yet — avoids overlapping the two headers.
 */
const HERO_EXIT_PX = 56;
/**
 * After the title row has fully cleared above the nav line, compact opacity 0→1
 * over this many pixels of additional scroll.
 */
const COMPACT_ENTER_PX = 40;

/**
 * Section — MDX-mode guide section with expand/collapse-all support.
 *
 * Usage in MDX:
 *   <Section slug="digital-security" title="Digital Security" description="...">
 *     <ChecklistItem slug="signal" />
 *     <ChecklistItem slug="browser" />
 *     <!-- or Keystatic repeating group: -->
 *     <ChecklistItemGroup>
 *       <ChecklistItem slug="signal" />
 *       <ChecklistItem slug="browser" />
 *     </ChecklistItemGroup>
 *   </Section>
 *
 * Counts ChecklistItem children (direct or inside ChecklistItemGroup) for Expand/Collapse all.
 */
const Section = ({ slug, title, description, children }) => {
  const [expandTrigger, setExpandTrigger] = useState(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [heroOpacity, setHeroOpacity] = useState(1);
  const [compactOpacity, setCompactOpacity] = useState(0);
  const [dock, setDock] = useState({ left: 0, width: 0 });
  /** Hero: full text below sm; icon-only sm–md; icon + label md+ */
  const [smUp, setSmUp] = useState(false);
  const [mdUp, setMdUp] = useState(false);

  const sectionRef = useRef(null);
  /** Title row only — drives crossfade and scroll math (not description / intro). */
  const titleRowRef = useRef(null);

  const childrenArray = React.Children.toArray(children);

  const isChecklistItemChild = (child) =>
    child?.props?.slug !== undefined || child?.type?.name === 'ChecklistItemMdx';

  const isChecklistItemGroup = (child) => child?.type?.isChecklistItemGroup === true;

  /** Flatten direct ChecklistItems plus items inside `<ChecklistItemGroup>`. */
  const collectChecklistItemElements = (arr) => {
    const out = [];
    arr.forEach((child) => {
      if (isChecklistItemChild(child)) {
        out.push(child);
      } else if (isChecklistItemGroup(child)) {
        React.Children.forEach(child.props.children, (c) => {
          if (isChecklistItemChild(c)) out.push(c);
        });
      }
    });
    return out;
  };

  const triggerExpand = (shouldExpand) => {
    setIsExpanded(shouldExpand);
    setExpandTrigger({ timestamp: Date.now(), shouldExpand });
  };

  const checklistChildren = useMemo(
    () => collectChecklistItemElements(childrenArray),
    [childrenArray]
  );

  const checklistItemCount = checklistChildren.length;

  const sectionIntroChildren = useMemo(
    () =>
      childrenArray.filter((child) => !isChecklistItemChild(child) && !isChecklistItemGroup(child)),
    [childrenArray]
  );

  /** First `<RiskLevel>` in this section (MDX), for the floating header. */
  const sectionRiskLevel = useMemo(() => {
    for (const child of childrenArray) {
      if (React.isValidElement(child) && child.type?.isRiskLevel === true) {
        return child.props.level ?? 'everyone';
      }
    }
    return null;
  }, [childrenArray]);

  const hasChecklist = checklistItemCount >= 1;
  const showExpandAll = checklistItemCount > 1;

  const updateDock = useCallback(() => {
    const main = sectionRef.current?.closest('main');
    if (!main) return;
    const r = main.getBoundingClientRect();
    setDock({ left: r.left, width: r.width });
  }, []);

  useEffect(() => {
    const mqSm = window.matchMedia('(min-width: 640px)');
    const mqMd = window.matchMedia('(min-width: 768px)');
    const sync = () => {
      setSmUp(mqSm.matches);
      setMdUp(mqMd.matches);
    };
    sync();
    mqSm.addEventListener('change', sync);
    mqMd.addEventListener('change', sync);
    return () => {
      mqSm.removeEventListener('change', sync);
      mqMd.removeEventListener('change', sync);
    };
  }, []);

  const onScrollOrResize = useCallback(() => {
    if (!hasChecklist) {
      setHeroOpacity(1);
      setCompactOpacity(0);
      return;
    }
    const sectionEl = sectionRef.current;
    const titleEl = titleRowRef.current;
    if (!sectionEl || !titleEl) return;

    updateDock();

    const sectionRect = sectionEl.getBoundingClientRect();
    const headerRect = titleEl.getBoundingClientRect();

    const pastSection = sectionRect.bottom <= NAV_TOP_PX + 2;
    if (pastSection) {
      setHeroOpacity(1);
      setCompactOpacity(0);
      return;
    }

    const nav = NAV_TOP_PX;
    const bottom = headerRect.bottom;

    // Hero: fades as the title row exits the viewport band below the nav (bottom edge sweeping up).
    let hero = 1;
    if (bottom <= nav) {
      hero = 0;
    } else if (bottom < nav + HERO_EXIT_PX) {
      hero = (bottom - nav) / HERO_EXIT_PX;
    }

    // Compact: only after the title row has cleared above the nav line (no collision with big header).
    let compact = 0;
    if (bottom < nav) {
      const overflow = nav - bottom;
      compact = Math.min(1, overflow / COMPACT_ENTER_PX);
    }

    setHeroOpacity(hero);
    setCompactOpacity(compact);
  }, [hasChecklist, updateDock]);

  useEffect(() => {
    if (!hasChecklist) {
      setHeroOpacity(1);
      setCompactOpacity(0);
      return;
    }
    updateDock();
    onScrollOrResize();
    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize, { passive: true });
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (vv) {
      vv.addEventListener('resize', onScrollOrResize, { passive: true });
      vv.addEventListener('scroll', onScrollOrResize, { passive: true });
    }
    return () => {
      window.removeEventListener('scroll', onScrollOrResize);
      window.removeEventListener('resize', onScrollOrResize);
      if (vv) {
        vv.removeEventListener('resize', onScrollOrResize);
        vv.removeEventListener('scroll', onScrollOrResize);
      }
    };
  }, [hasChecklist, onScrollOrResize, updateDock]);

  /** Sticky compact bar: all viewports (was md+ only; phones need it too). */
  const useFloating = hasChecklist;

  const expandTooltipLabel = isExpanded ? 'Collapse all' : 'Expand all';

  return (
    <SectionContext.Provider value={{ expandTrigger, triggerExpand }}>
      <TooltipProvider delayDuration={400}>
      <section ref={sectionRef} className="relative">
        {useFloating && (
          <div
            className={cn(
              'print:hidden fixed z-40',
              'border-b bg-background/95 backdrop-blur-sm supports-backdrop-filter:bg-background/90',
              'transition-[opacity,transform] duration-200 ease-out',
            )}
            style={{
              top: NAV_TOP_PX,
              left: dock.left,
              width: dock.width,
              opacity: compactOpacity,
              transform: compactOpacity > 0.04 ? 'translateY(0)' : 'translateY(-8px)',
              pointerEvents: compactOpacity > 0.08 ? 'auto' : 'none',
            }}
          >
            <div className="flex items-center justify-between gap-2 px-4 py-3 sm:gap-3 sm:px-5 sm:py-3.5">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <p className="text-base font-semibold tracking-tight text-foreground truncate m-0" aria-hidden="true">
                  {title}
                </p>
                {sectionRiskLevel != null && (
                  <span aria-hidden className="inline-flex shrink-0">
                    <RiskLevelBadge
                      level={sectionRiskLevel}
                      showLabel={mdUp}
                      className="me-0! shrink-0"
                    />
                  </span>
                )}
              </div>
              {showExpandAll &&
                (mdUp ? (
                  <Button
                    type="button"
                    variant="defaultOutline"
                    size="sm"
                    className="h-8 shrink-0 gap-2 px-3"
                    onClick={() => triggerExpand(!isExpanded)}
                  >
                    {isExpanded ? (
                      <ChevronsUp className="size-4 shrink-0" aria-hidden />
                    ) : (
                      <ChevronsDown className="size-4 shrink-0" aria-hidden />
                    )}
                    <span>{expandTooltipLabel}</span>
                  </Button>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="defaultOutline"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => triggerExpand(!isExpanded)}
                        aria-label={isExpanded ? 'Collapse all checklist items in this section' : 'Expand all checklist items in this section'}
                      >
                        {isExpanded ? (
                          <ChevronsUp className="size-4" aria-hidden />
                        ) : (
                          <ChevronsDown className="size-4" aria-hidden />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" align="end">
                      {expandTooltipLabel}
                    </TooltipContent>
                  </Tooltip>
                ))}
            </div>
          </div>
        )}

        <div className="mb-4 prose prose-slate max-w-none">
          <div
            ref={titleRowRef}
            className="transition-opacity duration-200 ease-out"
            style={useFloating ? { opacity: heroOpacity } : undefined}
          >
            <div className="relative flex flex-col sm:block">
              <h2
                id={slug}
                className={
                  showExpandAll
                    ? mdUp
                      ? 'sm:pe-12 md:pe-[12.5rem]'
                      : 'sm:pe-12'
                    : ''
                }
              >
                {title}
              </h2>
              {showExpandAll &&
                (!smUp ? (
                  <Button
                    type="button"
                    variant="defaultOutline"
                    size="sm"
                    className="print:hidden max-sm:w-full sm:w-fit sm:absolute sm:bottom-0 sm:inset-e-0 mt-2 sm:mt-0 sm:shrink-0"
                    onClick={() => triggerExpand(!isExpanded)}
                  >
                    {expandTooltipLabel}
                  </Button>
                ) : mdUp ? (
                  <Button
                    type="button"
                    variant="defaultOutline"
                    size="sm"
                    className="print:hidden max-sm:w-full sm:absolute sm:bottom-0 sm:inset-e-0 mt-2 sm:mt-0 sm:shrink-0 sm:flex sm:gap-2 sm:items-center"
                    onClick={() => triggerExpand(!isExpanded)}
                  >
                    {isExpanded ? (
                      <ChevronsUp className="size-4 shrink-0" aria-hidden />
                    ) : (
                      <ChevronsDown className="size-4 shrink-0" aria-hidden />
                    )}
                    <span>{expandTooltipLabel}</span>
                  </Button>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="defaultOutline"
                        size="icon"
                        className="print:hidden max-sm:w-full sm:absolute sm:bottom-0 sm:inset-e-0 mt-2 sm:mt-0 sm:h-8 sm:w-8 sm:shrink-0"
                        aria-label={isExpanded ? 'Collapse all checklist items in this section' : 'Expand all checklist items in this section'}
                        onClick={() => triggerExpand(!isExpanded)}
                      >
                        {isExpanded ? (
                          <ChevronsUp className="size-4" aria-hidden />
                        ) : (
                          <ChevronsDown className="size-4" aria-hidden />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" align="end">
                      {expandTooltipLabel}
                    </TooltipContent>
                  </Tooltip>
                ))}
            </div>
          </div>
          {description && (
            <div className="mt-2">
              <p>{description}</p>
            </div>
          )}
          {sectionIntroChildren.length > 0 && (
            <div className={description ? 'mt-2' : ''}>
              {sectionIntroChildren}
            </div>
          )}
        </div>
        {checklistChildren}
      </section>
      </TooltipProvider>
    </SectionContext.Provider>
  );
};

export default Section;
