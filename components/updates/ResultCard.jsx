'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Check,
  ArrowLeft,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';

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

const PRODUCT_SHORT_LABEL = {
  'apple-watch': 'Apple Watch',
  'samsung-mobile': 'Galaxy',
  'motorola-mobility': 'Motorola',
  'oneplus': 'OnePlus',
  'nokia': 'Nokia',
};

function shortLabelFor(product) {
  return PRODUCT_SHORT_LABEL[product.id] || product.label.replace(MANUFACTURER_PREFIX, '');
}

/**
 * Build a clean display label for a (product, release). Mirrors the autocomplete logic
 * so the result-screen heading and the dropdown label are consistent.
 */
function buildDisplayLabel(product, release) {
  const isOs = product.kind === 'os';
  const tidy = isOs
    ? release.label.replace(/\s*\((W|E)\)\s*/g, '').trim()
    : release.label;
  const shortName = shortLabelFor(product);
  if (!shortName) return tidy;
  if (tidy.toLowerCase().startsWith(shortName.toLowerCase())) return tidy;
  return `${shortName} ${tidy}`.trim();
}

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

/* ────────── Shared building blocks ────────── */

function ResetButton({ onReset }) {
  const t = useTranslations();
  return (
    <button
      type="button"
      onClick={onReset}
      className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      {t('updates.result.checkAnother')}
    </button>
  );
}

const TONE_RING = {
  green: 'border-success/30 bg-success/5',
  red: 'border-destructive/30 bg-destructive/5',
  amber: 'border-warning/30 bg-warning/5',
};
const TONE_ICON_COLOR = {
  green: 'text-success',
  red: 'text-destructive',
  amber: 'text-warning',
};

function ResultBox({ tone, icon: IconProp, title, subtitle, children, onReset }) {
  return (
    <div className={cn('rounded-lg border-2 p-6', TONE_RING[tone])}>
      <ResetButton onReset={onReset} />
      <div className="flex items-start gap-4">
        <IconProp
          className={cn('h-12 w-12 shrink-0', TONE_ICON_COLOR[tone])}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1 space-y-2">
          <h2 className="text-2xl font-semibold leading-tight text-foreground sm:text-3xl">
            {title}
          </h2>
          {subtitle ? <p className="text-base text-foreground/80">{subtitle}</p> : null}
          {children}
        </div>
      </div>
    </div>
  );
}

