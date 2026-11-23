'use client';
import React, { useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import styles from '../styles/RiskLevel.module.css';

const LEVEL_CONFIG = {
  everyone: {
    dots: 1,
    label: 'riskLevel.everyoneLabel',
    defaultText: 'riskLevel.everyoneDefault',
    tone: styles.badgeToneEveryone,
  },
  medium: {
    dots: 2,
    label: 'riskLevel.mediumLabel',
    defaultText: 'riskLevel.mediumDefault',
    tone: styles.badgeToneMedium,
  },
  high: {
    dots: 3,
    label: 'riskLevel.highLabel',
    defaultText: 'riskLevel.highDefault',
    tone: styles.badgeToneHigh,
  },
};

/** The order the key lists the levels in, lowest risk first. */
const LEVEL_KEYS = ['everyone', 'medium', 'high'];

/** Mouse hover delays for the desktop popover, in ms. Opening matches the section tooltips. */
const HOVER_OPEN_MS = 400;
const HOVER_CLOSE_MS = 200;

/** Map MDX `level` values to LEVEL_CONFIG keys (same rules as the main callout). */
function resolveLevelKey(level) {
  const n = (level || 'everyone').toLowerCase().replace(/-|\s/g, '_');
  if (Object.hasOwn(LEVEL_CONFIG, n)) return n;
  if (n.includes('medium')) return 'medium';
  if (n.includes('high')) return 'high';
  return 'everyone';
}

function badgeClassName(key, showLabel) {
  return cn(
    styles.riskLevelBadge,
    LEVEL_CONFIG[key].tone,
    !showLabel && styles.riskLevelBadgeIconOnly,
  );
}

/** Three dots, the first `filledCount` solid and the rest drawn as outlines. */
function RiskDots({ filledCount, className }) {
  return (
    <span className={cn('inline-flex items-center gap-[3px]', className)} aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn(
            'size-[7px] shrink-0 rounded-full',
            i < filledCount ? 'bg-current' : 'border-[1.5px] border-current',
          )}
        />
      ))}
    </span>
  );
}

export function RiskLevelBadge({ level, className, showLabel = true }) {
  const t = useTranslations();
  const key = resolveLevelKey(level);
  const label = t(LEVEL_CONFIG[key].label);
  return (
    <span
      className={cn(badgeClassName(key, showLabel), className)}
      title={!showLabel ? label : undefined}
    >
      <RiskDots filledCount={LEVEL_CONFIG[key].dots} />
      {showLabel ? label : null}
    </span>
  );
}

/** The text of a risk callout (intro line and body), without the box or the badge. */
export function RiskLevelBody({ level, mode = 'default', children }) {
  const t = useTranslations();
  const key = resolveLevelKey(level);
  const useDefaultText = (mode === 'default' || !mode) && !children;
  const showHeader = mode === 'for_you_if' || mode === 'for_you';
  const introText = mode === 'for_you' ? t('riskLevel.forYou') : t('riskLevel.forYouIf');

  return (
    <>
      {showHeader && <strong className={styles.riskLevelIntro}>{introText}</strong>}
      <div className={styles.riskLevelBody}>
        {useDefaultText ? <p>{t(LEVEL_CONFIG[key].defaultText)}</p> : children}
      </div>
    </>
  );
}

/**
 * All three levels with their default text, the current one highlighted. `detail` replaces the
 * current level's default text (the sticky header passes the section's own callout text).
 */
