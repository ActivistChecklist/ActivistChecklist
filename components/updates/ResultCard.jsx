'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Check,
  Clock,
  History,
  ShieldAlert,
  ShoppingCart,
} from 'lucide-react';

import Link from '@/components/Link';
import { cn } from '@/lib/utils';
import {
  buildAppleSupportEstimate,
  classifyResult,
  buildLatestOsReminder,
  buildDeviceMaxOsWarning,
  buildOsCheckOptions,
  buildStuckOnOldOsClassification,
  latestPickerMajor,
  updateYearsFor,
} from '@/lib/updates/result-logic';
import { osProductForDevice } from '@/lib/updates/snapshot';
import { buildDisplayLabel } from '@/lib/updates/search';
import { useAnalytics } from '@/hooks/use-analytics';

const ESSENTIALS_HREF = '/essentials/';

// Result-card stagger. Each delay is expressed as the previous step plus an offset so
// the cumulative timing is obvious and easy to retune. Selecting a device shows the
// device card immediately (no entry); subsequent boxes slide in on this beat.
const STAGGER_FIRST_OFFSET = 300;   // first result box appears this long after selection
const STAGGER_NEXT_OFFSET = 1000;   // each subsequent box waits this long after the previous
const STAGGER_FIRST_MS = STAGGER_FIRST_OFFSET;                       // 300ms
const STAGGER_SECOND_MS = STAGGER_FIRST_MS + STAGGER_NEXT_OFFSET;    // 1300ms
const STAGGER_THIRD_MS = STAGGER_SECOND_MS + STAGGER_NEXT_OFFSET;    // 2300ms

/**
 * Render handler for the `<b>` rich tag we wrap the date in across subtitle messages
 * like "Security support ended <b>May 2023</b>". Slightly heavier weight + full
 * foreground colour so the date pops out of the muted subtitle text.
 */
const boldDateChunks = (chunks) => (
  <strong className="font-semibold text-foreground">{chunks}</strong>
);

/**
 * Map a classifyResult variant to the analytics patch-state value. Kept narrow on
 * purpose — we send only this category, never the device label or ID, so the
 * counter remains aggregate-only and free of personal context.
 */
