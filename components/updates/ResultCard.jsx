'use client';

import { useTranslations } from 'next-intl';
import { CheckCircle2, XCircle, AlertTriangle, ArrowLeft, ExternalLink } from 'lucide-react';

import Link from '@/components/Link';
import { cn } from '@/lib/utils';
import {
  classifyResult,
  buildLatestOsReminder,
  buildDeviceMaxOsWarning,
} from '@/lib/updates/result-logic';

const ESSENTIALS_HREF = '/guides/essentials';
const SECURITY_ESSENTIALS_HREF = '/checklists/items/security-essentials';

const MANUFACTURER_PREFIX = /^(Apple|Google|Samsung|Microsoft|Motorola|OnePlus|Nokia) /;

const MAC_LABEL_PREFIX = /^(MacBook|iMac|Mac mini|Mac Pro|Mac Studio)/;

/**
 * Build the display label shown in result headings.
 * - Mac devices: release.label already includes the model name, use it as-is.
 * - OS products: strip manufacturer prefix, append release.label, strip Windows (W)/(E) suffixes.
 * - Other devices: strip manufacturer prefix from product.label, append release.label.
 */
function buildDisplayLabel(product, release) {
  const isOs = product.type === 'os';
  if (!isOs && MAC_LABEL_PREFIX.test(release.label)) {
    return release.label;
  }
  const base = `${product.label.replace(MANUFACTURER_PREFIX, '')} ${release.label}`;
  if (isOs) {
    return base.replace(/\s*\((W|E)\)\s*/g, '').trim();
  }
  return base;
}

/** Format an ISO date string as "Month YYYY" (e.g. "March 2031"). */
function formatMonthYear(iso, locale = 'en-US') {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
}

function formatYearsAgo(years, t) {
  if (years == null) return '';
  const rounded = Math.max(0, Math.round(years));
  return t('updates.result.ageYearsAgo', { years: rounded });
}

function ResultHeader({ tone, title, onReset }) {
  const t = useTranslations();
  const Icon = tone === 'green' ? CheckCircle2 : tone === 'red' ? XCircle : AlertTriangle;
  const toneClass = {
    green: 'text-success',
    red: 'text-destructive',
    amber: 'text-warning',
  }[tone];
  const ringClass = {
    green: 'border-success/30 bg-success/5',
    red: 'border-destructive/30 bg-destructive/5',
    amber: 'border-warning/30 bg-warning/5',
  }[tone];

  return (
    <div className={cn('rounded-lg border-2 p-6', ringClass)}>
      <button
        type="button"
        onClick={onReset}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('updates.result.checkAnother')}
      </button>
      <div className="flex items-start gap-4">
        <Icon className={cn('h-12 w-12 shrink-0', toneClass)} aria-hidden="true" />
        <h2 className="text-2xl font-semibold leading-tight text-foreground sm:text-3xl">
          {title}
        </h2>
      </div>
    </div>
  );
}

function SettingsPath({ osId }) {
  const t = useTranslations();
  // Some OS ids don't have a built-in path (e.g. obscure Android skins). Fall back gracefully.
  let path;
  try {
    path = t(`updates.result.settingsPath.${osId}`);
  } catch {
    path = null;
  }
  if (!path || path.startsWith('updates.result.settingsPath.')) return null;
  return (
    <p className="text-sm text-muted-foreground">
      {t('updates.result.settingsPathPrefix')} <span className="font-medium text-foreground">{path}</span>.
    </p>
  );
}

function LatestOsReminder({ snapshot, product, release }) {
  const t = useTranslations();
  const reminder = buildLatestOsReminder(snapshot, product, release);
  if (!reminder) return null;

  if (reminder.case === 'oneplus') {
    return (
      <div className="rounded-md bg-muted/40 p-4">
        <p className="text-sm font-medium text-foreground">
          {t('updates.result.latestOsReminderTitle')}
        </p>
        <p className="mt-1 text-sm text-foreground/90">
          {t('updates.result.latestOsReminderGeneric')}
        </p>
        <SettingsPath osId="oneplus" />
      </div>
    );
  }

  const osId = reminder.osProduct.id;
  let osLabel;
  try {
    osLabel = t(`updates.result.supportedOsLabel.${osId}`);
  } catch {
    osLabel = reminder.osProduct.label;
  }

  const message =
    reminder.case === 'specific-version'
      ? t('updates.result.latestOsReminderWithVersion', { os: osLabel, version: reminder.version })
      : t('updates.result.latestOsReminderFamilyLatest', { os: osLabel, version: reminder.version });

  return (
    <div className="rounded-md bg-muted/40 p-4">
      <p className="text-sm font-medium text-foreground">
        {t('updates.result.latestOsReminderTitle')}
      </p>
      <p className="mt-1 text-sm text-foreground/90">{message}</p>
      <SettingsPath osId={osId} />
    </div>
  );
}

