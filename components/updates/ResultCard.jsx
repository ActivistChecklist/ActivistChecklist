'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Check,
  ArrowRight,
  ShieldAlert,
  ShoppingCart,
} from 'lucide-react';

import Link from '@/components/Link';
import { cn } from '@/lib/utils';
import {
  classifyResult,
  buildLatestOsReminder,
  buildDeviceMaxOsWarning,
  buildOsCheckOptions,
} from '@/lib/updates/result-logic';
import { osProductForDevice } from '@/lib/updates/snapshot';
import { buildDisplayLabel } from '@/lib/updates/search';
import { iconForFamily } from '@/lib/updates/family-icons';

const ESSENTIALS_HREF = '/guides/essentials';

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

/**
 * Compact info card showing the picked device/OS with its brand icon, display name,
 * and a "Manufacturer · Released Month YYYY" subtitle. Sits above the result so the
 * user can confirm at a glance which item their search resolved to.
 */
function DeviceInfoCard({ product, release, onReset }) {
  const t = useTranslations();
  const Icon = iconForFamily(product.family);
  const label = buildDisplayLabel(product, release);

  let manufacturer = '';
  try {
    const m = t(`updates.result.deviceInfo.manufacturer.${product.family}`);
    if (m && !m.startsWith('updates.result.deviceInfo.')) manufacturer = m;
  } catch {
    /* fall through */
  }

  const dateText = release.releaseDate ? formatMonthYear(release.releaseDate) : null;
  const subtitle = dateText
    ? t('updates.result.deviceInfo.manufacturerLine', { manufacturer, date: dateText })
    : manufacturer
      ? t('updates.result.deviceInfo.manufacturerLineNoDate', { manufacturer })
      : null;

  return (
    // `group` so the Start over button picks up a hover state from anywhere on the panel,
    // making the reset path discoverable when the user mouses over the device summary.
    <div className="group flex items-center gap-3 rounded-md border border-border bg-background p-3">
      <Icon className="h-7 w-7 shrink-0 text-foreground/80" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-semibold text-foreground sm:text-lg">{label}</p>
        {subtitle ? (
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {onReset ? (
        <button
          type="button"
          onClick={onReset}
          className={cn(
            'shrink-0 rounded-md border-2 border-primary px-3 py-1.5 text-xs font-medium text-primary transition-colors',
            'group-hover:bg-primary group-hover:text-primary-foreground',
            'focus-visible:bg-primary focus-visible:text-primary-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/40'
          )}
        >
          {t('updates.result.startOver')}
        </button>
      ) : null}
    </div>
  );
}

/* ────────── Shared building blocks ────────── */

/**
 * Wraps a result block in a snappy slide-up + fade-in. Pair with a `key` prop on the
 * caller to replay the animation when contents swap (e.g. picker → success).
 */
function SlideInBox({ children, className }) {
  return (
    <div
      className={cn(
        'animate-in fade-in slide-in-from-bottom-2 duration-200',
        className
      )}
    >
      {children}
    </div>
  );
}

const TONE_RING = {
  green: 'border-success/30 bg-success/5',
  red: 'border-destructive/30 bg-destructive/5',
  amber: 'border-warning/30 bg-warning/5',
  primary: 'border-primary/30 bg-primary/5',
};
const TONE_ICON_COLOR = {
  green: 'text-success',
  red: 'text-destructive',
  amber: 'text-warning',
  primary: 'text-primary',
};

function ResultBox({ tone, icon: IconProp, title, subtitle, children }) {
  return (
    <div className={cn('rounded-lg border-2 p-6', TONE_RING[tone])}>
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

/**
 * Action row at the bottom of every result: the cross-reset button on the left, the
 * essentials-link button on the right. Same outline-primary styling on both so they
 * read as paired actions. Wraps on narrow screens.
 */
function ResultActions({ product, onReset }) {
  const t = useTranslations();
  return (
    <div className="mt-5 flex flex-wrap items-center gap-2">
      <ResultActions product={product} onReset={onReset} />
      <Link
        href={ESSENTIALS_HREF}
        className={cn(
          'inline-flex items-center justify-center rounded-md border-2 border-primary px-4 py-2 text-sm font-medium text-primary',
          'transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/40'
        )}
      >
        {t('updates.result.viewEssentialsCta')}
      </Link>
    </div>
  );
}

/**
 * Block heading with an inline icon — used by the in-box context panels
 * (Why this matters, When you replace it) so the eye can pick them out
 * faster than a wall of body text.
 */
function BlockHeading({ icon: IconProp, children }) {
  return (
    <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-foreground">
      <IconProp className="h-4 w-4 shrink-0 text-foreground/70" aria-hidden="true" />
      {children}
    </p>
  );
}

/**
 * The prominent, big, bold action line — appears under the title/subtitle in
 * the failure (red) and warning (yellow) variants. The whole point of the
 * page is to land on this sentence.
 */
function PrescriptionLine({ formFactor, urgency }) {
  const t = useTranslations();
  const namespace = urgency === 'plan' ? 'ctaPlan' : 'ctaReplace';
  const key = ['phone', 'tablet', 'laptop', 'desktop', 'watch'].includes(formFactor)
    ? formFactor
    : 'generic';
  return (
    <p className="text-xl font-bold leading-snug text-foreground sm:text-2xl">
      {t(`updates.result.${namespace}.${key}`)}
    </p>
  );
}

/**
 * "Why this matters" block. Lives INSIDE the colored result box for failure/warning
 * states so the threat-model context is part of the result, not a sibling. Slightly
 * lighter background tone so it sits visually separate from the heading.
 */
function ThreatModelBlock({ soft = false }) {
  const t = useTranslations();
  return (
    <div className="rounded-md border border-border bg-background/60 p-3">
      <BlockHeading icon={ShieldAlert}>
        {t('updates.result.threatModelHeader')}
      </BlockHeading>
      <p className="text-sm leading-relaxed text-foreground/90">
        {soft ? t('updates.result.threatModelSoft') : t('updates.result.threatModel')}
      </p>
    </div>
  );
}

/**
 * Form-factor → realistic security-update window for buying guidance.
 * `labelKey` indexes updates.result.buyingGuidance.deviceLabel for the noun
 * that gets interpolated into the shared yearsPattern string ("phones",
 * "laptops" etc.) — so translators only see one sentence template.
 */
const FORM_FACTOR_UPDATE_YEARS = {
  phone: { min: 5, max: 7, labelKey: 'phone' },
  tablet: { min: 5, max: 7, labelKey: 'tablet' },
  laptop: { min: 7, max: 10, labelKey: 'laptop' },
  desktop: { min: 7, max: 10, labelKey: 'laptop' }, // iMac/Mac mini etc. read as "laptops"
  watch: { min: 4, max: 6, labelKey: 'watch' },
};

/**
 * Guidance shown alongside the EOL action: typical update windows + a nudge to
 * pre-check used purchases through this same tool.
 */
function BuyingGuidance({ formFactor }) {
  const t = useTranslations();
  const spec = FORM_FACTOR_UPDATE_YEARS[formFactor];
  if (!spec) return null;
  return (
    <div className="rounded-md border border-border bg-background/60 p-3">
      <BlockHeading icon={ShoppingCart}>
        {t('updates.result.buyingGuidance.heading')}
      </BlockHeading>
      <p className="text-sm leading-relaxed text-foreground/90">
        {t('updates.result.buyingGuidance.yearsPattern', {
          deviceLabel: t(`updates.result.buyingGuidance.deviceLabel.${spec.labelKey}`),
          min: spec.min,
          max: spec.max,
        })}{' '}
        {t('updates.result.buyingGuidance.checkBeforeBuying')}
      </p>
    </div>
  );
}


/**
 * Resolve a path string from messages with graceful null when missing.
 * Supports rich content (e.g. <code>winver</code> for Windows) by routing the
 * lookup through t.rich with a code-tag handler.
 */
function pathFromKey(t, key) {
  try {
    const raw = t(key);
    if (!raw || raw.startsWith('updates.result.')) return null;
    return t.rich(key, {
      code: (chunks) => (
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-base text-foreground">
          {chunks}
        </code>
      ),
    });
  } catch {
    return null;
  }
}

function osVersionPath(t, osId) { return pathFromKey(t, `updates.result.osVersionPath.${osId}`); }
function osUpdatePath(t, osId) { return pathFromKey(t, `updates.result.settingsPath.${osId}`); }

/**
 * The big bold callout used inside OS-related step boxes (picker, needs-update).
 * Pass the resolved path content; this component just styles it.
 */
function PromMenuPath({ children }) {
  if (!children) return null;
  return (
    <p className="rounded-md bg-background/60 px-4 py-3 text-base font-semibold text-foreground sm:text-lg">
      {children}
    </p>
  );
}

/**
 * Inline path used inside coloured result boxes. Smaller, prefixed with
 * "Check yours at" so the user knows it's where they verify their version.
 */
function SettingsPathInline({ osId }) {
  const t = useTranslations();
  const path = osVersionPath(t, osId);
  if (!path) return null;
  return (
    <p className="text-sm text-muted-foreground">
      {t('updates.result.settingsPathPrefix')}{' '}
      <span className="font-medium text-foreground">{path}</span>.
    </p>
  );
}

/* ────────── DeviceSupported flow (cumulative steps) ────────── */

/**
 * Step 1 (always shown for green device results): a small confirmation card.
 * Stays visible while the user works through Step 2 (OS check) and Step 3 (final success).
 */
function DeviceConfirmedSummary({ release, displayLabel }) {
  const t = useTranslations();
  return (
    <div className="flex items-start gap-3 rounded-md border border-success/30 bg-success/5 p-4">
      <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-success" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-base font-medium text-foreground sm:text-lg">
          {t('updates.result.deviceConfirmedShort', { label: displayLabel })}
        </p>
        {release.eolFrom ? (
          <p className="text-xs text-muted-foreground">
            {t('updates.result.deviceSupportedSubtitleUntil', {
              date: formatMonthYear(release.eolFrom),
            })}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The OS-version picker. Renders one row per non-EOL major: "Older than X" + "X (Codename)?".
 * Falls back to a single "Done — I'm on the latest" button if we have no version data.
 */
function OsPickerStep({ snapshot, product, release, onPickLatest, onPickOlder }) {
  const t = useTranslations();
  const options = buildOsCheckOptions(snapshot, product, release);

  const osProduct = osProductForDevice(snapshot, product);
  const osId = osProduct?.id || null;

  let osLabel = null;
  if (osId) {
    try {
      osLabel = t(`updates.result.supportedOsLabel.${osId}`);
    } catch {
      osLabel = osProduct.label;
    }
  }

  const heading = osLabel
    ? t('updates.result.osCheckStep.headingForOs', { os: osLabel })
    : t('updates.result.osCheckStep.headingGeneric');

  return (
    <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-6">
      <h3 className="text-xl font-semibold leading-tight text-foreground sm:text-2xl">
        {heading}
      </h3>

      {osId ? (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-muted-foreground">{t('updates.result.osCheckStep.subheadingHelp')}</p>
          {/* OsPickerStep is asking the user to FIND their version → osVersionPath */}
          <PromMenuPath>{osVersionPath(t, osId)}</PromMenuPath>
        </div>
      ) : null}

      <div className="mt-5 space-y-2">
        {options.length > 0 ? (
          options.map((opt) => {
            // OSes with point versions (iOS/macOS/Windows) get a pair of buttons —
            // "Older than X.Y.Z" + "X.Y.Z" — so users can flag a stale patch within the
            // current major. OSes without point versions (Android — Google doesn't
            // expose a single "current version" string) get one button per major.
            if (opt.latestVersion) {
              return (
                <div key={opt.major} className="flex flex-wrap gap-2">
                  <PickerButton
                    onClick={() => onPickOlder(opt)}
                    label={
                      opt.codename
                        ? t('updates.result.osCheckStep.optionOlderCodename', {
                            os: osLabel || '',
                            version: opt.latestVersion,
                            codename: opt.codename,
                          })
                        : t('updates.result.osCheckStep.optionOlder', {
                            os: osLabel || '',
                            version: opt.latestVersion,
                          })
                    }
                  />
                  <PickerButton
                    onClick={() => onPickLatest(opt)}
                    label={
                      opt.codename
                        ? t('updates.result.osCheckStep.optionLatestCodename', {
                            os: osLabel || '',
                            version: opt.latestVersion,
                            codename: opt.codename,
                          })
                        : t('updates.result.osCheckStep.optionLatest', {
                            os: osLabel || '',
                            version: opt.latestVersion,
                          })
                    }
                  />
                </div>
              );
            }
            return (
              <div key={opt.major} className="flex flex-wrap gap-2">
                <PickerButton
                  onClick={() => onPickLatest(opt)}
                  label={
                    opt.codename
                      ? t('updates.result.osCheckStep.optionMajorCodename', {
                          os: osLabel || '',
                          major: opt.major,
                          codename: opt.codename,
                        })
                      : t('updates.result.osCheckStep.optionMajor', {
                          os: osLabel || '',
                          major: opt.major,
                        })
                  }
                />
              </div>
            );
          })
        ) : (
          // No OS data — single confirmation button (e.g., OnePlus, watches without OS lookup).
          <PickerButton
            onClick={() => onPickLatest(null)}
            label={t('updates.result.osNeedsUpdate.didUpdateButton')}
          />
        )}
        {options.length > 0 ? (
          <button
            type="button"
            onClick={() => onPickOlder(null)}
            className="pt-1 text-sm text-muted-foreground hover:text-foreground"
          >
            {t('updates.result.osCheckStep.optionUnknown')}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function PickerButton({ onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center justify-center rounded-md border-2 border-primary px-4 py-2 text-sm font-medium text-primary',
        'transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/40'
      )}
    >
      {label}
    </button>
  );
}

/**
 * Cross-form-factor reset prompt at the bottom of every result. After checking a phone
 * we suggest a laptop and vice-versa; tablets/watches fall back to "check your phone"
 * (closest related thing); OS results and anything we can't categorise get a generic
 * "Check another device" so there's always a way out via this button.
 */
function CrossResetButton({ product, onReset }) {
  const t = useTranslations();
  if (!onReset) return null;
  let label;
  if (product.formFactor === 'phone') {
    label = t('updates.result.finalSuccess.checkLaptopNext');
  } else if (product.formFactor === 'laptop' || product.formFactor === 'desktop') {
    label = t('updates.result.finalSuccess.checkPhoneNext');
  } else if (product.formFactor === 'tablet' || product.formFactor === 'watch') {
    label = t('updates.result.finalSuccess.checkPhoneNext');
  } else {
    label = t('updates.result.finalSuccess.checkAnotherDevice');
  }
  return <PickerButton onClick={onReset} label={label} />;
}

function FinalSuccessBox({ snapshot, product, release, displayLabel, pickedOption, onReset }) {
  const t = useTranslations();
  const osProduct = osProductForDevice(snapshot, product);

  let osLabel = null;
  if (osProduct) {
    try {
      osLabel = t(`updates.result.supportedOsLabel.${osProduct.id}`);
    } catch {
      osLabel = osProduct.label;
    }
  }

  const deviceLine = release.eolFrom
    ? t('updates.result.finalSuccess.deviceCheckUntil', {
        label: displayLabel,
        date: formatMonthYear(release.eolFrom),
      })
    : t('updates.result.finalSuccess.deviceCheck', { label: displayLabel });

  let osLine;
  if (pickedOption && osLabel) {
    // For OSes without point versions (Android), the major IS the version they confirm.
    const versionLabel = pickedOption.latestVersion || String(pickedOption.major);
    osLine = pickedOption.codename
      ? t('updates.result.finalSuccess.osCheckCodename', {
          os: osLabel,
          version: versionLabel,
          codename: pickedOption.codename,
        })
      : t('updates.result.finalSuccess.osCheck', {
          os: osLabel,
          version: versionLabel,
        });
  } else {
    osLine = t('updates.result.finalSuccess.osCheckNoVersion');
  }

  return (
    <ResultBox
      tone="green"
      icon={CheckCircle2}
      title={t('updates.result.finalSuccess.heading')}
    >
      <ul className="mt-2 space-y-2">
        <li className="flex items-start gap-2 text-sm text-foreground sm:text-base">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
          <span>{deviceLine}</span>
        </li>
        <li className="flex items-start gap-2 text-sm text-foreground sm:text-base">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
          <span>{osLine}</span>
        </li>
      </ul>
      <ResultActions product={product} onReset={onReset} />
    </ResultBox>
  );
}

function OsNeedsUpdateBox({ snapshot, product, onDidUpdate }) {
  const t = useTranslations();
  const osProduct = osProductForDevice(snapshot, product);
  const osId = osProduct?.id || null;

  return (
    <div className="rounded-lg border-2 border-warning/30 bg-warning/5 p-6">
      <div className="flex items-start gap-4">
        <AlertTriangle className="h-12 w-12 shrink-0 text-warning" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-3">
          <h2 className="text-2xl font-semibold leading-tight text-foreground sm:text-3xl">
            {t('updates.result.osNeedsUpdate.heading')}
          </h2>
          <p className="text-base text-foreground/80">
            {t('updates.result.osNeedsUpdate.body')}
          </p>

          {osId ? (
            <div className="space-y-2 pt-1">
              <p className="text-sm font-semibold text-foreground/80">
                {t('updates.result.osNeedsUpdate.howToHeading')}
              </p>
              {/* OsNeedsUpdateBox is asking the user to UPDATE → settingsPath (final action) */}
              <PromMenuPath>{osUpdatePath(t, osId)}</PromMenuPath>
            </div>
          ) : null}

          <div className="pt-2">
            <PickerButton onClick={onDidUpdate} label={t('updates.result.osNeedsUpdate.didUpdateButton')} />
          </div>
        </div>
      </div>
    </div>
  );
}

function DeviceSupported({ snapshot, product, release, onReset }) {
  const displayLabel = buildDisplayLabel(product, release);
  // step: 'pick' | 'success' | 'needs-update'
  const [step, setStep] = useState('pick');
  const [pickedOption, setPickedOption] = useState(null);

  function pickLatest(opt) {
    setPickedOption(opt);
    setStep('success');
  }
  function pickOlder(opt) {
    setPickedOption(opt);
    setStep('needs-update');
  }
  function didUpdate() {
    setStep('success');
  }

  return (
    <div className="space-y-4">
      <SlideInBox>
        <DeviceConfirmedSummary release={release} displayLabel={displayLabel} />
      </SlideInBox>

      {/* keyed by `step` so each transition between picker / needs-update / success
          re-mounts the inner box and replays the slide-up + fade-in. */}
      <SlideInBox key={step}>
        {step === 'pick' ? (
          <OsPickerStep
            snapshot={snapshot}
            product={product}
            release={release}
            onPickLatest={pickLatest}
            onPickOlder={pickOlder}
          />
        ) : step === 'needs-update' ? (
          <OsNeedsUpdateBox snapshot={snapshot} product={product} onDidUpdate={didUpdate} />
        ) : (
          <FinalSuccessBox
            snapshot={snapshot}
            product={product}
            release={release}
            displayLabel={displayLabel}
            pickedOption={pickedOption}
            onReset={onReset}
          />
        )}
      </SlideInBox>

      <SlideInBox>
        <DeviceMaxOsWarning snapshot={snapshot} product={product} release={release} />
      </SlideInBox>
    </div>
  );
}

/* ────────── DeviceMaxOsWarning ────────── */

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

/* ────────── Other variants (unchanged shape, no in-box reset) ────────── */

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
    <SlideInBox>
      <ResultBox
        tone="amber"
        icon={AlertTriangle}
        title={t('updates.result.deviceUncertainTitle', { label: displayLabel })}
        subtitle={t('updates.result.deviceUncertainSubtitle', { label: displayLabel, age: ageText })}
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
        <ThreatModelBlock soft />
        <ResultActions product={product} onReset={onReset} />
      </ResultBox>
    </SlideInBox>
  );
}

/**
 * Yellow warning shown when the device IS still supported today, but its end-of-support
 * date is within EOL_WARNING_MONTHS. Emphasises the runway and re-states the threat
 * model, and gives the user a head-start on planning a replacement.
 */
function DeviceEolSoon({ snapshot, product, release, classification, onReset }) {
  const t = useTranslations();
  const displayLabel = buildDisplayLabel(product, release);
  const eolDate = classification.effectiveEolFrom;
  const months = eolDate
    ? Math.max(0, Math.round((new Date(eolDate) - new Date()) / (30.44 * 24 * 60 * 60 * 1000)))
    : null;

  const title = months != null && months > 0
    ? t('updates.result.eolSoon.titleMonths', { label: displayLabel, months })
    : t('updates.result.eolSoon.titleSoon', { label: displayLabel });

  const subtitle = eolDate
    ? t('updates.result.eolSoon.subtitleDate', { date: formatMonthYear(eolDate) })
    : null;

  return (
    <SlideInBox>
      <ResultBox tone="amber" icon={AlertTriangle} title={title} subtitle={subtitle}>
        <PrescriptionLine formFactor={product.formFactor} urgency="plan" />
        <ThreatModelBlock />
        <BuyingGuidance formFactor={product.formFactor} />
        <ResultActions product={product} onReset={onReset} />
      </ResultBox>
    </SlideInBox>
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
    <SlideInBox>
      <ResultBox
        tone="red"
        icon={XCircle}
        title={t('updates.result.deviceUnsupportedTitle', { label: displayLabel })}
        subtitle={subtitle}
      >
        <PrescriptionLine formFactor={product.formFactor} urgency="replace" />
        <ThreatModelBlock />
        <BuyingGuidance formFactor={product.formFactor} />
        <ResultActions product={product} onReset={onReset} />
      </ResultBox>
    </SlideInBox>
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
      >
        <SettingsPathInline osId={product.id} />
        {product.id === 'windows' ? (
          <p className="text-sm text-foreground/90">{t('updates.result.windowsUpdateHelp')}</p>
        ) : null}
        {release.isEoas && !release.isEol ? (
          <p className="text-sm text-muted-foreground">{t('updates.result.osEoasNote')}</p>
        ) : null}
        <ResultActions product={product} onReset={onReset} />
      </ResultBox>
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
    <SlideInBox>
      <ResultBox
        tone="red"
        icon={XCircle}
        title={t('updates.result.osUnsupportedTitle', { label: displayLabel })}
        subtitle={
          release.eolFrom
            ? t('updates.result.osUnsupportedSubtitleEnded', { date: formatMonthYear(release.eolFrom) })
            : null
        }
      >
        {advice ? (
          <div className="space-y-2">
            <p className="text-xl font-bold leading-snug text-foreground sm:text-2xl">
              {advice}
            </p>
            <p className="text-sm text-foreground/90">
              {t('updates.result.osCheckDeviceHint')}
            </p>
          </div>
        ) : null}
        <ThreatModelBlock />
        <ResultActions product={product} onReset={onReset} />
      </ResultBox>
    </SlideInBox>
  );
}

/* ────────── Public component ────────── */

export default function ResultCard({ snapshot, product, release, onReset }) {
  const classification = classifyResult({ product, release }, { snapshot });

  const Variant = {
    'device-supported': DeviceSupported,
    'device-eol-soon': DeviceEolSoon,
    'device-uncertain': DeviceUncertain,
    'device-eol': DeviceEol,
    'os-supported': OsSupported,
    // OS approaching EOL reuses the OsSupported component for now (still receiving
    // updates today) — the only behavioural diff is the warning copy lands via the
    // existing osEoasNote / latestVersion subtitle. We can split this later if needed.
    'os-eol-soon': OsSupported,
    'os-eol': OsEol,
  }[classification.variant];

  if (!Variant) return null;

  return (
    <div className="space-y-4">
      <SlideInBox>
        <DeviceInfoCard product={product} release={release} onReset={onReset} />
      </SlideInBox>
      <Variant
        snapshot={snapshot}
        product={product}
        release={release}
        onReset={onReset}
        classification={classification}
      />
    </div>
  );
}