function patchStateFor(classification) {
  switch (classification?.variant) {
    case 'device-supported':
    case 'os-supported':
      return 'patches_receiving';
    case 'device-eol-soon':
    case 'os-eol-soon':
      return 'patches_eol_soon';
    case 'device-eol':
    case 'os-eol':
      return 'patches_eol';
    case 'device-uncertain':
      return 'patches_unknown';
    default:
      return 'patches_unknown';
  }
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

/**
 * True after `ms` has elapsed since the component mounted. Used to stagger result-box
 * appearance — see STAGGER_FIRST_MS / STAGGER_SECOND_MS / STAGGER_THIRD_MS for the
 * actual values. Step transitions (e.g. picker → needs-update) inside DeviceSupported
 * don't reset these timers since the hook is owned by the surrounding component, not
 * the step-keyed children.
 */
function useDelayedMount(ms) {
  const [mounted, setMounted] = useState(ms === 0);
  useEffect(() => {
    if (ms === 0) return undefined;
    const id = setTimeout(() => setMounted(true), ms);
    return () => clearTimeout(id);
  }, [ms]);
  return mounted;
}

/**
 * Wraps a result block in a slide-up + fade-in. Pair with a `key` prop on the
 * caller to replay the animation when contents swap (e.g. picker → success).
 */
function SlideInBox({ children, className }) {
  return (
    <div
      className={cn(
        // 700ms feels deliberate — fast enough to not stall the user, slow enough that
        // the slide reads as a separate beat instead of a flash.
        'animate-in fade-in slide-in-from-bottom-2 duration-700',
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * Convenience wrapper: render `children` only after `delayMs` has elapsed, then
 * animate them in via SlideInBox with a tone-coloured down-arrow connector on top.
 * `connectorTone` defaults to 'input' since the most common case is the first box
 * after the device card; pass null to skip the connector for boxes that shouldn't
 * have one.
 */
function DelayedSlideInBox({ delayMs, connectorTone = 'input', children }) {
  const ready = useDelayedMount(delayMs);
  if (!ready) return null;
  return (
    <SlideInBox>
      {connectorTone ? (
        <ConnectedBox tone={connectorTone}>{children}</ConnectedBox>
      ) : (
        children
      )}
    </SlideInBox>
  );
}

/**
 * Stem-and-arrowhead connector that physically bridges one result box and the next.
 * Drawn as a small custom SVG so the stem and arrowhead are sized for this exact
 * use (a generic 24×24 lucide icon read as a floating decoration rather than a
 * connector). Colour matches the border tone of the box ABOVE.
 *
 * Tone opacity is /50 to mirror the box border opacity, with `input` mapping to
 * the neutral input colour at full opacity. Used inside a sibling stack with no
 * outer space-y so the arrow IS the visual gap between boxes.
 */
const CONNECTOR_TONE_COLOR = {
  input: 'text-input',
  primary: 'text-primary/50',
  success: 'text-success/50',
  warning: 'text-warning/50',
  destructive: 'text-destructive/50',
};

function BoxConnector({ tone = 'input' }) {
  const colorClass = CONNECTOR_TONE_COLOR[tone] ?? CONNECTOR_TONE_COLOR.input;
  // The connector IS the gap between boxes (no extra margin needed), so callers
  // place it directly between siblings with no surrounding space-y. The stem
  // sits flush against the box above; the arrowhead at the bottom sits flush
  // against the box below. SVG dimensions chosen so the visible arrow is
  // generous without overwhelming the narrow result-card column.
  return (
    <div className="flex justify-center" aria-hidden="true">
      <svg
        width="20"
        height="28"
        viewBox="0 0 20 28"
        fill="none"
        className={colorClass}
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <line x1="10" y1="0" x2="10" y2="22" />
        <polyline points="4,18 10,26 16,18" />
      </svg>
    </div>
  );
}

/**
 * Internal layout for a result block that sits below another box: a tone-coloured
 * connector + the actual box content. Uses no internal spacing because the
 * connector already manages its own bridging via negative margins.
 */
function ConnectedBox({ tone, children }) {
  return (
    <>
      <BoxConnector tone={tone} />
      {children}
    </>
  );
}

// /50 opacity gives the tone borders the same visual weight as the device card's
// full-opacity neutral border-input, so the stack of boxes reads as a uniform
// stroke weight rather than the headline box looking dimmer than the others.
const TONE_RING = {
  green: 'border-success/50 bg-success/5',
  red: 'border-destructive/50 bg-destructive/5',
  amber: 'border-warning/50 bg-warning/5',
  primary: 'border-primary/50 bg-primary/5',
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
      <CrossResetButton product={product} onReset={onReset} />
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
        {soft
          ? t('updates.result.threatModelSoft')
          : t.rich('updates.result.threatModel', {
              spywareLink: (chunks) => (
                <Link href="/spyware/" className="text-primary underline">
                  {chunks}
                </Link>
              ),
            })}
      </p>
    </div>
  );
}

/**
 * Guidance shown alongside the EOL action: typical update windows + a nudge to
 * pre-check used purchases through this same tool. `family` lets the window
 * pick up Apple-specific overrides (Apple phones/tablets get 7.5-8 years,
 * tighter than the cross-vendor 5-7).
 */
function BuyingGuidance({ family, formFactor }) {
  const t = useTranslations();
  const spec = updateYearsFor(family, formFactor);
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
 * Always routes through t.rich (with a <code> handler) so messages containing
 * rich tags like <code>winver</code> don't trip a FORMATTING_ERROR when the
 * tag handler isn't supplied. Existence is checked via t.has so missing keys
 * return null instead of formatting-the-key-as-string.
 */
function pathFromKey(t, key) {
  if (!t.has(key)) return null;
  return t.rich(key, {
    code: (chunks) => (
      <code className="rounded bg-muted px-1 py-0.5 font-mono text-base text-foreground">
        {chunks}
      </code>
    ),
  });
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
 *
 * When we have an explicit eolFrom we show "Updates expected through {date}".
 * Apple devices don't get end-of-support dates published, so we fall back to a brief
 * disclaimer + typical-update-window estimate so the user still has a sense of how
 * much runway they're working with.
 */
function DeviceConfirmedSummary({ product, release, displayLabel }) {
  const t = useTranslations();
  const appleEstimate = buildAppleSupportEstimate(product, release);
  const deviceLabel = appleEstimate
    ? t(`updates.result.buyingGuidance.deviceLabel.${appleEstimate.deviceLabelKey}`)
    : null;

  return (
    <div className="flex items-start gap-3 rounded-lg border-2 border-success/50 bg-success/5 p-4">
      <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-success" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-base font-medium text-foreground sm:text-lg">
          {t('updates.result.deviceConfirmedShort', { label: displayLabel })}
        </p>
        {release.eolFrom ? (
          <p className="text-xs text-muted-foreground">
            {t.rich('updates.result.deviceSupportedSubtitleUntil', {
              date: formatMonthYear(release.eolFrom),
              b: boldDateChunks,
            })}
          </p>
        ) : appleEstimate ? (
          <div className="space-y-1 pt-0.5 text-xs leading-relaxed text-muted-foreground">
            <p>
              {t('updates.result.appleEstimate.intro', {
                deviceLabel,
                min: appleEstimate.minYears,
                max: appleEstimate.maxYears,
              })}
            </p>
            <p className="font-medium text-foreground/80">
              {appleEstimate.case === 'years-range'
                ? t('updates.result.appleEstimate.remainingYearsRange', {
                    min: appleEstimate.remainingMinYears,
                    max: appleEstimate.remainingMaxYears,
                  })
                : appleEstimate.case === 'years-up-to'
                  ? t('updates.result.appleEstimate.remainingYearsUpTo', {
                      max: appleEstimate.remainingMaxYears,
                    })
                  : t('updates.result.appleEstimate.remainingMonthsUpTo', {
                      max: appleEstimate.remainingMaxMonths,
                    })}
            </p>
          </div>
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
  const { trackEvent } = useAnalytics();
  const options = buildOsCheckOptions(snapshot, product, release);

  const osProduct = osProductForDevice(snapshot, product);
  const osId = osProduct?.id || null;
  const deviceNoun = deviceNounFor(t, product.formFactor);

  // Wrap the parent's pick handlers so every picker click logs whether the user
  // declared they're on the latest version or on something older. The outer
  // handler still owns step transitions.
  function handlePickLatest(opt) {
    trackEvent({ name: 'update_os_version_clicked', value: 'version_latest' });
    onPickLatest(opt);
  }
  function handlePickOlder(opt) {
    trackEvent({ name: 'update_os_version_clicked', value: 'version_old' });
    onPickOlder(opt);
  }

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
    <div className="rounded-lg border-2 border-primary/50 bg-primary/5 p-6">
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
                    icon={History}
                    iconTone="destructive"
                    onClick={() => handlePickOlder(opt)}
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
                    icon={CheckCircle2}
                    iconTone="success"
                    onClick={() => handlePickLatest(opt)}
                    label={
                      opt.codename
                        ? t('updates.result.osCheckStep.optionLatestCodename', {
                            device: deviceNoun,
                            os: osLabel || '',
                            version: opt.latestVersion,
                            codename: opt.codename,
                          })
                        : t('updates.result.osCheckStep.optionLatest', {
                            device: deviceNoun,
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
                  icon={CheckCircle2}
                  iconTone="success"
                  onClick={() => handlePickLatest(opt)}
                  label={
                    opt.codename
                      ? t('updates.result.osCheckStep.optionMajorCodename', {
                          device: deviceNoun,
                          os: osLabel || '',
                          major: opt.major,
                          codename: opt.codename,
                        })
                      : t('updates.result.osCheckStep.optionMajor', {
                          device: deviceNoun,
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
            icon={CheckCircle2}
            iconTone="success"
            onClick={() => handlePickLatest(null)}
            label={t('updates.result.osNeedsUpdate.didUpdateButton')}
          />
        )}
        {options.length > 0 ? (
          <button
            type="button"
            onClick={() => handlePickOlder(null)}
            className="pt-1 text-sm text-muted-foreground hover:text-foreground"
          >
            {t('updates.result.osCheckStep.optionUnknown')}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Outline-style action button for the OS picker / needs-update flow. All buttons
 * share the same primary outline; OS version buttons differentiate "older" from
 * "up to date" via icon colour (destructive vs success) so the button row reads
 * as a flat set of choices with semantic accents on the icons.
 *
 * `tone="destructive"` is still available for non-version buttons that need a
 * stronger visual cue across the whole button (kept for future use; not currently
 * wired in). `iconTone` ('success' | 'destructive') colours just the icon.
 */
function PickerButton({ onClick, label, tone = 'primary', icon: IconProp, iconTone }) {
  const toneClasses = tone === 'destructive'
    ? 'border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground focus-visible:ring-destructive/40'
    : 'border-primary text-primary hover:bg-primary hover:text-primary-foreground focus-visible:ring-primary/40';
  // Icon colour overrides — applied to the icon only, leaving the button's text
  // colour (current foreground when not hovered) intact. On hover the button
  // fills primary; the icon's explicit colour stays put against that fill,
  // which still reads since success/destructive are high-contrast against the
  // primary fill.
  const iconToneClass = iconTone === 'success'
    ? 'text-success'
    : iconTone === 'destructive'
      ? 'text-destructive'
      : null;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border-2 px-4 py-2 text-sm font-medium transition-colors',
        'focus-visible:outline-hidden focus-visible:ring-2',
        toneClasses
      )}
    >
      {IconProp ? (
        <IconProp className={cn('h-4 w-4 shrink-0', iconToneClass)} aria-hidden="true" />
      ) : null}
      <span>{label}</span>
    </button>
  );
}

/**
 * Localised noun for the picker label "My {device} is running {os} {version}". Falls
 * back to the generic "device" when we don't have a more specific word for the form
 * factor (or the translation is missing).
 */
function deviceNounFor(t, formFactor) {
  const key = ['phone', 'tablet', 'laptop', 'desktop', 'watch'].includes(formFactor)
    ? formFactor
    : 'generic';
  try {
    const v = t(`updates.result.deviceNoun.${key}`);
    if (v && !v.startsWith('updates.result.deviceNoun.')) return v;
  } catch {
    /* fall through */
  }
  return t('updates.result.deviceNoun.generic');
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

/**
 * Warning box shown after the OS picker. Two flavours:
 *
 *   `uncertain=false` (user clicked an explicit "Older than X" button) → the existing
 *   "needs an update" copy with a single "Done, I've updated" CTA.
 *
 *   `uncertain=true` (user clicked "Not sure") → softened to "might need an update"
 *   plus a second CTA: "No updates available and I'm on a version older than {latest}".
 *   That second CTA escalates the result to the device-EOL red screen because if the
 *   device can't pick up newer majors, the user is effectively stranded on EOL software.
 *
 * `latestOption` is the highest still-supported major in the picker (null when the
 * picker had no enumerable majors — e.g. OnePlus, watches without OS lookup).
 */
function OsNeedsUpdateBox({
  snapshot,
  product,
  uncertain = false,
  latestOption = null,
  onDidUpdate,
  onNoUpdatesAvailable,
}) {
  const t = useTranslations();
  const osProduct = osProductForDevice(snapshot, product);
  const osId = osProduct?.id || null;
  // Prefer the dedicated update-path copy; fall back to the version-finding path so
  // we never end up with a "How to update:" heading sitting above empty space when a
  // settingsPath translation is missing for the resolved OS id.
  const updatePath = osId ? (osUpdatePath(t, osId) || osVersionPath(t, osId)) : null;

  let osLabel = null;
  if (osId) {
    try {
      osLabel = t(`updates.result.supportedOsLabel.${osId}`);
    } catch {
      osLabel = osProduct?.label || null;
    }
  }

  const heading = uncertain
    ? t('updates.result.osNeedsUpdate.headingMaybe')
    : t('updates.result.osNeedsUpdate.heading');

  const noUpdatesLabel = (() => {
    if (!uncertain || !latestOption || !osLabel) return null;
    return latestOption.codename
      ? t('updates.result.osNeedsUpdate.noUpdatesAvailableButtonCodename', {
          os: osLabel,
          major: latestOption.major,
          codename: latestOption.codename,
        })
      : t('updates.result.osNeedsUpdate.noUpdatesAvailableButton', {
          os: osLabel,
          major: latestOption.major,
        });
  })();

  return (
    <div className="rounded-lg border-2 border-warning/50 bg-warning/5 p-6">
      <div className="flex items-start gap-4">
        <AlertTriangle className="h-12 w-12 shrink-0 text-warning" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-3">
          <h2 className="text-2xl font-semibold leading-tight text-foreground sm:text-3xl">
            {heading}
          </h2>
          <p className="text-base text-foreground/80">
            {t('updates.result.osNeedsUpdate.body')}
          </p>

          {updatePath ? (
            <div className="space-y-2 pt-1">
              <p className="text-sm font-semibold text-foreground/80">
                {t('updates.result.osNeedsUpdate.howToHeading')}
              </p>
              {/* OsNeedsUpdateBox is asking the user to UPDATE → settingsPath (final action) */}
              <PromMenuPath>{updatePath}</PromMenuPath>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2 pt-2">
            <PickerButton
              icon={CheckCircle2}
              iconTone="success"
              onClick={onDidUpdate}
              label={t('updates.result.osNeedsUpdate.didUpdateButton')}
            />
            {noUpdatesLabel && onNoUpdatesAvailable ? (
              <PickerButton
                icon={History}
                iconTone="destructive"
                onClick={onNoUpdatesAvailable}
                label={noUpdatesLabel}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function DeviceSupported({ snapshot, product, release, onReset }) {
  const displayLabel = buildDisplayLabel(product, release);
  // step: 'pick' | 'success' | 'needs-update' | 'needs-update-uncertain' | 'stuck-on-old-os'
  const [step, setStep] = useState('pick');
  const [pickedOption, setPickedOption] = useState(null);
  const options = buildOsCheckOptions(snapshot, product, release);
  const latestOption = latestPickerMajor(options);
  // Only render the max-OS warning slot when there's actually a warning to show —
  // otherwise the slot contains just a connector arrow with nothing below it,
  // which reads as a trailing arrow off the last visible box.
  const maxOsReminder = buildLatestOsReminder(snapshot, product, release);
  const maxOsWarning = buildDeviceMaxOsWarning(snapshot, product, release, maxOsReminder);
  const showMaxOsWarning = Boolean(maxOsWarning);

  // Initial-render stagger so the result reveals in beat with the device card.
  // Step transitions reuse these flags (which are already true) and animate via
  // the keyed inner SlideInBox — they shouldn't pay the entry cost again.
  const showFirst = useDelayedMount(STAGGER_FIRST_MS);
  const showSecond = useDelayedMount(STAGGER_SECOND_MS);
  const showThird = useDelayedMount(STAGGER_THIRD_MS);

  function pickLatest(opt) {
    setPickedOption(opt);
    setStep('success');
  }
  // `uncertain` distinguishes "I clicked Older than X.Y.Z" (we know roughly where they
  // sit) from "I clicked Not sure" (we don't, so the box softens its language and adds
  // an exit hatch to the device-EOL screen).
  function pickOlder(opt) {
    setPickedOption(opt);
    setStep(opt ? 'needs-update' : 'needs-update-uncertain');
  }
  function didUpdate() {
    setStep('success');
  }
  function declareNoUpdatesAvailable() {
    setStep('stuck-on-old-os');
  }

  // Tone of the step block, used to colour the connector between the step block and
  // the max-OS warning below. 'pick' is the primary picker box; needs-update is the
  // amber warning; success is the green final box.
  const stepTone = step === 'pick'
    ? 'primary'
    : step === 'needs-update' || step === 'needs-update-uncertain'
      ? 'warning'
      : 'success';

  return (
    // No outer space-y — the BoxConnector inside each ConnectedBox IS the gap
    // between siblings. Keeping anything > 0 here would push the boxes apart
    // and break the "arrow touches both" look.
    <div className="space-y-0">
      {showFirst ? (
        <SlideInBox>
          <ConnectedBox tone="input">
            <DeviceConfirmedSummary product={product} release={release} displayLabel={displayLabel} />
          </ConnectedBox>
        </SlideInBox>
      ) : null}

      {showSecond ? (
        // keyed by `step` so each transition between picker / needs-update / success
        // re-mounts the inner box and replays the slide-up + fade-in.
        <SlideInBox key={step}>
          <ConnectedBox tone="success">
            {step === 'pick' ? (
              <OsPickerStep
                snapshot={snapshot}
                product={product}
                release={release}
                onPickLatest={pickLatest}
                onPickOlder={pickOlder}
              />
            ) : step === 'needs-update' || step === 'needs-update-uncertain' ? (
              <OsNeedsUpdateBox
                snapshot={snapshot}
                product={product}
                uncertain={step === 'needs-update-uncertain'}
                latestOption={latestOption}
                onDidUpdate={didUpdate}
                onNoUpdatesAvailable={declareNoUpdatesAvailable}
              />
            ) : step === 'stuck-on-old-os' ? (
              <DeviceEolBox
                product={product}
                release={release}
                classification={buildStuckOnOldOsClassification(release)}
                onReset={onReset}
              />
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
          </ConnectedBox>
        </SlideInBox>
      ) : null}

      {showThird && step !== 'stuck-on-old-os' && showMaxOsWarning ? (
        <SlideInBox>
          <ConnectedBox tone={stepTone}>
            <DeviceMaxOsWarning snapshot={snapshot} product={product} release={release} />
          </ConnectedBox>
        </SlideInBox>
      ) : null}
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

  // Render major + codename together for OSes that publish a codename ("13 Ventura",
  // "16 (Baklava)") so the user can match what they see in their device's About screen.
  const maxLabel = warning.maxCodename
    ? `${warning.maxMajor} (${warning.maxCodename})`
    : String(warning.maxMajor);
  const latestLabel = warning.latestCodename
    ? `${warning.latestMajor} (${warning.latestCodename})`
    : String(warning.latestMajor);

  if (warning.kind === 'older-os-eol') {
    return (
      <div className="rounded-md border-2 border-warning/50 bg-warning/5 p-4">
        <p className="text-sm font-medium text-foreground">
          {t('updates.result.deviceMaxOsWarningTitle')}
        </p>
        <p className="mt-1 text-sm text-foreground/90">
          {t('updates.result.deviceMaxOsEolWarning', {
            label: product.label,
            os: osLabel,
            maxVersion: maxLabel,
          })}
        </p>
      </div>
    );
  }

  const message = warning.maxEolDate
    ? t('updates.result.deviceMaxOsWarningWithDate', {
        label: product.label,
        os: osLabel,
        maxVersion: maxLabel,
        eolDate: formatMonthYear(warning.maxEolDate),
        latestVersion: latestLabel,
      })
    : t('updates.result.deviceMaxOsWarning', {
        label: product.label,
        os: osLabel,
        maxVersion: maxLabel,
        latestVersion: latestLabel,
      });

  return (
    <div className="rounded-md border-2 border-warning/50 bg-warning/5 p-4">
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
    <DelayedSlideInBox delayMs={STAGGER_FIRST_MS}>
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
    </DelayedSlideInBox>
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
    ? t.rich('updates.result.eolSoon.subtitleDate', {
        date: formatMonthYear(eolDate),
        b: boldDateChunks,
      })
    : null;

  return (
    <DelayedSlideInBox delayMs={STAGGER_FIRST_MS}>
      <ResultBox tone="amber" icon={Clock} title={title} subtitle={subtitle}>
        <PrescriptionLine formFactor={product.formFactor} urgency="plan" />
        <ThreatModelBlock />
        <BuyingGuidance family={product.family} formFactor={product.formFactor} />
        <ResultActions product={product} onReset={onReset} />
      </ResultBox>
    </DelayedSlideInBox>
  );
}

/**
 * The red EOL box itself, without an animation wrapper. Split out so the
 * DeviceSupported "stuck on old OS" branch can drop it inside its keyed step
 * SlideInBox without doubling up wrappers (which would also re-trigger the
 * initial-mount stagger when the user's actually mid-flow).
 */
function DeviceEolBox({ product, release, classification, onReset }) {
  const t = useTranslations();
  const displayLabel = buildDisplayLabel(product, release);

  let subtitle = null;
  if (classification.reason === 'eolFrom-past' && release.eolFrom) {
    subtitle = t.rich('updates.result.deviceUnsupportedSubtitleEnded', {
      date: formatMonthYear(release.eolFrom),
      b: boldDateChunks,
    });
  } else if (classification.reason === 'unmaintained') {
    subtitle = t('updates.result.deviceUnsupportedSubtitleUnmaintained');
  } else if (classification.reason === 'age-heuristic-old') {
    subtitle = t('updates.result.deviceUnsupportedSubtitleAge', {
      age: formatYearsAgo(classification.ageYears, t),
    });
  } else if (classification.reason === 'eoas-past' && release.eoasFrom) {
    subtitle = t.rich('updates.result.deviceUnsupportedSubtitleEnded', {
      date: formatMonthYear(release.eoasFrom),
      b: boldDateChunks,
    });
  } else if (classification.reason === 'user-stuck-on-old-os') {
    // User just told us "no updates available, I'm older than the latest" — this is a
    // direct attestation that the device can't reach a supported OS.
    subtitle = t('updates.result.deviceUnsupportedSubtitleStuckOnOs');
  } else {
    subtitle = t('updates.result.deviceUnsupportedSubtitleUnmaintained');
  }

  return (
    <ResultBox
      tone="red"
      icon={XCircle}
      title={t('updates.result.deviceUnsupportedTitle', { label: displayLabel })}
      subtitle={subtitle}
    >
      <PrescriptionLine formFactor={product.formFactor} urgency="replace" />
      <ThreatModelBlock />
      <BuyingGuidance family={product.family} formFactor={product.formFactor} />
      <ResultActions product={product} onReset={onReset} />
    </ResultBox>
  );
}

function DeviceEol(props) {
  return (
    <DelayedSlideInBox delayMs={STAGGER_FIRST_MS}>
      <DeviceEolBox {...props} />
    </DelayedSlideInBox>
  );
}

function OsSupported({ product, release, onReset }) {
  const t = useTranslations();
  const displayLabel = buildDisplayLabel(product, release);

  return (
    <DelayedSlideInBox delayMs={STAGGER_FIRST_MS}>
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
    </DelayedSlideInBox>
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
    <DelayedSlideInBox delayMs={STAGGER_FIRST_MS}>
      <ResultBox
        tone="red"
        icon={XCircle}
        title={t('updates.result.osUnsupportedTitle', { label: displayLabel })}
        subtitle={
          release.eolFrom
            ? t.rich('updates.result.osUnsupportedSubtitleEnded', {
                date: formatMonthYear(release.eolFrom),
                b: boldDateChunks,
              })
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
    </DelayedSlideInBox>
  );
}

/* ────────── Public component ────────── */

export default function ResultCard({ snapshot, product, release, onReset }) {
  const classification = classifyResult({ product, release }, { snapshot });
  const { trackEvent } = useAnalytics();
  // Fire once per ResultCard mount. UpdatesPage keys this component by product/release,
  // so a new selection re-mounts and re-fires; reset/edit unmounts so we don't double-log.
  useEffect(() => {
    trackEvent({
      name: 'update_device_selected',
      value: patchStateFor(classification),
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // The DeviceInfoCard used to live here; it's now rendered by UpdatesPage in the
  // search-input slot so picking a device feels like the input transforming in place
  // rather than the result block growing in below an empty input.
  return (
    <Variant
      snapshot={snapshot}
      product={product}
      release={release}
      onReset={onReset}
      classification={classification}
    />
  );
}
