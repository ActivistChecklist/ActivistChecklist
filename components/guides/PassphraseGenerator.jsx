'use client';

import { Fragment, useEffect, useId, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useTranslations } from 'next-intl';
import { Check, Copy, Info, Lock, RefreshCw, SlidersHorizontal, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAnalytics } from '@/hooks/use-analytics';
import { useIsPrinting } from '@/hooks/use-is-printing';
import { cn } from '@/lib/utils';
import {
  DEFAULT_OPTIONS,
  DEFAULT_WORD_COUNT,
  FULL_METER_BITS,
  LIST_BITS_PER_LETTER,
  SEPARATORS,
  WEAK_BITS,
  WORD_COUNTS,
  drawPassphrase,
  formatWords,
  joinWords,
  passphraseBits,
} from '@/lib/passphrase-generator';

// Neither list ships in the page's main JavaScript, so a slow phone can show
// the page before it has the words. The short list (about 7 KB) starts
// loading when the generator mounts. The long one (about 158 KB) only loads
// if the reader picks it in Options.
const WORDLISTS = {
  short: () => import('@/lib/wordlists/orchard-street-alpha').then((m) => m.default),
  long: () => import('@/lib/wordlists/orchard-street-long').then((m) => m.default),
};
const LIST_LABELS = {
  short: ['listShort', 'listShortDescription'],
  long: ['listLong', 'listLongDescription'],
};
const SEPARATOR_LABELS = {
  space: 'separatorSpace',
  hyphen: 'separatorHyphen',
  period: 'separatorPeriod',
  none: 'separatorNone',
};

// Holds the first passphrase's place until it is made, without putting
// stand-in words in the HTML where someone could mistake them for a real one.
const PENDING_PLACEHOLDER = ' '.repeat(28);
const PENDING_CLASSES = 'rounded-md bg-foreground/10 motion-safe:animate-pulse';
const NEW_PHRASE_CLASSES =
  'motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-300';
// Every control in the toolbar is the same height as the word count picker.
const TOOLBAR_BUTTON_CLASSES = 'h-10 px-4 font-heading text-[0.9375rem] font-semibold';
const SEGMENT_CLASSES =
  'grid h-10 min-w-11 place-items-center rounded-md px-2.5 font-heading font-bold text-foreground transition-colors peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary peer-[:not(:checked):hover]:bg-muted';

// Same as PasscodeGenerator: without JavaScript no passphrase can be made, so
// hide the generator rather than leave buttons that do nothing.
// The list size travels with the draw, so the strength shown always matches
// the words on screen, even while a newly picked list is still loading.
const makeDraw = (words, n) => ({ ...drawPassphrase(words, n), listSize: words.length });

const hideWithoutJs = (
  <noscript>
    <style>{'[data-passphrase-generator]{display:none}'}</style>
  </noscript>
);

/**
 * The words with their separators, as plain text so a selection copies
 * exactly what the reader should type. <wbr> lets a long passphrase wrap
 * between words without adding a character. With no separator, every other
 * word is tinted so the word boundaries are still easy to see.
 */
function PassphraseWords({ words, separator }) {
  const sep = SEPARATORS[separator];
  return words.map((word, i) => (
    <Fragment key={i}>
      {i > 0 && sep === ' ' && ' '}
      {i > 0 && sep && sep !== ' ' && <span className="text-primary">{sep}</span>}
      {i > 0 && sep !== ' ' && <wbr />}
      <span className={cn(separator === 'none' && i % 2 === 1 && 'text-primary')}>{word}</span>
    </Fragment>
  ));
}

function Segments({ name, choices, value, onChange, labelClassName, className }) {
  return (
    <div
      className={cn(
        'inline-flex flex-wrap gap-0.5 rounded-lg border border-border bg-background p-0.5',
        className,
      )}
    >
      {choices.map((choice) => (
        <label key={choice.value} className="relative">
          <input
            type="radio"
            name={name}
            value={choice.value}
            checked={value === choice.value}
            onChange={() => onChange(choice.value)}
            className="peer absolute inset-0 m-0 h-full w-full cursor-pointer opacity-0"
          />
          <span className={cn(SEGMENT_CLASSES, labelClassName)}>{choice.label}</span>
        </label>
      ))}
    </div>
  );
}

