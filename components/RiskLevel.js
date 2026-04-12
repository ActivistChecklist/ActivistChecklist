'use client';
import React from "react";
import { useTranslations } from 'next-intl';
import { cn } from "@/lib/utils";
import styles from "../styles/RiskLevel.module.css";

const LEVEL_CONFIG = {
  everyone: { bars: 1 },
  medium: { bars: 2 },
  high: { bars: 3 },
};

/** Map MDX `level` values to LEVEL_CONFIG keys (same rules as the main callout). */
function resolveLevelKey(level) {
  const n = (level || "everyone").toLowerCase().replace(/-|\s/g, "_");
  if (LEVEL_CONFIG[n]) return n;
  if (n.includes("medium")) return "medium";
  if (n.includes("high")) return "high";
  return "everyone";
}

function SignalBars({ filledCount, className }) {
  const heights = [4, 8, 12];
  return (
    <span className={cn("inline-flex items-end gap-0.5", className)} aria-hidden>
      {heights.map((h, i) => (
        <span
          key={i}
          className={cn(
            "w-1 rounded-sm min-w-[4px] bg-current",
            i < filledCount ? "opacity-90" : "opacity-30"
          )}
          style={{ height: `${h}px` }}
        />
      ))}
    </span>
  );
}

export function RiskLevelBadge({ level, className, showLabel = true }) {
  const t = useTranslations();
  const key = resolveLevelKey(level);
  const config = LEVEL_CONFIG[key];
  const label = key === 'high' ? t('riskLevel.highLabel') : key === 'medium' ? t('riskLevel.mediumLabel') : t('riskLevel.everyoneLabel');
  const toneClass =
    key === "high"
      ? styles.badgeToneHigh
      : key === "medium"
        ? styles.badgeToneMedium
        : styles.badgeToneEveryone;
  return (
    <span
      className={cn(
        styles.riskLevelBadge,
        styles.riskLevelBadgeInline,
        toneClass,
        !showLabel && styles.riskLevelBadgeBarsOnly,
        className,
      )}
      title={!showLabel ? label : undefined}
    >
      <SignalBars filledCount={config.bars} />
      {showLabel ? label : null}
    </span>
  );
}

/**
 * RiskLevel — renders a risk/audience callout box.
 *   <RiskLevel level="everyone">markdown children</RiskLevel>
 */
export function RiskLevel({ level, mode = "default", children, className, ...props }) {
  const t = useTranslations();
  const normalizedLevel = (level || "everyone").toLowerCase().replace(/-|\s/g, "_");
  const key = resolveLevelKey(level);
  const levelClass = styles[normalizedLevel] || styles.everyone;
  const useDefaultText = (mode === "default" || !mode) && !children;
  const showHeader = mode === "for_you_if" || mode === "for_you";

  const defaultText = key === 'high' ? t('riskLevel.highDefault') : key === 'medium' ? t('riskLevel.mediumDefault') : t('riskLevel.everyoneDefault');
  const introText = mode === 'for_you' ? t('riskLevel.forYou') : t('riskLevel.forYouIf');

  const bodyContent = children;

  return (
    <div
      className={cn(styles.riskLevel, levelClass, "prose", className)}

      {...props}
    >
      {useDefaultText ? (
        <div className={styles.riskLevelFloatWrap}>
          <span className={styles.riskLevelBadgeFloat}>
            <RiskLevelBadge level={normalizedLevel} />
          </span>
          <div className={cn(styles.riskLevelBody, styles.riskLevelBodyInline)}>
            <p>{defaultText}</p>
          </div>
        </div>
      ) : showHeader ? (
        <>
          <div className={cn("flex flex-wrap items-baseline gap-2", styles.riskLevelFirstRow)}>
            <RiskLevelBadge level={normalizedLevel} />
            <strong className={styles.riskLevelIntro}>{introText}</strong>
          </div>
          <div className={styles.riskLevelBody}>
            {bodyContent}
          </div>
        </>
      ) : (
        <div className={styles.riskLevelFloatWrap}>
          <span className={styles.riskLevelBadgeFloat}>
            <RiskLevelBadge level={normalizedLevel} />
          </span>
          <div className={cn(styles.riskLevelBody, styles.riskLevelBodyInline)}>
            {bodyContent}
          </div>
        </div>
      )}
    </div>
  );
}

RiskLevel.isRiskLevel = true;
