'use client';

import { useEffect, useId, useState } from 'react';
import { flushSync } from 'react-dom';
import { useTranslations } from 'next-intl';
import { Lock, RefreshCw, TriangleAlert } from 'lucide-react';
import Link from '@/components/Link';
import { Button } from '@/components/ui/button';
import { useAnalytics } from '@/hooks/use-analytics';
import { useIsPrinting } from '@/hooks/use-is-printing';
import { cn } from '@/lib/utils';
import {
  DEFAULT_PASSCODE_LENGTH,
  PASSCODE_LENGTHS,
  groupDigits,
  randomDigits,
} from '@/lib/passcode-generator';

const LONGEST_PLACEHOLDER = '0'.repeat(Math.max(...PASSCODE_LENGTHS));
// Holds the first code's place until it is made. Non-breaking spaces take up
// the same width as digits in the monospace font, and no stand-in digits end
// up in the HTML where someone could mistake them for a passcode.
const PENDING_PLACEHOLDER = '\u00a0'.repeat(DEFAULT_PASSCODE_LENGTH);
const PENDING_CLASSES = 'rounded-md bg-foreground/10 motion-safe:animate-pulse';
const NEW_CODE_CLASSES =
  'motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-300';

// Without JavaScript no code can ever be made, so hide the generator rather
// than leave a placeholder and buttons that do nothing. A <noscript> style,
// not a CSS media query, because Tor Browser's safest mode blocks scripts in
// a way the `scripting` media feature doesn't report.
const hideWithoutJs = (
  <noscript>
    <style>{'[data-passcode-generator]{display:none}'}</style>
  </noscript>
);

function DigitGroups({ digits }) {
  return groupDigits(digits).map((group, i) => (
    <span key={i} className="whitespace-nowrap">
      {group}
    </span>
  ));
}

/**
 * Random phone passcode.
 *
 * - `variant="inline"` (the default) sits inside the passcode checklist item
 *   as <PasscodeGenerator />. `variant="hero"` is the large version at the top
 *   of /passcode/.
 * - The code is only made in the reader's browser, after mount. Making it
 *   during render would put one code into the static HTML (and the search
 *   index) for every reader. Until then the generator renders with a pulsing
 *   placeholder the size of the first code, so the page doesn't shift when
 *   the code appears.
 * - Renders nothing while printing. The PDF export runs this page's
 *   JavaScript and fires `beforeprint`, so without this one code would be
 *   printed into every guide PDF.
 * - The code is plain text, never a form field, and is never stored, copied
 *   or sent anywhere. There is no copy button on purpose: phone passcode
 *   screens don't accept paste, and a copied code can end up in clipboard
 *   history or sync to other devices.
 * - Each code the reader asks for (New passcode, or picking a length) sends
 *   one `passcode_generated` event with no data, so the count says nothing
 *   about which length they chose. The code made on mount is not counted: the
 *   inline generator mounts on every guide view, even inside a collapsed item.
 */