function CtaList({ items }) {
  const t = useTranslations();
  return (
    <div className="mt-4 space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70">
        {t('updates.result.whatToDo')}
      </p>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              {item.label}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SettingsPath({ osId, prefix }) {
  const t = useTranslations();
  let path;
  try {
    path = t(`updates.result.settingsPath.${osId}`);
  } catch {
    path = null;
  }
  if (!path || path.startsWith('updates.result.settingsPath.')) return null;
  return (
    <p className="text-sm text-muted-foreground">
      {prefix || t('updates.result.settingsPathPrefix')}{' '}
      <span className="font-medium text-foreground">{path}</span>.
    </p>
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

/* ────────── DeviceSupported flow (multi-step) ────────── */

function DeviceCheckedStep({ snapshot, product, release, classification, displayLabel, onConfirmOs, onReset }) {
  const t = useTranslations();

  // Compute OS reminder context (latest version + family OS id) up front so the big
  // next-step card can display the latest version.
  const reminder = buildLatestOsReminder(snapshot, product, release);

  let osLabel = null;
  let latestVersion = null;
  let osId = null;
  if (reminder && reminder.case !== 'oneplus') {
    osId = reminder.osProduct.id;
    try {
      osLabel = t(`updates.result.supportedOsLabel.${osId}`);
    } catch {
      osLabel = reminder.osProduct.label;
    }
    latestVersion = reminder.version || null;
  }

  return (
    <div className="space-y-5">
      {/* Step 1: small confirmation that the device is OK */}
      <div className="flex items-start gap-3 rounded-md border border-success/30 bg-success/5 p-4">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-medium text-foreground">
            {t('updates.result.deviceConfirmedShort', { label: displayLabel })}
          </p>
          {release.eolFrom ? (
            <p className="text-xs text-muted-foreground">
              {t('updates.result.deviceSupportedSubtitleUntil', { date: formatMonthYear(release.eolFrom) })}
            </p>
          ) : null}
          <button
            type="button"
            onClick={onReset}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {t('updates.result.checkAnother')}
          </button>
        </div>
      </div>

      {/* Step 2: big next-step prompt — check the OS */}
      <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-6">
        <h3 className="text-xl font-semibold leading-tight text-foreground sm:text-2xl">
          {t('updates.result.osCheckStep.heading')}
        </h3>
        {osLabel && latestVersion ? (
          <p className="mt-2 text-base text-foreground/80">
            {t('updates.result.osCheckStep.subheading', { os: osLabel, version: latestVersion })}
          </p>
        ) : (
          <p className="mt-2 text-base text-foreground/80">
            {t('updates.result.osCheckStep.subheadingNoVersion')}
          </p>
        )}

        {osId ? (
          <div className="mt-3">
            <SettingsPath osId={osId} prefix={t('updates.result.osCheckStep.settingsPathPrefix')} />
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onConfirmOs}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Check className="h-4 w-4" />
            {t('updates.result.osCheckStep.confirmButton')}
          </button>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          {t('updates.result.osCheckStep.skipNote')}
        </p>
      </div>
    </div>
  );
}

function FinalSuccessBox({ snapshot, product, release, displayLabel, onReset }) {
  const t = useTranslations();
  const reminder = buildLatestOsReminder(snapshot, product, release);

  let osLabel = null;
  let latestVersion = null;
  if (reminder && reminder.case !== 'oneplus' && reminder.osProduct) {
    try {
      osLabel = t(`updates.result.supportedOsLabel.${reminder.osProduct.id}`);
    } catch {
      osLabel = reminder.osProduct.label;
    }
    latestVersion = reminder.version || null;
  }

  const deviceLine = release.eolFrom
    ? t('updates.result.finalSuccess.deviceCheckUntil', {
        label: displayLabel,
        date: formatMonthYear(release.eolFrom),
      })
    : t('updates.result.finalSuccess.deviceCheck', { label: displayLabel });

  const osLine = osLabel && latestVersion
    ? t('updates.result.finalSuccess.osCheck', { os: osLabel, version: latestVersion })
    : t('updates.result.finalSuccess.osCheckNoVersion');

  return (
    <ResultBox
      tone="green"
      icon={CheckCircle2}
      title={t('updates.result.finalSuccess.heading')}
      onReset={onReset}
    >
      <ul className="mt-3 space-y-2">
        <li className="flex items-start gap-2 text-sm text-foreground">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
          <span>{deviceLine}</span>
        </li>
        <li className="flex items-start gap-2 text-sm text-foreground">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
          <span>{osLine}</span>
        </li>
      </ul>
      <CtaList
        items={[
          { href: ESSENTIALS_HREF, label: t('updates.result.ctaEssentials') },
        ]}
      />
    </ResultBox>
  );
}

function DeviceSupported({ snapshot, product, release, classification, onReset }) {
  const t = useTranslations();
  const displayLabel = buildDisplayLabel(product, release);
  const [osVerified, setOsVerified] = useState(false);

  if (osVerified) {
    return (
      <div className="space-y-4">
        <FinalSuccessBox
          snapshot={snapshot}
          product={product}
          release={release}
          displayLabel={displayLabel}
          onReset={onReset}
        />
        <DeviceMaxOsWarning snapshot={snapshot} product={product} release={release} />
        <SourceLink product={product} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DeviceCheckedStep
        snapshot={snapshot}
        product={product}
        release={release}
        classification={classification}
        displayLabel={displayLabel}
        onConfirmOs={() => setOsVerified(true)}
        onReset={onReset}
      />
      <DeviceMaxOsWarning snapshot={snapshot} product={product} release={release} />
      <SourceLink product={product} />
    </div>
  );
}

/* ────────── DeviceMaxOsWarning (unchanged behaviour) ────────── */

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

/* ────────── Other variants ────────── */

function DeviceUncertain({ snapshot, product, release, classification, onReset }) {
  const t = useTranslations();
  const displayLabel = buildDisplayLabel(product, release);
  const ageText = formatYearsAgo(classification.ageYears, t);

  let supportInfo = null;
  try {
    const label = t(`updates.result.manufacturerSupport.${product.family}.label`);
    const url = t(`updates.result.manufacturerSupport.${product.family}.url`);
    if (!label.startsWith('updates.result')) supportInfo = { label, url };
  } catch {
    supportInfo = null;
  }

  return (
    <div className="space-y-4">
      <ResultBox
        tone="amber"
        icon={AlertTriangle}
        title={t('updates.result.deviceUncertainTitle', { label: displayLabel })}
        subtitle={t('updates.result.deviceUncertainSubtitle', { label: displayLabel, age: ageText })}
        onReset={onReset}
      >
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
        <CtaList
          items={[{ href: ESSENTIALS_HREF, label: t('updates.result.ctaEssentials') }]}
        />
      </ResultBox>
      <ThreatModelBlock soft />
      <SourceLink product={product} />
    </div>
  );
}

function DeviceEol({ product, release, classification, onReset }) {
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
  } else {
    subtitle = t('updates.result.deviceUnsupportedSubtitleUnmaintained');
  }

  return (
    <div className="space-y-4">
      <ResultBox
        tone="red"
        icon={XCircle}
        title={t('updates.result.deviceUnsupportedTitle', { label: displayLabel })}
        subtitle={subtitle}
        onReset={onReset}
      >
        <CtaList
          items={[
            { href: ESSENTIALS_HREF, label: t('updates.result.ctaEssentials') },
            { href: SECURITY_ESSENTIALS_HREF, label: t('updates.result.ctaSecurityChecklist') },
          ]}
        />
      </ResultBox>
      <ThreatModelBlock />
      <SourceLink product={product} />
    </div>
  );
}

function OsSupported({ product, release, onReset }) {
  const t = useTranslations();
  const displayLabel = buildDisplayLabel(product, release);

  return (
    <div className="space-y-4">
      <ResultBox
        tone="green"
        icon={CheckCircle2}
        title={t('updates.result.osSupportedTitle', { label: displayLabel })}
        subtitle={
          release.latestVersion
            ? t('updates.result.osLatestVersion', { version: release.latestVersion })
            : null
        }
        onReset={onReset}
      >
        <SettingsPath osId={product.id} />
        {product.id === 'windows' ? (
          <p className="text-sm text-foreground/90">{t('updates.result.windowsUpdateHelp')}</p>
        ) : null}
        {release.isEoas && !release.isEol ? (
          <p className="text-sm text-muted-foreground">{t('updates.result.osEoasNote')}</p>
        ) : null}
        <CtaList
          items={[{ href: ESSENTIALS_HREF, label: t('updates.result.ctaEssentials') }]}
        />
      </ResultBox>
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
    if (advice.startsWith('updates.result.osUpgradeAdvice.')) advice = null;
  } catch {
    advice = null;
  }

  return (
    <div className="space-y-4">
      <ResultBox
        tone="red"
        icon={XCircle}
        title={t('updates.result.osUnsupportedTitle', { label: displayLabel })}
        subtitle={
          release.eolFrom
            ? t('updates.result.osUnsupportedSubtitleEnded', { date: formatMonthYear(release.eolFrom) })
            : null
        }
        onReset={onReset}
      >
        {advice ? <p className="text-sm text-foreground/90">{advice}</p> : null}
        <CtaList
          items={[
            { href: ESSENTIALS_HREF, label: t('updates.result.ctaEssentials') },
            { href: SECURITY_ESSENTIALS_HREF, label: t('updates.result.ctaSecurityChecklist') },
          ]}
        />
      </ResultBox>
      <ThreatModelBlock />
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
