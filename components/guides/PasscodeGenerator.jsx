'use client';

import { useEffect, useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Lock, RefreshCw, TriangleAlert } from 'lucide-react';
import { useIsPrinting } from '@/hooks/use-is-printing';
import {
  DEFAULT_PASSCODE_LENGTH,
  PASSCODE_LENGTHS,
  groupDigits,
  randomDigits,
} from '@/lib/passcode-generator';

const LONGEST_PLACEHOLDER = '0'.repeat(Math.max(...PASSCODE_LENGTHS));

/**
 * Random phone passcode, used in the passcode checklist item as
 * <PasscodeGenerator />.
 *
 * - The code is only made in the reader's browser, after mount. Making it
 *   during render would put one code into the static HTML (and the search
 *   index) for every reader.
 * - Renders nothing while printing. The PDF export runs this page's
 *   JavaScript and fires `beforeprint`, so without this one code would be
 *   printed into every guide PDF.
 * - The code is plain text, never a form field, and is never stored, copied
 *   or sent anywhere. There is no copy button on purpose: phone passcode
 *   screens don't accept paste, and a copied code can end up in clipboard
 *   history or sync to other devices.
 */
export default function PasscodeGenerator() {
  const t = useTranslations();
  const isPrinting = useIsPrinting();
  const id = useId();
  const [length, setLength] = useState(DEFAULT_PASSCODE_LENGTH);
  const [code, setCode] = useState(null);

  useEffect(() => {
    setCode(randomDigits(DEFAULT_PASSCODE_LENGTH));
  }, []);

  if (isPrinting || !code) return null;

  const chooseLength = (n) => {
    setLength(n);
    setCode(randomDigits(n));
  };

  return (
    <div className="not-prose mt-3 mb-1 grid gap-2 print:hidden">
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
            className="grid font-heading text-xl font-semibold tabular-nums tracking-wide text-foreground sm:text-2xl"
          >
            <span className="invisible col-start-1 row-start-1 flex flex-wrap gap-x-[0.4em]">
              {groupDigits(LONGEST_PLACEHOLDER).map((group, i) => (
                <span key={i} className="whitespace-nowrap">
                  {group}
                </span>
              ))}
            </span>
            {/* key restarts the fade-in each time the code changes */}
            <span
              key={code}
              className="col-start-1 row-start-1 flex flex-wrap gap-x-[0.4em] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-300"
            >
              {groupDigits(code).map((group, i) => (
                <span key={i} className="whitespace-nowrap">
                  {group}
                </span>
              ))}
            </span>
          </span>
          {/* Read one digit at a time, and announced again when it changes */}
          <span className="sr-only" aria-live="polite">
            {code.split('').join(' ')}
          </span>
          <button
            type="button"
            onClick={() => setCode(randomDigits(length))}
            aria-label={t('passcodeGenerator.newPasscode')}
            title={t('passcodeGenerator.newPasscode')}
            className="grid h-12 w-12 shrink-0 place-items-center rounded-md text-primary transition-colors hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <RefreshCw className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
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
                  onChange={() => chooseLength(n)}
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
      </div>
      {length === 6 && (
        <p className="m-0 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          <span>{t('passcodeGenerator.sixDigitWarning')}</span>
        </p>
      )}
      <p className="m-0 flex items-start gap-2 text-sm text-muted-foreground">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{t('passcodeGenerator.privacy')}</span>
      </p>
    </div>
  );
}
