'use client';
import React from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import styles from '../styles/RiskLevel.module.css';

const LEVEL_CONFIG = {
  everyone: { dots: 1 },
  medium: { dots: 2 },
  high: { dots: 3 },
};

/** Map MDX `level` values to LEVEL_CONFIG keys (same rules as the main callout). */
function resolveLevelKey(level) {
  const n = (level || 'everyone').toLowerCase().replace(/-|\s/g, '_');
  if (LEVEL_CONFIG[n]) return n;
  if (n.includes('medium')) return 'medium';
  if (n.includes('high')) return 'high';
  return 'everyone';
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
  const config = LEVEL_CONFIG[key];
  const label =
    key === 'high'
      ? t('riskLevel.highLabel')
      : key === 'medium'
        ? t('riskLevel.mediumLabel')
        : t('riskLevel.everyoneLabel');
  const toneClass =
    key === 'high'
      ? styles.badgeToneHigh
      : key === 'medium'
        ? styles.badgeToneMedium
        : styles.badgeToneEveryone;
  return (
    <span
      className={cn(
        styles.riskLevelBadge,
        toneClass,
        !showLabel && styles.riskLevelBadgeIconOnly,
        className,
      )}
      title={!showLabel ? label : undefined}
    >
      <RiskDots filledCount={config.dots} />
      {showLabel ? label : null}
    </span>
  );
}

/**
 * RiskLevel — renders a risk/audience callout box.
 *   <RiskLevel level="everyone">markdown children</RiskLevel>
 */
export function RiskLevel({ level, mode = 'default', children, className, ...props }) {
  const t = useTranslations();
  const normalizedLevel = (level || 'everyone').toLowerCase().replace(/-|\s/g, '_');
  const key = resolveLevelKey(level);
  const levelClass = styles[normalizedLevel] || styles.everyone;
  const useDefaultText = (mode === 'default' || !mode) && !children;
  const showHeader = mode === 'for_you_if' || mode === 'for_you';

  const defaultText =
    key === 'high'
      ? t('riskLevel.highDefault')
      : key === 'medium'
        ? t('riskLevel.mediumDefault')
        : t('riskLevel.everyoneDefault');
  const introText = mode === 'for_you' ? t('riskLevel.forYou') : t('riskLevel.forYouIf');

  return (
    <div className={cn(styles.riskLevel, levelClass, 'prose', className)} {...props}>
      <RiskLevelBadge level={normalizedLevel} className="self-start" />
      {showHeader && <strong className={styles.riskLevelIntro}>{introText}</strong>}
      <div className={styles.riskLevelBody}>{useDefaultText ? <p>{defaultText}</p> : children}</div>
    </div>
  );
}

RiskLevel.isRiskLevel = true;
