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
  formatTimeSince,
  formatTimeUntil,
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
  // 'input' tone matches the device-card border (muted-foreground at /50) so
  // the arrow reads at roughly the same weight as the tone arrows below.
  input: 'text-muted-foreground/50',
  primary: 'text-primary/50',
  success: 'text-success/50',
  warning: 'text-warning/50',
  destructive: 'text-destructive/50',
};

function BoxConnector({ tone = 'input' }) {
  const colorClass = CONNECTOR_TONE_COLOR[tone] ?? CONNECTOR_TONE_COLOR.input;
  // Custom stem-and-arrowhead SVG: longer stem and deeper V than any lucide
  // icon ships, sized for this exact connector role. The slight visual overlap
  // at the join (stem ends y=22, V wing tips at y=18) is preferred to the
  // small-but-visibly-floaty lucide MoveDown swap we tried earlier.
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
 * Action row at the bottom of every result. Now hosts only the cross-reset button
 * (outline primary) — the essentials CTA moved out of this row into its own
 * EssentialsNextSteps panel below the result, where it gets the filled-primary
 * weight that signals the recommended next step.
 */
function ResultActions({ product, onReset }) {
  return (
    <div className="mt-5 flex flex-wrap items-center gap-2">
      <CrossResetButton product={product} onReset={onReset} />
    </div>
  );
}

/**
 * Standalone panel that appears below every result (success or failure) with
 * a connector arrow to the box above. Gray outline shell mirrors the device
 * card so the panel reads as 'related to but separate from' the colored
 * result. Filled-primary CTA so the essentials link is visually heavier than
 * the outline cross-reset button above.
 */
function EssentialsPanel() {
  const t = useTranslations();
  return (
    <div className="rounded-lg border-2 border-muted-foreground/50 bg-background px-4 py-4 shadow-sm sm:py-5">
      <h3 className="text-base font-semibold text-foreground sm:text-lg">
        {t('updates.result.essentialsNextSteps.title')}
      </h3>
      <Link
        href={ESSENTIALS_HREF}
        className={cn(
          'mt-3 inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-primary bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity',
          'hover:opacity-90',
          'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/40'
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
function DeviceConfirmedSummary({ product, release, displayLabel, classification }) {
  const t = useTranslations();
  const appleEstimate = buildAppleSupportEstimate(product, release);
  const deviceLabel = appleEstimate
    ? t(`updates.result.buyingGuidance.deviceLabel.${appleEstimate.deviceLabelKey}`)
    : null;

  // Build the title with a time-remaining chip when we know how long the device
  // will keep getting updates. Three sources, in priority order:
  //   1. classification.effectiveEolFrom — device's own eolFrom (Pixel/Samsung
  //      where the manufacturer publishes it) or, for Macs we classified via
  //      device-max-os-supported, the OS major's eolFrom. This is "exact" so
  //      the chip says "another X" with no hedge.
  //   2. buildAppleSupportEstimate — Apple has no published date, so use the
  //      typical-window estimate. Chip prefixes "approximately another X".
  //   3. Neither: render the plain "still receiving security updates" title.
  const exactRemaining = formatTimeUntil(classification?.effectiveEolFrom);
  const approxRemaining = !exactRemaining && appleEstimate
    ? (appleEstimate.case === 'months-up-to'
        ? { months: appleEstimate.remainingMaxMonths }
        : { years: appleEstimate.remainingMaxYears })
    : null;
  // Highlight chip styled to match the green confirmed-summary panel: bg-success
  // matches the icon, text-background inverts to the page colour to read well in
  // both themes. inline-block whitespace-nowrap keeps the phrase atomic.
  const successChipChunks = (chunks) => (
    <mark className="inline-block whitespace-nowrap rounded-md bg-success px-1.5 py-0.5 text-background">
      {chunks}
    </mark>
  );
  let titleNode;
  if (exactRemaining?.years) {
    titleNode = t.rich('updates.result.deviceConfirmedShortYears', {
      label: displayLabel,
      years: exactRemaining.years,
      mark: successChipChunks,
    });
  } else if (exactRemaining?.months) {
    titleNode = t.rich('updates.result.deviceConfirmedShortMonths', {
      label: displayLabel,
      months: exactRemaining.months,
      mark: successChipChunks,
    });
  } else if (approxRemaining?.years) {
    titleNode = t.rich('updates.result.deviceConfirmedShortApproxYears', {
      label: displayLabel,
      years: approxRemaining.years,
      mark: successChipChunks,
    });
  } else if (approxRemaining?.months) {
    titleNode = t.rich('updates.result.deviceConfirmedShortApproxMonths', {
      label: displayLabel,
      months: approxRemaining.months,
      mark: successChipChunks,
    });
  } else {
    titleNode = t('updates.result.deviceConfirmedShort', { label: displayLabel });
  }

  return (
    <div className="flex items-start gap-3 rounded-lg border-2 border-success/50 bg-success/5 p-4">
      <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-success" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-base font-medium text-foreground sm:text-lg">
          {titleNode}
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
            <p className="text-foreground/80">
              {appleEstimate.case === 'years-range'
                ? t.rich('updates.result.appleEstimate.remainingYearsRange', {
                    min: appleEstimate.remainingMinYears,
                    max: appleEstimate.remainingMaxYears,
                    b: boldDateChunks,
                  })
                : appleEstimate.case === 'years-about'
                  ? t.rich('updates.result.appleEstimate.remainingYearsAbout', {
                      years: appleEstimate.remainingMaxYears,
                      b: boldDateChunks,
                    })
                  : appleEstimate.case === 'years-up-to'
                    ? t.rich('updates.result.appleEstimate.remainingYearsUpTo', {
                        max: appleEstimate.remainingMaxYears,
                        b: boldDateChunks,
                      })
                    : t.rich('updates.result.appleEstimate.remainingMonthsUpTo', {
                        max: appleEstimate.remainingMaxMonths,
                        b: boldDateChunks,
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

  // OSes with point versions (iOS / macOS / Windows) let us ask 'which patch
  // version are you on?' directly via the per-major Older/Latest pair. OSes
  // without point versions (Android — patch level is per-device-month, no
  // global version string) can't be confirmed that way, so we ask the simpler
  // and more direct 'are there any updates available?' question. Heading +
  // menu path swap to match: version-find for iOS-style, update-check for
  // Android-style.
  const hasPointVersions = options.some((o) => o.latestVersion);

  const heading = hasPointVersions
    ? (osLabel
        ? t('updates.result.osCheckStep.headingForOs', { os: osLabel })
        : t('updates.result.osCheckStep.headingGeneric'))
    : t('updates.result.osCheckStep.headingUpdatesAvailable', { device: deviceNoun });

  const subheading = hasPointVersions
    ? t('updates.result.osCheckStep.subheadingHelp')
    : t('updates.result.osCheckStep.subheadingUpdatesHelp');

  const menuPath = osId
    ? (hasPointVersions ? osVersionPath(t, osId) : osUpdatePath(t, osId))
    : null;

  return (
    <div className="rounded-lg border-2 border-primary/50 bg-primary/5 p-6">
      <h3 className="text-xl font-semibold leading-tight text-foreground sm:text-2xl">
        {heading}
      </h3>

      {osId && menuPath ? (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-muted-foreground">{subheading}</p>
          <PromMenuPath>{menuPath}</PromMenuPath>
        </div>
      ) : null}

      <div className="mt-5 space-y-2">
        {options.length > 0 ? (() => {
          // OSes with point versions (iOS / macOS / Windows) get a pair PER major
          // — "Older than X.Y.Z" + "X.Y.Z" — so users can flag a stale patch
          // within their current major. OSes without point versions (Android,
          // where there's no global "latest patch" string) get a single binary
          // pair anchored to the device's latest available major: "I'm on Android
          // 16" → success, "Older than Android 16" → warning. This keeps the
          // pick meaningful — picking an older major signals "you should update"
          // rather than the previous one-button-per-major flow that called
          // Android 14 fully patched alongside the latest.
          const hasPointVersions = options.some((o) => o.latestVersion);
          if (hasPointVersions) {
            return options.map((opt) => {
              if (opt.latestVersion) {
                return (
                  <div key={opt.major} className="flex flex-wrap gap-2">
                    <PickerButton
                      icon={History}
                      tone="warning"
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
                      tone="success"
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
              // Mixed case (some majors lack latestVersion) — preserve the prior
              // single-button-per-major rendering for those rows.
              return (
                <div key={opt.major} className="flex flex-wrap gap-2">
                  <PickerButton
                    icon={CheckCircle2}
                    tone="success"
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
            });
          }
          // Android-style: ask the patch-level question directly. options[0] is
          // still passed through to the handlers so OsNeedsUpdateBox can compute
          // its 'No updates available and I'm older than {os} {major}' button
          // and the device-EOL escalation works the same way.
          const latestOpt = options[0];
          return (
            <div className="flex flex-wrap gap-2">
              <PickerButton
                icon={CheckCircle2}
                tone="success"
                onClick={() => handlePickLatest(latestOpt)}
                label={t('updates.result.osCheckStep.optionNoUpdatesAvailable')}
              />
              <PickerButton
                icon={History}
                tone="warning"
                onClick={() => handlePickOlder(latestOpt)}
                label={t('updates.result.osCheckStep.optionUpdatesAvailable')}
              />
            </div>
          );
        })() : (
          // No OS data — single confirmation button (e.g., OnePlus, watches without OS lookup).
          <PickerButton
            icon={CheckCircle2}
            tone="success"
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
 * Outline-style action button for the OS picker / needs-update flow. The whole
 * button takes on the tone — outline + text in tone colour, hover fills it in.
 *
 *   primary     — neutral affirmative
 *   success     — "I'm on the latest" path
 *   warning     — "Older than X" path (you're behind but maybe not EOL yet)
 *   destructive — "No updates available" / I'm definitively stuck
 */
function PickerButton({ onClick, label, tone = 'primary', icon: IconProp }) {
  const toneClasses = {
    primary: 'border-primary text-primary hover:bg-primary hover:text-primary-foreground focus-visible:ring-primary/40',
    success: 'border-success text-success hover:bg-success hover:text-success-foreground focus-visible:ring-success/40',
    // text-warning at the default --warning shade is poor contrast on white in
    // light mode, and warning-foreground (light yellow) is poor contrast on the
    // yellow fill in either mode. Use the darker --text-warning token at rest
    // and black on hover so the button reads in both themes.
    warning: 'border-warning text-[hsl(var(--text-warning))] hover:bg-warning hover:text-black focus-visible:ring-warning/40',
    destructive: 'border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground focus-visible:ring-destructive/40',
  }[tone] || '';
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
      {IconProp ? <IconProp className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
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
  // Outline-primary styling. The recommended next step (the essentials CTA)
  // moved out of this row into the EssentialsPanel below as a filled button,
  // so this cross-form-factor reset button steps down to outline.
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
              tone="success"
              onClick={onDidUpdate}
              label={t('updates.result.osNeedsUpdate.didUpdateButton')}
            />
            {noUpdatesLabel && onNoUpdatesAvailable ? (
              <PickerButton
                icon={History}
                tone="destructive"
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

function DeviceSupported({ snapshot, product, release, classification, onReset }) {
  const displayLabel = buildDisplayLabel(product, release);
  // step: 'pick' | 'success' | 'needs-update' | 'needs-update-uncertain' | 'stuck-on-old-os'
  const [step, setStep] = useState('pick');
  const [pickedOption, setPickedOption] = useState(null);
  const options = buildOsCheckOptions(snapshot, product, release);
  const latestOption = latestPickerMajor(options);
  // The OS picker only makes sense when we can enumerate version options —
  // i.e. when the snapshot has the device's OS product mapped (Apple iPhone →
  // iOS, Pixel → Android, etc). For Apple Watch we don't ship watchOS data, so
  // there's nothing to pick from; we'd otherwise render a hollow 'Which version
  // is your device running?' panel with only a 'Done' button, which reads as
  // broken UI. Skip the slot when there's no OS to pick from.
  const canPickOsVersion = options.length > 0;
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
  // amber warning; success is the green final box; stuck-on-old-os is destructive.
  const stepTone = step === 'pick'
    ? 'primary'
    : step === 'needs-update' || step === 'needs-update-uncertain'
      ? 'warning'
      : step === 'stuck-on-old-os'
        ? 'destructive'
        : 'success';

  // Show the EssentialsPanel once the user has reached a final state. For
  // devices we can't enumerate OS versions for (Apple Watch / OnePlus /
  // watches without OS lookup) the device card IS the final state — no
  // picker step ever runs — so we show it immediately. Otherwise wait for
  // step in success / stuck-on-old-os.
  const isFinalStep = step === 'success' || step === 'stuck-on-old-os';
  const showEssentials = !canPickOsVersion || isFinalStep;
  // Tone of the connector ABOVE the EssentialsPanel matches the LAST visible
  // box. With max-OS warning shown that's warning (yellow); with stuck-on-old-os
  // step that's destructive; with no picker (Apple Watch) that's the
  // confirmed-summary success; otherwise it's the step block's tone.
  const essentialsTone = !canPickOsVersion
    ? 'success'
    : showMaxOsWarning && step !== 'stuck-on-old-os'
      ? 'warning'
      : stepTone;

  return (
    // No outer space-y — the BoxConnector inside each ConnectedBox IS the gap
    // between siblings. Keeping anything > 0 here would push the boxes apart
    // and break the "arrow touches both" look.
    <div className="space-y-0">
      {showFirst ? (
        <SlideInBox>
          <ConnectedBox tone="input">
            <DeviceConfirmedSummary product={product} release={release} displayLabel={displayLabel} classification={classification} />
          </ConnectedBox>
        </SlideInBox>
      ) : null}

      {showSecond && canPickOsVersion ? (
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

      {showFirst && showEssentials ? (
        <SlideInBox>
          <ConnectedBox tone={essentialsTone}>
            <EssentialsPanel />
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
    <>
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
    <DelayedSlideInBox delayMs={STAGGER_SECOND_MS} connectorTone="warning">
      <EssentialsPanel />
    </DelayedSlideInBox>
    </>
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

  // Time-to-EOL phrase rendered as a warning-coloured highlight chip so the
  // urgency reads at a glance — same hue as the Clock icon, with the text
  // inverted to the page background colour so it pops against the chip.
  const markChunks = (chunks) => (
    <mark className="inline-block whitespace-nowrap rounded-md bg-warning px-1.5 py-0.5 text-background">
      {chunks}
    </mark>
  );
  const title = months != null && months > 0
    ? t.rich('updates.result.eolSoon.titleMonths', {
        label: displayLabel,
        months,
        mark: markChunks,
      })
    : t.rich('updates.result.eolSoon.titleSoon', {
        label: displayLabel,
        mark: markChunks,
      });

  const subtitle = eolDate
    ? t.rich('updates.result.eolSoon.subtitleDate', {
        date: formatMonthYear(eolDate),
        b: boldDateChunks,
      })
    : null;

  return (
    <>
    <DelayedSlideInBox delayMs={STAGGER_FIRST_MS}>
      <ResultBox tone="amber" icon={Clock} title={title} subtitle={subtitle}>
        <PrescriptionLine formFactor={product.formFactor} urgency="plan" />
        <ThreatModelBlock />
        <BuyingGuidance family={product.family} formFactor={product.formFactor} />
        <ResultActions product={product} onReset={onReset} />
      </ResultBox>
    </DelayedSlideInBox>
    <DelayedSlideInBox delayMs={STAGGER_SECOND_MS} connectorTone="warning">
      <EssentialsPanel />
    </DelayedSlideInBox>
    </>
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

  // Pick the most accurate "stopped getting updates on" date for the title chip.
  // Different EOL paths have the date in different places: eolFrom-past uses the
  // device's own eolFrom; eoas-past uses eoasFrom; device-max-os-eol stores the
  // OS major's eolFrom in classification.effectiveEolFrom. The other reasons
  // (unmaintained / age-heuristic / user-stuck-on-old-os / isEol-true with no
  // date) leave us without a date and fall back to the date-less title.
  let agoDate = null;
  if (classification.reason === 'eolFrom-past' && release.eolFrom) {
    agoDate = release.eolFrom;
  } else if (classification.reason === 'eoas-past' && release.eoasFrom) {
    agoDate = release.eoasFrom;
  } else if (classification.reason === 'device-max-os-eol' && classification.effectiveEolFrom) {
    agoDate = classification.effectiveEolFrom;
  } else if (classification.reason === 'isEol-true' && release.eolFrom) {
    agoDate = release.eolFrom;
  }
  const since = formatTimeSince(agoDate);

  // Highlight the time-ago phrase as a destructive-toned chip — same hue as
  // the XCircle icon, with text inverted to the page background colour so the
  // chip pops out of the title.
  const markChunks = (chunks) => (
    <mark className="inline-block whitespace-nowrap rounded-md bg-destructive px-1.5 py-0.5 text-background">
      {chunks}
    </mark>
  );
  let title;
  if (since?.years) {
    title = t.rich('updates.result.deviceUnsupportedTitleAgoYears', {
      label: displayLabel,
      years: since.years,
      mark: markChunks,
    });
  } else if (since?.months) {
    title = t.rich('updates.result.deviceUnsupportedTitleAgoMonths', {
      label: displayLabel,
      months: since.months,
      mark: markChunks,
    });
  } else {
    title = t('updates.result.deviceUnsupportedTitle', { label: displayLabel });
  }

  return (
    <ResultBox
      tone="red"
      icon={XCircle}
      title={title}
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
    <>
      <DelayedSlideInBox delayMs={STAGGER_FIRST_MS}>
        <DeviceEolBox {...props} />
      </DelayedSlideInBox>
      <DelayedSlideInBox delayMs={STAGGER_SECOND_MS} connectorTone="destructive">
        <EssentialsPanel />
      </DelayedSlideInBox>
    </>
  );
}

function OsSupported({ product, release, onReset }) {
  const t = useTranslations();
  const displayLabel = buildDisplayLabel(product, release);

  return (
    <>
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
    <DelayedSlideInBox delayMs={STAGGER_SECOND_MS} connectorTone="success">
      <EssentialsPanel />
    </DelayedSlideInBox>
    </>
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
    <>
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
    <DelayedSlideInBox delayMs={STAGGER_SECOND_MS} connectorTone="destructive">
      <EssentialsPanel />
    </DelayedSlideInBox>
    </>
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