function DeviceMaxOsWarning({ snapshot, product, release }) {
  const t = useTranslations();
  const reminder = buildLatestOsReminder(snapshot, product, release);
  const warning = buildDeviceMaxOsWarning(snapshot, product, release, reminder);
  if (!warning) return null;

  let osLabel;
  try {
    osLabel = t(`updates.result.supportedOsLabel.${warning.osProduct.id}`);
  } catch {
    osLabel = warning.osProduct.label;
  }

  if (warning.kind === 'older-os-eol') {
    return (
      <div className="rounded-md border border-warning/40 bg-warning/5 p-4">
        <p className="text-sm font-medium text-foreground">
          {t('updates.result.deviceMaxOsWarningTitle')}
        </p>
        <p className="mt-1 text-sm text-foreground/90">
          {t('updates.result.deviceMaxOsEolWarning', {
            label: product.label,
            os: osLabel,
            maxVersion: warning.maxMajor,
          })}
        </p>
      </div>
    );
  }

  const message = warning.maxEolDate
    ? t('updates.result.deviceMaxOsWarningWithDate', {
        label: product.label,
        os: osLabel,
        maxVersion: warning.maxMajor,
        eolDate: formatMonthYear(warning.maxEolDate),
        latestVersion: warning.latestMajor,
      })
    : t('updates.result.deviceMaxOsWarning', {
        label: product.label,
        os: osLabel,
        maxVersion: warning.maxMajor,
        latestVersion: warning.latestMajor,
      });

  return (
    <div className="rounded-md border border-warning/40 bg-warning/5 p-4">
      <p className="text-sm font-medium text-foreground">
        {t('updates.result.deviceMaxOsWarningTitle')}
      </p>
      <p className="mt-1 text-sm text-foreground/90">{message}</p>
      <p className="mt-2 text-sm text-foreground/80">
        {t('updates.result.deviceUpgradePlan')}
      </p>
    </div>
  );
}

function ThreatModelBlock({ soft = false }) {
  const t = useTranslations();
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <p className="mb-1 text-sm font-medium text-foreground">
        {t('updates.result.threatModelHeader')}
      </p>
      <p className="text-sm leading-relaxed text-foreground/90">
        {soft ? t('updates.result.threatModelSoft') : t('updates.result.threatModel')}
      </p>
    </div>
  );
}

function CtasGreen() {
  const t = useTranslations();
  return (
    <div className="flex flex-wrap gap-3">
      <Link
        href={ESSENTIALS_HREF}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        {t('updates.result.ctaEssentials')}
      </Link>
    </div>
  );
}

function CtasRed() {
  const t = useTranslations();
  return (
    <div className="flex flex-wrap gap-3">
      <Link
        href={ESSENTIALS_HREF}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        {t('updates.result.ctaEssentials')}
      </Link>
      <Link
        href={SECURITY_ESSENTIALS_HREF}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
      >
        {t('updates.result.ctaSecurityChecklist')}
      </Link>
    </div>
  );
}