export function RiskLevelKey({ level, detail, className }) {
  const t = useTranslations();
  const current = resolveLevelKey(level);

  return (
    <div className={cn('leading-snug', className)}>
      <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
        {LEVEL_KEYS.map((key) => {
          const isCurrent = key === current;
          return (
            <li
              key={key}
              aria-current={isCurrent ? 'true' : undefined}
              className={cn(
                'm-0 flex flex-col items-start gap-1.5 rounded-md px-2.5 py-2',
                isCurrent && styles[key],
              )}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <RiskLevelBadge level={key} />
                {isCurrent && (
                  <span className="text-[13px] font-bold">{t('riskLevel.thisSection')}</span>
                )}
              </div>
              {isCurrent && detail ? (
                detail
              ) : (
                <p className="m-0">{t(LEVEL_CONFIG[key].defaultText)}</p>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mx-2.5 mt-2 mb-0 border-t border-border pt-2.5 text-sm text-muted-foreground">
        {t('riskLevel.keyFooter')}
      </p>
    </div>
  );
}

/**
 * The badge as a button that opens the key: a popover on desktop, a bottom tray on phones.
 * On desktop a mouse hover opens it after a short pause and closes it when the pointer leaves
 * both the badge and the popover. A click, Enter or Space keeps it open until Esc, an outside
 * click or another click on the badge.
 */
export function RiskLevelBadgeButton({ level, showLabel = true, detail, sectionTitle, className }) {
  const t = useTranslations();
  const isMobile = useIsMobile();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  /** True when the reader clicked or pressed the badge, so moving the mouse away keeps it open. */
  const pinnedRef = useRef(false);
  /** True while a hover close is in progress, so focus is not pulled back to the badge. */
  const closingByHoverRef = useRef(false);
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const key = resolveLevelKey(level);
  const label = t(LEVEL_CONFIG[key].label);
  const triggerClassName = cn(
    badgeClassName(key, showLabel),
    styles.riskLevelBadgeButton,
    className,
  );
  const triggerContent = (
    <>
      <RiskDots filledCount={LEVEL_CONFIG[key].dots} />
      <span className={showLabel ? styles.riskLevelBadgeLabel : 'sr-only'}>{label}</span>
      <span className="sr-only">{t('riskLevel.whoIsThisFor')}</span>
    </>
  );

  if (isMobile) {
    return (
      <Sheet>
        <SheetTrigger className={triggerClassName}>{triggerContent}</SheetTrigger>
        <SheetContent
          side="bottom"
          aria-describedby={undefined}
          className="max-h-[85vh] overflow-y-auto rounded-t-xl px-4 pt-5 pb-[max(1.75rem,env(safe-area-inset-bottom))]"
        >
          {sectionTitle && (
            <p className="m-0 pr-10 text-sm text-muted-foreground">{sectionTitle}</p>
          )}
          <SheetTitle className="mb-3 pr-10 text-lg font-bold">
            {t('riskLevel.whoIsThisFor')}
          </SheetTitle>
          <RiskLevelKey level={key} detail={detail} className="-mx-2.5 text-base" />
        </SheetContent>
      </Sheet>
    );
  }

  const scheduleClose = () => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      closingByHoverRef.current = true;
      setOpen(false);
    }, HOVER_CLOSE_MS);
  };

  const handlePointerEnter = (event) => {
    if (event.pointerType !== 'mouse') return;
    clearTimeout(timerRef.current);
    if (!open) timerRef.current = setTimeout(() => setOpen(true), HOVER_OPEN_MS);
  };

  const handlePointerLeave = (event) => {
    if (event.pointerType !== 'mouse') return;
    clearTimeout(timerRef.current);
    if (open && !pinnedRef.current) scheduleClose();
  };

  const handleClick = (event) => {
    // Toggle here instead of in Radix, so a click on a hover-opened key keeps it open.
    event.preventDefault();
    clearTimeout(timerRef.current);
    if (open && pinnedRef.current) {
      pinnedRef.current = false;
      setOpen(false);
    } else {
      pinnedRef.current = true;
      setOpen(true);
    }
  };

  const handleOpenChange = (nextOpen) => {
    clearTimeout(timerRef.current);
    if (!nextOpen) pinnedRef.current = false;
    setOpen(nextOpen);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        className={triggerClassName}
        onClick={handleClick}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
      >
        {triggerContent}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        collisionPadding={16}
        aria-labelledby={titleId}
        className="w-[22rem] max-w-[calc(100vw-2rem)] p-2"
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onOpenAutoFocus={(event) => {
          // Hovering shows the key without moving keyboard focus into it.
          if (!pinnedRef.current) event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          if (closingByHoverRef.current) event.preventDefault();
          closingByHoverRef.current = false;
        }}
      >
        <p
          id={titleId}
          className="mx-2.5 mt-1 mb-1.5 font-heading text-base font-bold leading-snug"
        >
          {t('riskLevel.whoIsThisFor')}
        </p>
        <RiskLevelKey level={key} detail={detail} className="text-[15px]" />
      </PopoverContent>
    </Popover>
  );
}

/**
 * RiskLevel renders a risk/audience callout box.
 *   <RiskLevel level="everyone">markdown children</RiskLevel>
 */
export function RiskLevel({ level, mode = 'default', children, className, ...props }) {
  const normalizedLevel = (level || 'everyone').toLowerCase().replace(/-|\s/g, '_');
  const levelClass = styles[normalizedLevel] || styles.everyone;

  return (
    <div className={cn(styles.riskLevel, levelClass, 'prose', className)} {...props}>
      <RiskLevelBadgeButton level={normalizedLevel} className="self-start" />
      <RiskLevelBody level={normalizedLevel} mode={mode}>
        {children}
      </RiskLevelBody>
    </div>
  );
}

RiskLevel.isRiskLevel = true;