export default function PasscodeGenerator({ variant = 'inline' }) {
  const t = useTranslations();
  const isPrinting = useIsPrinting();
  const { trackEvent } = useAnalytics();
  const id = useId();
  const [length, setLength] = useState(DEFAULT_PASSCODE_LENGTH);
  const [code, setCode] = useState(null);
  const [unavailable, setUnavailable] = useState(false);
  // Counts New passcode clicks. Keying the refresh icon on it remounts the
  // icon, so its half turn plays on every click, not just the first.
  const [refreshes, setRefreshes] = useState(0);

  useEffect(() => {
    // randomDigits throws rather than fall back to weak randomness. In a
    // browser without crypto.getRandomValues, show nothing instead of letting
    // the error take down the page.
    try {
      setCode(randomDigits(DEFAULT_PASSCODE_LENGTH));
    } catch {
      setUnavailable(true);
    }
  }, []);

  useEffect(() => {
    // A full page navigation (to another site, say) can park this page in the
    // back/forward cache with the code still on screen, and Back would show
    // that same code again. Swap in a new one on the way out, as moving between
    // pages of this site already does. flushSync, because the browser freezes
    // the page as soon as this handler returns.
    const replaceOnPageHide = (event) => {
      if (!event.persisted) return;
      flushSync(() => setCode((current) => (current ? randomDigits(length) : current)));
    };
    window.addEventListener('pagehide', replaceOnPageHide);
    return () => window.removeEventListener('pagehide', replaceOnPageHide);
  }, [length]);

  if (isPrinting || unavailable) return null;

  const generate = (n) => {
    setLength(n);
    setCode(randomDigits(n));
    trackEvent({ name: 'passcode_generated' });
  };

  const refresh = () => {
    setRefreshes((n) => n + 1);
    generate(length);
  };

  const refreshIcon = (
    <RefreshCw
      key={refreshes}
      aria-hidden="true"
      className={cn(
        variant === 'inline' && 'h-5 w-5',
        refreshes > 0 && 'motion-safe:animate-half-turn',
      )}
    />
  );

  // Read one digit at a time, and announced again when it changes.
  // translate="no" here too, or browser translation still sends the code for
  // translating. Only mounted once there is a code, so the first code isn't
  // announced on page load.
  const announcement = code && (
    <span translate="no" className="sr-only" aria-live="polite">
      {code.split('').join(' ')}
    </span>
  );

  // key restarts the fade-in each time the code changes
  const codeKey = code ?? 'pending';
  const codeClasses = code ? NEW_CODE_CLASSES : PENDING_CLASSES;
  const shownDigits = <DigitGroups digits={code ?? PENDING_PLACEHOLDER} />;

  const lengthPicker = (
    <fieldset className="m-0 flex min-w-0 items-center gap-2 border-0 p-0">
      <legend className="sr-only">{t('passcodeGenerator.numberOfDigits')}</legend>
      <div className="inline-flex gap-0.5 rounded-lg border border-border bg-background p-0.5">
        {PASSCODE_LENGTHS.map((n) => (
          <label key={n} className="relative">
            <input
              type="radio"
              name={`${id}-length`}
              value={n}
              checked={length === n}
              onChange={() => generate(n)}
              className="peer absolute inset-0 m-0 h-full w-full cursor-pointer opacity-0"
            />
            <span className="grid h-10 min-w-11 place-items-center rounded-md px-2.5 font-heading text-base font-bold tabular-nums text-foreground transition-colors peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary peer-[:not(:checked):hover]:bg-muted">
              {n}
            </span>
          </label>
        ))}
      </div>
      <span aria-hidden="true" className="text-[0.9375rem] text-muted-foreground">
        {t('passcodeGenerator.digits')}
      </span>
    </fieldset>
  );

  const sixDigitWarning = (className) =>
    length === 6 && (
      <p
        className={cn(
          'm-0 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground',
          className,
        )}
      >
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
        <span>{t('passcodeGenerator.sixDigitWarning')}</span>
      </p>
    );

  const privacyNote = (className) => (
    <p className={cn('m-0 flex items-start gap-2 text-sm text-muted-foreground', className)}>
      <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>
        {t.rich('passcodeGenerator.privacy', {
          link: (chunks) => (
            <Link href="/essentials/#password-manager" className="link">
              {chunks}
            </Link>
          ),
        })}
      </span>
    </p>
  );

  if (variant === 'hero') {
    return (
      <div
        data-passcode-generator
        data-pagefind-ignore
        className="not-prose mx-auto grid w-full max-w-2xl gap-3.5 print:hidden"
      >
        {hideWithoutJs}
        <section
          aria-labelledby={`${id}-label`}
          className="grid justify-items-center gap-4 rounded-2xl border border-primary/20 bg-card p-4 shadow-sm sm:p-6"
        >
          <span
            id={`${id}-label`}
            className="font-heading text-xs font-bold uppercase tracking-wider text-muted-foreground"
          >
            {t('passcodeGenerator.label')}
          </span>
          <div className="grid w-full place-items-center rounded-xl border border-primary/20 bg-muted px-3 py-4 sm:px-6">
            <span
              key={codeKey}
              translate="no"
              aria-hidden="true"
              className={cn(
                'flex flex-wrap justify-center gap-x-[0.4em] font-mono text-[2rem] font-semibold leading-tight tabular-nums tracking-wide text-foreground sm:text-5xl',
                codeClasses,
              )}
            >
              {shownDigits}
            </span>
            {announcement}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3">
            <Button
              type="button"
              onClick={refresh}
              className="h-12 px-5 font-heading text-base font-semibold [&_svg]:size-[1.125rem]"
            >
              {refreshIcon}
              {t('passcodeGenerator.newPasscode')}
            </Button>
            {lengthPicker}
          </div>
          {sixDigitWarning('justify-self-stretch')}
        </section>
        {privacyNote('px-1')}
      </div>
    );
  }

  return (
    <div
      data-passcode-generator
      data-pagefind-ignore
      className="not-prose mt-3 mb-1 grid gap-2 print:hidden"
    >
      {hideWithoutJs}
      <span
        id={`${id}-label`}
        className="font-heading text-xs font-bold uppercase tracking-wider text-muted-foreground"
      >
        {t('passcodeGenerator.label')}
      </span>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
        <div
          role="group"
          aria-labelledby={`${id}-label`}
          className="inline-flex min-h-12 items-center gap-0.5 rounded-lg border border-primary/20 bg-muted pl-3.5"
        >
          {/* An invisible longest code shares the grid cell, so the box is
              always 10 digits wide and the controls don't move when the
              reader switches length */}
          <span
            translate="no"
            aria-hidden="true"
            className="grid font-mono text-xl font-semibold tabular-nums tracking-wide text-foreground sm:text-2xl"
          >
            <span className="invisible col-start-1 row-start-1 flex flex-wrap gap-x-[0.4em]">
              <DigitGroups digits={LONGEST_PLACEHOLDER} />
            </span>
            <span
              key={codeKey}
              className={cn(
                'col-start-1 row-start-1 flex flex-wrap gap-x-[0.4em] justify-self-start',
                codeClasses,
              )}
            >
              {shownDigits}
            </span>
          </span>
          {announcement}
          <button
            type="button"
            onClick={refresh}
            aria-label={t('passcodeGenerator.newPasscode')}
            title={t('passcodeGenerator.newPasscode')}
            className="grid h-12 w-12 shrink-0 place-items-center rounded-md text-primary transition-colors hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {refreshIcon}
          </button>
        </div>
        {lengthPicker}
      </div>
      {sixDigitWarning()}
      {privacyNote()}
    </div>
  );
}