function SourceLink({ product }) {
  const t = useTranslations();
  if (!product.endoflifeUrl) return null;
  return (
    <p className="text-xs text-muted-foreground">
      {t.rich('updates.result.source', {
        link: (chunks) => (
          <a
            href={product.endoflifeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 underline hover:text-foreground"
          >
            {chunks}
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        ),
      })}
    </p>
  );
}

/* ────────── Variants ────────── */

function DeviceSupported({ snapshot, product, release, classification, onReset }) {
  const t = useTranslations();
  const displayLabel = buildDisplayLabel(product, release);

  let subtitle = null;
  if (release.eolFrom) {
    subtitle = t('updates.result.deviceSupportedSubtitleUntil', { date: formatMonthYear(release.eolFrom) });
  } else if (classification.reason === 'maintained-recent' && classification.ageYears != null && classification.ageYears < 3) {
    // Only mention "no end-of-support date announced" for very recent devices —
    // for established devices, we don't dwell on missing future dates.
    if (release.releaseDate && (Date.now() - new Date(release.releaseDate)) / (365.25 * 24 * 60 * 60 * 1000) < 3) {
      subtitle = t('updates.result.deviceSupportedSubtitleRecent');
    }
  }

  return (
    <div className="space-y-4">
      <ResultHeader
        tone="green"
        title={t('updates.result.deviceSupportedTitle', { label: displayLabel })}
        onReset={onReset}
      />
      {subtitle ? <p className="text-base text-foreground/80">{subtitle}</p> : null}
      <LatestOsReminder snapshot={snapshot} product={product} release={release} />
      <DeviceMaxOsWarning snapshot={snapshot} product={product} release={release} />
      <CtasGreen />
      <SourceLink product={product} />
    </div>
  );
}

function DeviceUncertain({ snapshot, product, release, classification, onReset }) {
  const t = useTranslations();
  const displayLabel = buildDisplayLabel(product, release);
  const ageText = formatYearsAgo(classification.ageYears, t);

  // Manufacturer support link (when we have one)
  const supportInfo = (() => {
    try {
      const label = t(`updates.result.manufacturerSupport.${product.family}.label`);
      const url = t(`updates.result.manufacturerSupport.${product.family}.url`);
      if (label?.startsWith('updates.result')) return null;
      return { label, url };
    } catch {
      return null;
    }
  })();

  return (
    <div className="space-y-4">
      <ResultHeader
        tone="amber"
        title={t('updates.result.deviceUncertainTitle', { label: displayLabel })}
        onReset={onReset}
      />
      <p className="text-base text-foreground/80">
        {t('updates.result.deviceUncertainSubtitle', { label: displayLabel, age: ageText })}
      </p>
      {supportInfo ? (
        <p className="text-sm text-foreground/90">
          {t.rich('updates.result.deviceUncertainCheck', {
            link: () => (
              <a
                href={supportInfo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                {supportInfo.label}
              </a>
            ),
          })}
        </p>
      ) : null}
      <LatestOsReminder snapshot={snapshot} product={product} release={release} />
      <ThreatModelBlock soft />
      <CtasGreen />
      <SourceLink product={product} />
    </div>
  );
}

function DeviceEol({ snapshot, product, release, classification, onReset }) {
  const t = useTranslations();
  const displayLabel = buildDisplayLabel(product, release);

  let subtitle = null;
  if (classification.reason === 'eolFrom-past' && release.eolFrom) {
    subtitle = t('updates.result.deviceUnsupportedSubtitleEnded', { date: formatMonthYear(release.eolFrom) });
  } else if (classification.reason === 'unmaintained') {
    subtitle = t('updates.result.deviceUnsupportedSubtitleUnmaintained');
  } else if (classification.reason === 'age-heuristic-old') {
    subtitle = t('updates.result.deviceUnsupportedSubtitleAge', {
      age: formatYearsAgo(classification.ageYears, t),
    });
  } else if (classification.reason === 'eoas-past' && release.eoasFrom) {
    subtitle = t('updates.result.deviceUnsupportedSubtitleEnded', { date: formatMonthYear(release.eoasFrom) });
  } else if (release.eolFrom) {
    // eolFrom is in the future (not yet past); fall back to generic unmaintained message
    subtitle = t('updates.result.deviceUnsupportedSubtitleUnmaintained');
  }

  return (
    <div className="space-y-4">
      <ResultHeader
        tone="red"
        title={t('updates.result.deviceUnsupportedTitle', { label: displayLabel })}
        onReset={onReset}
      />
      {subtitle ? <p className="text-base text-foreground/80">{subtitle}</p> : null}
      <ThreatModelBlock />
      <CtasRed />
      <SourceLink product={product} />
    </div>
  );
}

function OsSupported({ product, release, onReset }) {
  const t = useTranslations();
  const displayLabel = buildDisplayLabel(product, release);

  return (
    <div className="space-y-4">
      <ResultHeader
        tone="green"
        title={t('updates.result.osSupportedTitle', { label: displayLabel })}
        onReset={onReset}
      />
      {release.latestVersion ? (
        <p className="text-base text-foreground/90">
          {t('updates.result.osLatestVersion', { version: release.latestVersion })}
        </p>
      ) : null}
      <SettingsPath osId={product.id} />
      {product.id === 'windows' ? (
        <p className="text-sm text-foreground/90">{t('updates.result.windowsUpdateHelp')}</p>
      ) : null}
      {release.isEoas && !release.isEol ? (
        <p className="text-sm text-muted-foreground">{t('updates.result.osEoasNote')}</p>
      ) : null}
      <CtasGreen />
      <SourceLink product={product} />
    </div>
  );
}

function OsEol({ product, release, onReset }) {
  const t = useTranslations();
  const displayLabel = buildDisplayLabel(product, release);

  let advice = null;
  try {
    advice = t(`updates.result.osUpgradeAdvice.${product.id}`);
  } catch {
    advice = null;
  }

  return (
    <div className="space-y-4">
      <ResultHeader
        tone="red"
        title={t('updates.result.osUnsupportedTitle', { label: displayLabel })}
        onReset={onReset}
      />
      {release.eolFrom ? (
        <p className="text-base text-foreground/80">
          {t('updates.result.osUnsupportedSubtitleEnded', { date: formatMonthYear(release.eolFrom) })}
        </p>
      ) : null}
      <ThreatModelBlock />
      {advice && !advice.startsWith('updates.result.osUpgradeAdvice.') ? (
        <p className="text-sm text-foreground/90">{advice}</p>
      ) : null}
      <CtasRed />
      <SourceLink product={product} />
    </div>
  );
}

/* ────────── Public component ────────── */

export default function ResultCard({ snapshot, product, release, onReset }) {
  const classification = classifyResult({ product, release }, { snapshot });

  const Variant = {
    'device-supported': DeviceSupported,
    'device-uncertain': DeviceUncertain,
    'device-eol': DeviceEol,
    'os-supported': OsSupported,
    'os-eol': OsEol,
  }[classification.variant];

  if (!Variant) return null;

  return (
    <Variant
      snapshot={snapshot}
      product={product}
      release={release}
      classification={classification}
      onReset={onReset}
    />
  );
}