/**
 * Random passphrase for /passphrase/. Laid out like the hero PasscodeGenerator
 * so the two pages feel the same: a large result, a New passphrase button and a
 * word count picker, with everything else behind Options.
 *
 * - Made only in the reader's browser, once the word list has loaded after
 *   mount, for the same reasons as the passcode: no passphrase in the static
 *   HTML or the search index.
 * - Renders nothing while printing.
 * - Unlike the passcode, this one can be copied, since password managers and
 *   laptop setup screens accept paste: with the Copy button, or by clicking
 *   the passphrase. Both hide in a browser with no clipboard API (or outside a
 *   secure context).
 * - Changing the separator, capitals, number or symbol rewrites the same
 *   draw. Only New passphrase, a new word count or a new list draws again.
 * - Each new draw the reader asks for sends one `passphrase_generated` event
 *   with no data, as the passcode does.
 */
export default function PassphraseGenerator({ anchorId }) {
  const t = useTranslations();
  const isPrinting = useIsPrinting();
  const { trackEvent } = useAnalytics();
  const id = useId();
  const [count, setCount] = useState(DEFAULT_WORD_COUNT);
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [loadedLists, setLoadedLists] = useState({});
  const [draw, setDraw] = useState(null);
  const [unavailable, setUnavailable] = useState(false);
  const [refreshes, setRefreshes] = useState(0);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [clipboardMissing, setClipboardMissing] = useState(false);
  // The text last copied, so "Copied" goes away as soon as the passphrase
  // changes, and on its own after a couple of seconds.
  const [copiedText, setCopiedText] = useState(null);
  const copiedTimer = useRef(null);
  const phraseRef = useRef(null);
  const [strengthOpen, setStrengthOpen] = useState(false);
  // True while the strength popover is open because of a mouse hover, rather
  // than a click, tap or key press. A hover-opened popover doesn't take focus,
  // and a click on the bar doesn't close it again.
  const strengthByHover = useRef(false);
  const strengthCloseTimer = useRef(null);
  // The list the reader picked last, so a slow load for a list they have
  // already switched away from doesn't replace the passphrase.
  const chosenList = useRef(DEFAULT_OPTIONS.list);
  // The word count picked last, for a list that finishes loading after the
  // reader changed the count
  const countRef = useRef(DEFAULT_WORD_COUNT);
  // How the last press on the passphrase was made: "mouse", "touch" or "pen"
  const pointerType = useRef(null);
  const [listError, setListError] = useState(false);

  // Undefined until the chosen list has loaded
  const wordlist = loadedLists[options.list];

  useEffect(() => {
    let unmounted = false;
    const list = DEFAULT_OPTIONS.list;
    WORDLISTS[list]()
      .then((words) => {
        if (unmounted) return;
        setLoadedLists((lists) => ({ ...lists, [list]: words }));
        // The reader may have picked the other list while this one loaded
        if (chosenList.current === list) setDraw(makeDraw(words, DEFAULT_WORD_COUNT));
      })
      .catch(() => {
        // No crypto.getRandomValues, or the list couldn't be downloaded.
        // Either way there's no passphrase to show, so hide the generator
        // rather than leave a placeholder that never fills in.
        if (!unmounted) setUnavailable(true);
      });
    if (!navigator.clipboard?.writeText) setClipboardMissing(true);
    return () => {
      unmounted = true;
      clearTimeout(copiedTimer.current);
      clearTimeout(strengthCloseTimer.current);
    };
  }, []);

  useEffect(() => {
    // Same as PasscodeGenerator: don't let Back show the same passphrase again
    // from the back/forward cache. This only covers full page loads. Client
    // navigations unmount the page, so Back draws a new one, but turning on
    // `cacheComponents` in next.config.js would change that: Next would keep
    // the page alive in <Activity> and Back would show the same passphrase,
    // with no pagehide. Reset the draw when the page is hidden before turning
    // it on (see "Preserving UI state" in node_modules/next/dist/docs).
    const replaceOnPageHide = (event) => {
      if (!event.persisted) return;
      flushSync(() =>
        setDraw((current) =>
          current && wordlist ? makeDraw(wordlist, current.words.length) : current,
        ),
      );
    };
    window.addEventListener('pagehide', replaceOnPageHide);
    return () => window.removeEventListener('pagehide', replaceOnPageHide);
  }, [wordlist]);

  if (isPrinting || unavailable) return null;

  const generate = (n, words = wordlist) => {
    // Nothing to draw from until the list has loaded
    if (!words) return;
    countRef.current = n;
    setCount(n);
    setDraw(makeDraw(words, n));
    trackEvent({ name: 'passphrase_generated' });
  };

  const refresh = () => {
    setRefreshes((n) => n + 1);
    generate(count);
  };

  const chooseList = async (key) => {
    const previous = chosenList.current;
    chosenList.current = key;
    setListError(false);
    setOptions((o) => ({ ...o, list: key }));
    let words = loadedLists[key];
    if (!words) {
      try {
        words = await WORDLISTS[key]();
      } catch {
        // The list couldn't be downloaded (a dropped connection, or a deploy
        // since the page loaded removed the old file). Go back to the list
        // the passphrase on screen came from, and say so, so the reader
        // doesn't think they have the bigger list.
        if (chosenList.current === key) {
          chosenList.current = previous;
          setOptions((o) => ({ ...o, list: previous }));
          setListError(true);
        }
        return;
      }
    }
    if (chosenList.current !== key) return;
    setLoadedLists((lists) => ({ ...lists, [key]: words }));
    generate(countRef.current, words);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // The browser refused (some embedded browsers always do). Select the
      // passphrase instead, so the reader can copy it with their keyboard.
      if (phraseRef.current) window.getSelection()?.selectAllChildren(phraseRef.current);
      return;
    }
    setCopiedText(text);
    clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopiedText(null), 2000);
  };

  const setOption = (name, value) => setOptions((o) => ({ ...o, [name]: value }));

  const resetOptions = () => {
    if (options.list !== DEFAULT_OPTIONS.list) chooseList(DEFAULT_OPTIONS.list);
    setOptions(DEFAULT_OPTIONS);
  };

  const shownWords = draw ? formatWords(draw, options) : null;
  const text = shownWords ? joinWords(shownWords, options.separator) : '';
  const bits = draw ? passphraseBits(draw.listSize, draw.words.length, options) : null;
  const copied = draw !== null && copiedText === text;
  const clickToCopy = draw !== null && !clipboardMissing;
  // A tap on a phone fires click too, and a tap is often just to look or
  // zoom. Copying then would put the passphrase on the clipboard (and into
  // keyboard clipboard history, or a synced clipboard) without the reader
  // asking. So only a mouse click copies; everyone else uses the Copy button.
  const copyOnMouseClick = () => {
    if (pointerType.current === 'mouse') copy();
  };

  const refreshIcon = (
    <RefreshCw
      key={refreshes}
      aria-hidden="true"
      className={cn(refreshes > 0 && 'motion-safe:animate-half-turn')}
    />
  );

  // translate="no" so browser translation never sends the passphrase off to be
  // translated. Some things outside the page still see it and can't be
  // switched off from here: app switcher snapshots, Windows Recall, screen
  // reader speech history and AI assistants that read the page. Only mounted once there is a passphrase, so the first one
  // isn't announced on page load.
  const announcement = draw && (
    <span translate="no" className="sr-only" aria-live="polite">
      {text}
    </span>
  );

  const countPicker = (
    <fieldset className="m-0 flex min-w-0 items-center gap-2 border-0 p-0">
      <legend className="sr-only">{t('passphraseGenerator.numberOfWords')}</legend>
      <Segments
        name={`${id}-count`}
        choices={WORD_COUNTS.map((n) => ({ value: n, label: n }))}
        value={count}
        onChange={(n) => generate(n)}
        labelClassName="h-full min-w-9 px-2 text-[0.9375rem] tabular-nums"
        className="h-10 flex-nowrap"
      />
      <span aria-hidden="true" className="text-sm text-muted-foreground">
        {t('passphraseGenerator.words')}
      </span>
    </fieldset>
  );

  const strongPhraseLink = (chunks) => (
    <a href="https://strongphrase.net/" target="_blank" rel="noopener noreferrer" className="link">
      {chunks}
    </a>
  );

  // Hover opens the strength popover for mice. Touch and keyboard use the
  // popover's own click and Enter handling.
  const hoverStrength = (entering) => (event) => {
    if (event.pointerType !== 'mouse') return;
    clearTimeout(strengthCloseTimer.current);
    if (entering) {
      if (!strengthOpen) strengthByHover.current = true;
      setStrengthOpen(true);
    } else if (strengthByHover.current) {
      // A short delay, so the pointer can cross the gap into the popover
      strengthCloseTimer.current = setTimeout(() => {
        strengthByHover.current = false;
        setStrengthOpen(false);
      }, 150);
    }
  };

  const onStrengthOpenChange = (open) => {
    if (!open) strengthByHover.current = false;
    setStrengthOpen(open);
  };

  const meterFill = bits === null ? 0 : Math.min(bits / FULL_METER_BITS, 1);

  const strengthMeter = (
    <Popover open={strengthOpen} onOpenChange={onStrengthOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={bits === null}
          aria-label={
            bits === null
              ? t('passphraseGenerator.strength')
              : t('passphraseGenerator.strengthLabel', { bits })
          }
          onPointerEnter={hoverStrength(true)}
          onPointerLeave={hoverStrength(false)}
          onClick={(event) => {
            // Keep a hover-opened popover open when the bar is clicked
            if (strengthOpen && strengthByHover.current) event.preventDefault();
          }}
          className="flex w-full items-center gap-2.5 rounded-md px-1 py-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-default"
        >
          <span
            aria-hidden="true"
            className="font-heading text-xs font-bold uppercase tracking-wider"
          >
            {t('passphraseGenerator.strength')}
          </span>
          <span
            aria-hidden="true"
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/10"
          >
            <span
              className={cn(
                'block h-full rounded-full transition-[width,background-color] duration-300',
                bits !== null && bits < WEAK_BITS ? 'bg-warning' : 'bg-success',
              )}
              // Width follows the passphrase's bits, so it can't be a class
              style={{ width: `${meterFill * 100}%` }}
            />
          </span>
          {/* The popover opens from the icon, not the middle of the bar */}
          <PopoverAnchor asChild>
            <Info aria-hidden="true" className="h-4 w-4 shrink-0" />
          </PopoverAnchor>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        alignOffset={-8}
        collisionPadding={16}
        className="grid w-80 gap-2.5 text-sm"
        onOpenAutoFocus={(event) => {
          if (strengthByHover.current) event.preventDefault();
        }}
        onPointerEnter={hoverStrength(true)}
        onPointerLeave={hoverStrength(false)}
      >
        {bits !== null && (
          <p className="m-0 font-semibold text-foreground">
            {t.rich('passphraseGenerator.optionsDialog.strength', {
              bits,
              link: strongPhraseLink,
            })}
          </p>
        )}
        <p className="m-0 text-muted-foreground">{t('passphraseGenerator.strengthExplainer')}</p>
        <div className="grid gap-1">
          <p className="m-0 font-semibold text-foreground">{t('passphraseGenerator.perLetter')}</p>
          <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 text-muted-foreground">
            {Object.keys(WORDLISTS).map((key) => (
              <Fragment key={key}>
                <dt className={cn(key === options.list && 'font-semibold text-foreground')}>
                  {t(`passphraseGenerator.optionsDialog.${LIST_LABELS[key][0]}`)}
                </dt>
                <dd
                  className={cn(
                    'm-0 text-right tabular-nums',
                    key === options.list && 'font-semibold text-foreground',
                  )}
                >
                  {t('passphraseGenerator.bitsPerLetter', { bits: LIST_BITS_PER_LETTER[key] })}
                </dd>
              </Fragment>
            ))}
          </dl>
        </div>
      </PopoverContent>
    </Popover>
  );

  const shortWarning = bits !== null && bits < WEAK_BITS && (
    <p className="m-0 flex items-start gap-2 justify-self-stretch rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
      <span>{t('passphraseGenerator.shortWarning', { count })}</span>
    </p>
  );

  const optionsDialog = (
    <Dialog open={optionsOpen} onOpenChange={setOptionsOpen}>
      {/* print:hidden as well as the isPrinting check, since the dialog is
          portaled outside the generator's print:hidden wrapper */}
      <DialogContent
        aria-describedby={undefined}
        className="max-h-[90dvh] gap-5 overflow-y-auto sm:max-w-lg print:hidden"
      >
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">
            {t('passphraseGenerator.optionsDialog.title')}
          </DialogTitle>
        </DialogHeader>

        {/* The passphrase is behind the dialog, so show it here too and let
            the reader watch each option change it */}
        <div className="grid gap-1.5">
          <div
            translate="no"
            aria-live="polite"
            className="rounded-lg border border-primary/20 bg-muted px-3 py-2.5 text-center font-mono text-lg font-semibold leading-snug text-foreground"
          >
            {shownWords && <PassphraseWords words={shownWords} separator={options.separator} />}
          </div>
          {bits !== null && (
            <p className="m-0 text-center text-sm text-muted-foreground">
              {t.rich('passphraseGenerator.optionsDialog.strength', {
                bits,
                link: strongPhraseLink,
              })}
            </p>
          )}
        </div>

        <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0">
          <legend className="mb-2 font-heading text-sm font-bold text-foreground">
            {t('passphraseGenerator.optionsDialog.wordList')}
          </legend>
          {Object.keys(WORDLISTS).map((key) => {
            const [label, description] = LIST_LABELS[key];
            return (
              <label
                key={key}
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background p-3 transition-colors hover:bg-muted has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary"
              >
                <input
                  type="radio"
                  name={`${id}-list`}
                  value={key}
                  checked={options.list === key}
                  onChange={() => chooseList(key)}
                  className="mt-1 h-4 w-4 shrink-0 accent-primary focus-visible:outline-none dark:[color-scheme:dark]"
                />
                <span className="grid gap-0.5">
                  <span className="font-semibold text-foreground">
                    {t(`passphraseGenerator.optionsDialog.${label}`)}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {t(`passphraseGenerator.optionsDialog.${description}`, {
                      bits: LIST_BITS_PER_LETTER[key],
                    })}
                  </span>
                </span>
              </label>
            );
          })}
          {/* Always in the tree so screen readers announce the error when it
              appears */}
          <p role="status" className={cn('m-0 text-sm text-destructive', !listError && 'sr-only')}>
            {listError ? t('passphraseGenerator.optionsDialog.listLoadError') : ''}
          </p>
          <p className="m-0 text-xs text-muted-foreground">
            {t.rich('passphraseGenerator.optionsDialog.listCredit', {
              link: (chunks) => (
                <a
                  href="https://sts10.github.io/2023/04/03/orchard-street-wordlists.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link"
                >
                  {chunks}
                </a>
              ),
            })}
          </p>
        </fieldset>

        <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0">
          <legend className="mb-2 font-heading text-sm font-bold text-foreground">
            {t('passphraseGenerator.optionsDialog.separator')}
          </legend>
          <Segments
            name={`${id}-separator`}
            choices={Object.keys(SEPARATORS).map((key) => ({
              value: key,
              label: t(`passphraseGenerator.optionsDialog.${SEPARATOR_LABELS[key]}`),
            }))}
            value={options.separator}
            onChange={(key) => setOption('separator', key)}
            labelClassName="text-sm"
            className="justify-self-start"
          />
        </fieldset>

        <fieldset className="m-0 grid min-w-0 gap-3 border-0 p-0">
          <legend className="mb-2 font-heading text-sm font-bold text-foreground">
            {t('passphraseGenerator.optionsDialog.extras')}
          </legend>
          {['capitalize', 'addNumber', 'addSymbol'].map((name) => (
            <div key={name} className="flex items-center gap-3">
              <Checkbox
                id={`${id}-${name}`}
                checked={options[name]}
                onCheckedChange={(checked) => setOption(name, checked === true)}
                className="h-5 w-5"
              />
              <label htmlFor={`${id}-${name}`} className="cursor-pointer text-foreground">
                {t(`passphraseGenerator.optionsDialog.${name}`)}
              </label>
            </div>
          ))}
        </fieldset>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="ghost" onClick={resetOptions}>
            {t('passphraseGenerator.optionsDialog.reset')}
          </Button>
          <Button type="button" onClick={() => setOptionsOpen(false)} className="font-heading">
            {t('passphraseGenerator.optionsDialog.done')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return (
    <div
      id={anchorId}
      data-passphrase-generator
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
          {t('passphraseGenerator.label')}
        </span>
        {/* Clicking the passphrase copies it too. This is for mice only (see
            copyOnMouseClick): the Copy button is the way in for touch,
            keyboards and screen readers, so the box doesn't add a second tab
            stop that does the same thing. */}
        <div
          onPointerDown={(event) => (pointerType.current = event.pointerType)}
          onClick={clickToCopy ? copyOnMouseClick : undefined}
          title={clickToCopy ? t('passphraseGenerator.copy') : undefined}
          className={cn(
            'relative grid min-h-[6.25rem] w-full place-items-center rounded-xl border border-primary/20 bg-muted px-3 py-4 transition-colors sm:min-h-[7.5rem] sm:px-6',
            clickToCopy && 'cursor-pointer hover:border-primary/60',
          )}
        >
          {/* Straddles the top edge so it never covers the words or the
              strength bar. It fades back out when `copied` turns off two
              seconds later. */}
          <span
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute -top-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 font-heading text-sm font-semibold text-primary-foreground shadow-sm transition-opacity duration-500',
              copied ? 'opacity-100' : 'opacity-0',
            )}
          >
            <Check className="h-3.5 w-3.5" />
            {t('passphraseGenerator.copied')}
          </span>
          <span
            key={text || 'pending'}
            ref={phraseRef}
            translate="no"
            aria-hidden="true"
            className={cn(
              'max-w-full text-balance break-words text-center font-mono text-2xl font-semibold leading-snug text-foreground sm:text-[2rem]',
              draw ? NEW_PHRASE_CLASSES : PENDING_CLASSES,
            )}
          >
            {shownWords ? (
              <PassphraseWords words={shownWords} separator={options.separator} />
            ) : (
              PENDING_PLACEHOLDER
            )}
          </span>
          {announcement}
        </div>
        {strengthMeter}
        {/* One row: actions on the left, settings on the right. On phones it
            wraps into those two groups, with Copy and Options as icons. */}
        <div className="flex w-full flex-wrap items-center justify-center gap-x-3 gap-y-2.5">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={refresh}
              disabled={!draw}
              className={TOOLBAR_BUTTON_CLASSES}
            >
              {refreshIcon}
              {t('passphraseGenerator.newPassphrase')}
            </Button>
            {!clipboardMissing && (
              <Button
                type="button"
                variant="outline"
                onClick={copy}
                disabled={!draw}
                title={t('passphraseGenerator.copy')}
                className={cn(TOOLBAR_BUTTON_CLASSES, 'px-3 sm:px-3.5')}
              >
                {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                {/* The label stays "Copy" so the button never changes width
                    and wraps the toolbar. The pill on the passphrase says
                    "Copied", and the live region below announces it. */}
                <span className="sr-only sm:not-sr-only">{t('passphraseGenerator.copy')}</span>
              </Button>
            )}
          </div>
          <div aria-hidden="true" className="hidden h-6 w-px bg-border md:block" />
          <div className="flex items-center gap-2">
            {countPicker}
            <Button
              type="button"
              variant="outline"
              aria-haspopup="dialog"
              onClick={() => setOptionsOpen(true)}
              title={t('passphraseGenerator.options')}
              className={cn(TOOLBAR_BUTTON_CLASSES, 'px-3 sm:px-3.5')}
            >
              <SlidersHorizontal aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">{t('passphraseGenerator.options')}</span>
            </Button>
          </div>
          <span className="sr-only" aria-live="polite">
            {copied ? t('passphraseGenerator.copied') : ''}
          </span>
        </div>
        {shortWarning}
      </section>
      <p className="m-0 flex items-start gap-2 px-1 text-sm text-muted-foreground">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          {t.rich('passphraseGenerator.privacy', {
            // The password manager checklist item is pinned open further down
            // /passphrase/, so jump to it there. A bare hash keeps the reader
            // on the current page in every locale, so this isn't the Link
            // component.
            link: (chunks) => (
              <a href="#password-manager" className="link">
                {chunks}
              </a>
            ),
          })}
        </span>
      </p>
      {optionsDialog}
    </div>
  );
}
